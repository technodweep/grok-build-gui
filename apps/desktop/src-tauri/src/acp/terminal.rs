//! ACP client terminal host (`terminal/create|output|wait_for_exit|kill|release`).

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;

use parking_lot::Mutex;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Notify;

use crate::events;

const DEFAULT_OUTPUT_LIMIT: usize = 1_048_576;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSnapshot {
    pub terminal_id: String,
    pub session_id: Option<String>,
    pub command: String,
    pub cwd: Option<String>,
    pub output: String,
    pub truncated: bool,
    pub exit_code: Option<i32>,
    pub signal: Option<String>,
    pub running: bool,
}

struct ManagedTerminal {
    session_id: Option<String>,
    command: String,
    cwd: Option<String>,
    child: Option<Child>,
    output: String,
    truncated: bool,
    byte_limit: usize,
    exit_code: Option<i32>,
    signal: Option<String>,
    done: Arc<Notify>,
}

#[derive(Default)]
pub struct TerminalManager {
    inner: Mutex<HashMap<String, ManagedTerminal>>,
}

impl TerminalManager {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            inner: Mutex::new(HashMap::new()),
        })
    }

    pub fn list_snapshots(&self) -> Vec<TerminalSnapshot> {
        self.inner
            .lock()
            .iter()
            .map(|(id, t)| TerminalSnapshot {
                terminal_id: id.clone(),
                session_id: t.session_id.clone(),
                command: t.command.clone(),
                cwd: t.cwd.clone(),
                output: t.output.clone(),
                truncated: t.truncated,
                exit_code: t.exit_code,
                signal: t.signal.clone(),
                running: t.child.is_some() && t.exit_code.is_none() && t.signal.is_none(),
            })
            .collect()
    }

    pub async fn create(
        self: &Arc<Self>,
        app: AppHandle,
        params: &Option<Value>,
        default_cwd: &std::path::Path,
    ) -> Result<Value, String> {
        let command = params
            .as_ref()
            .and_then(|p| p.get("command"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| "terminal/create missing command".to_string())?
            .to_string();

        let args: Vec<String> = params
            .as_ref()
            .and_then(|p| p.get("args"))
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|a| a.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        let session_id = params
            .as_ref()
            .and_then(|p| p.get("sessionId"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let cwd = params
            .as_ref()
            .and_then(|p| p.get("cwd"))
            .and_then(|v| v.as_str())
            .map(PathBuf::from)
            .unwrap_or_else(|| default_cwd.to_path_buf());

        let byte_limit = params
            .as_ref()
            .and_then(|p| p.get("outputByteLimit"))
            .and_then(|v| v.as_u64())
            .map(|n| n as usize)
            .unwrap_or(DEFAULT_OUTPUT_LIMIT)
            .max(1024);

        let mut cmd = Command::new(&command);
        cmd.args(&args)
            .current_dir(&cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        if let Some(env_arr) = params
            .as_ref()
            .and_then(|p| p.get("env"))
            .and_then(|v| v.as_array())
        {
            for item in env_arr {
                if let (Some(name), Some(value)) = (
                    item.get("name").and_then(|v| v.as_str()),
                    item.get("value").and_then(|v| v.as_str()),
                ) {
                    cmd.env(name, value);
                }
            }
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("failed to spawn `{command}`: {e}"))?;

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let terminal_id = format!(
            "term_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );
        let done = Arc::new(Notify::new());

        let display_cmd = if args.is_empty() {
            command.clone()
        } else {
            format!("{command} {}", args.join(" "))
        };

        {
            let mut map = self.inner.lock();
            map.insert(
                terminal_id.clone(),
                ManagedTerminal {
                    session_id: session_id.clone(),
                    command: display_cmd.clone(),
                    cwd: Some(cwd.display().to_string()),
                    child: Some(child),
                    output: String::new(),
                    truncated: false,
                    byte_limit,
                    exit_code: None,
                    signal: None,
                    done: done.clone(),
                },
            );
        }

        let mgr = Arc::clone(self);
        let tid_out = terminal_id.clone();
        let app_out = app.clone();
        if let Some(out) = stdout {
            tokio::spawn(async move {
                pipe_output(mgr, tid_out, app_out, out, false).await;
            });
        }

        let mgr = Arc::clone(self);
        let tid_err = terminal_id.clone();
        let app_err = app.clone();
        if let Some(err) = stderr {
            tokio::spawn(async move {
                pipe_output(mgr, tid_err, app_err, err, true).await;
            });
        }

        // Poll for process exit without taking ownership of `Child` so kill can still work.
        let mgr = Arc::clone(self);
        let tid_wait = terminal_id.clone();
        let app_wait = app.clone();
        let done_wait = done.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(40)).await;
                let finished = {
                    let mut map = mgr.inner.lock();
                    let Some(t) = map.get_mut(&tid_wait) else {
                        done_wait.notify_waiters();
                        return;
                    };
                    if t.exit_code.is_some() || t.signal.is_some() {
                        true
                    } else if let Some(child) = t.child.as_mut() {
                        match child.try_wait() {
                            Ok(Some(status)) => {
                                t.exit_code = status.code();
                                #[cfg(unix)]
                                {
                                    use std::os::unix::process::ExitStatusExt;
                                    if let Some(sig) = status.signal() {
                                        t.signal = Some(sig.to_string());
                                    }
                                }
                                t.child = None;
                                true
                            }
                            Ok(None) => false,
                            Err(e) => {
                                t.output.push_str(&format!("\n[wait error: {e}]\n"));
                                t.child = None;
                                t.exit_code = Some(-1);
                                true
                            }
                        }
                    } else {
                        // Child already cleared without status — treat as finished.
                        t.exit_code.get_or_insert(-1);
                        true
                    }
                };
                if finished {
                    done_wait.notify_waiters();
                    emit_snapshot(&mgr, &app_wait, &tid_wait);
                    break;
                }
            }
        });

        emit_snapshot(self, &app, &terminal_id);
        Ok(json!({ "terminalId": terminal_id }))
    }

    pub fn output(&self, params: &Option<Value>) -> Result<Value, String> {
        let terminal_id = terminal_id_of(params)?;
        let map = self.inner.lock();
        let t = map
            .get(&terminal_id)
            .ok_or_else(|| format!("unknown terminal {terminal_id}"))?;
        let mut result = json!({
            "output": t.output,
            "truncated": t.truncated,
        });
        if t.exit_code.is_some() || t.signal.is_some() {
            result["exitStatus"] = json!({
                "exitCode": t.exit_code,
                "signal": t.signal,
            });
        }
        Ok(result)
    }

    pub async fn wait_for_exit(&self, params: &Option<Value>) -> Result<Value, String> {
        let terminal_id = terminal_id_of(params)?;
        let done = {
            let map = self.inner.lock();
            let t = map
                .get(&terminal_id)
                .ok_or_else(|| format!("unknown terminal {terminal_id}"))?;
            if t.exit_code.is_some() || t.signal.is_some() {
                return Ok(json!({
                    "exitCode": t.exit_code,
                    "signal": t.signal,
                }));
            }
            t.done.clone()
        };
        done.notified().await;
        let map = self.inner.lock();
        let t = map
            .get(&terminal_id)
            .ok_or_else(|| format!("unknown terminal {terminal_id}"))?;
        Ok(json!({
            "exitCode": t.exit_code,
            "signal": t.signal,
        }))
    }

    pub fn kill(&self, app: &AppHandle, params: &Option<Value>) -> Result<Value, String> {
        let terminal_id = terminal_id_of(params)?;
        {
            let mut map = self.inner.lock();
            let t = map
                .get_mut(&terminal_id)
                .ok_or_else(|| format!("unknown terminal {terminal_id}"))?;
            if let Some(child) = t.child.as_mut() {
                let _ = child.start_kill();
            }
        }
        emit_snapshot(self, app, &terminal_id);
        Ok(json!({}))
    }

    pub fn release(&self, app: &AppHandle, params: &Option<Value>) -> Result<Value, String> {
        let terminal_id = terminal_id_of(params)?;
        let mut map = self.inner.lock();
        if let Some(mut t) = map.remove(&terminal_id) {
            if let Some(child) = t.child.as_mut() {
                let _ = child.start_kill();
            }
            t.done.notify_waiters();
        }
        drop(map);
        let _ = app.emit(
            events::TERMINAL_CLOSED,
            json!({ "terminalId": terminal_id }),
        );
        Ok(json!({}))
    }
}

fn terminal_id_of(params: &Option<Value>) -> Result<String, String> {
    params
        .as_ref()
        .and_then(|p| p.get("terminalId"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "missing terminalId".to_string())
}

async fn pipe_output<R: tokio::io::AsyncRead + Unpin>(
    mgr: Arc<TerminalManager>,
    terminal_id: String,
    app: AppHandle,
    reader: R,
    _is_stderr: bool,
) {
    let mut reader = BufReader::new(reader);
    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf).await {
            Ok(0) => break,
            Ok(n) => {
                // Merge stdout/stderr into a single stream for the UI snapshot.
                let text = String::from_utf8_lossy(&buf[..n]).into_owned();
                if let Some(t) = mgr.inner.lock().get_mut(&terminal_id) {
                    t.output.push_str(&text);
                    while t.output.len() > t.byte_limit {
                        // Truncate from start on a char boundary.
                        let drain = t.output.len() - t.byte_limit;
                        let mut idx = drain.min(t.output.len());
                        while idx < t.output.len() && !t.output.is_char_boundary(idx) {
                            idx += 1;
                        }
                        t.output.drain(..idx);
                        t.truncated = true;
                    }
                }
                emit_snapshot(&mgr, &app, &terminal_id);
            }
            Err(_) => break,
        }
    }
}

fn emit_snapshot(mgr: &TerminalManager, app: &AppHandle, terminal_id: &str) {
    if let Some(t) = mgr.inner.lock().get(terminal_id) {
        let snap = TerminalSnapshot {
            terminal_id: terminal_id.to_string(),
            session_id: t.session_id.clone(),
            command: t.command.clone(),
            cwd: t.cwd.clone(),
            output: t.output.clone(),
            truncated: t.truncated,
            exit_code: t.exit_code,
            signal: t.signal.clone(),
            running: t.child.is_some() && t.exit_code.is_none() && t.signal.is_none(),
        };
        let _ = app.emit(events::TERMINAL_UPDATE, snap);
    }
}
