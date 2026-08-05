//! Short-lived ACP agent calls (e.g. `session/list` without a full GUI session).

use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::oneshot;

use super::process::AgentProcess;
use super::protocol::{self, Incoming};
use crate::config;
use crate::error::{AppError, AppResult};

type PendingMap =
    std::sync::Arc<parking_lot::Mutex<std::collections::HashMap<u64, oneshot::Sender<Result<Value, AppError>>>>>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionInfo {
    pub session_id: String,
    pub cwd: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    /// Always true for ACP-listed sessions.
    #[serde(default)]
    pub from_agent: bool,
}

/// Spawn a temporary agent, `initialize` (+ optional authenticate), `session/list`, then shut down.
pub async fn list_sessions_ephemeral(
    cwd_filter: Option<&str>,
    binary_override: Option<&str>,
) -> AppResult<Vec<AgentSessionInfo>> {
    let binary =
        config::detect_grok_binary(binary_override).ok_or(AppError::GrokNotFound)?;
    let process = AgentProcess::spawn(binary, false)?;
    let AgentProcess {
        mut child,
        mut stdin,
        stdout,
        ..
    } = process;

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let write_tx = tx.clone();
    tokio::spawn(async move {
        while let Some(line) = rx.recv().await {
            if stdin.write_all(line.as_bytes()).await.is_err() {
                break;
            }
            if stdin.flush().await.is_err() {
                break;
            }
        }
    });

    let pending: PendingMap =
        std::sync::Arc::new(parking_lot::Mutex::new(std::collections::HashMap::new()));
    let pending_reader = pending.clone();

    let reader = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(Incoming::Response(resp)) = Incoming::parse(&line) {
                let id = resp.id.as_ref().and_then(|v| {
                    v.as_u64()
                        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                });
                if let Some(id) = id {
                    if let Some(p) = pending_reader.lock().remove(&id) {
                        if let Some(err) = resp.error {
                            let _ = p.send(Err(AppError::Agent(format!(
                                "JSON-RPC {}: {}",
                                err.code, err.message
                            ))));
                        } else {
                            let _ = p.send(Ok(resp.result.unwrap_or(Value::Null)));
                        }
                    }
                }
            }
        }
    });

    async fn request(
        write_tx: &tokio::sync::mpsc::UnboundedSender<String>,
        pending: &PendingMap,
        id: u64,
        method: &str,
        params: Value,
    ) -> AppResult<Value> {
        let (tx, rx) = oneshot::channel();
        pending.lock().insert(id, tx);
        let line = protocol::request(id, method, params);
        write_tx
            .send(line)
            .map_err(|_| AppError::NotConnected)?;
        match tokio::time::timeout(Duration::from_secs(30), rx).await {
            Ok(Ok(r)) => r,
            Ok(Err(_)) => Err(AppError::Agent("request channel closed".into())),
            Err(_) => Err(AppError::Agent(format!("timeout on {method}"))),
        }
    }

    let result = async {
        let _ = request(
            &write_tx,
            &pending,
            1,
            "initialize",
            protocol::initialize_params(),
        )
        .await?;
        // Best-effort auth so list works when token is present.
        let _ = request(
            &write_tx,
            &pending,
            2,
            "authenticate",
            json!({ "methodId": "cached_token" }),
        )
        .await;

        let mut params = json!({});
        if let Some(cwd) = cwd_filter {
            params["cwd"] = json!(cwd);
        }
        let listed = request(&write_tx, &pending, 3, "session/list", params).await?;
        Ok::<_, AppError>(parse_session_list(&listed))
    }
    .await;

    drop(write_tx);
    let _ = child.kill().await;
    let _ = reader.await;
    result
}

pub fn parse_session_list(value: &Value) -> Vec<AgentSessionInfo> {
    let arr = value
        .get("sessions")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for s in arr {
        let session_id = s
            .get("sessionId")
            .or_else(|| s.get("session_id"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if session_id.is_empty() {
            continue;
        }
        let cwd = s
            .get("cwd")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let title = s
            .get("title")
            .and_then(|v| v.as_str())
            .map(|t| t.to_string());
        let updated_at = s
            .get("updatedAt")
            .or_else(|| s.get("updated_at"))
            .and_then(|v| v.as_str())
            .map(|t| t.to_string());
        out.push(AgentSessionInfo {
            session_id,
            cwd,
            title,
            updated_at,
            from_agent: true,
        });
    }
    out
}

/// One-shot authenticate (cached token) — returns agent auth meta when available.
pub async fn authenticate_cached(binary_override: Option<&str>) -> AppResult<Value> {
    let binary =
        config::detect_grok_binary(binary_override).ok_or(AppError::GrokNotFound)?;
    let process = AgentProcess::spawn(binary, false)?;
    let AgentProcess {
        mut child,
        mut stdin,
        stdout,
        ..
    } = process;

    let (write_tx, mut write_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    tokio::spawn(async move {
        while let Some(line) = write_rx.recv().await {
            if stdin.write_all(line.as_bytes()).await.is_err() {
                break;
            }
            let _ = stdin.flush().await;
        }
    });

    let pending: PendingMap =
        std::sync::Arc::new(parking_lot::Mutex::new(std::collections::HashMap::new()));
    let pending_reader = pending.clone();
    let reader = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(Incoming::Response(resp)) = Incoming::parse(&line) {
                let id = resp.id.as_ref().and_then(|v| {
                    v.as_u64()
                        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                });
                if let Some(id) = id {
                    if let Some(p) = pending_reader.lock().remove(&id) {
                        if let Some(err) = resp.error {
                            let _ = p.send(Err(AppError::Agent(format!(
                                "JSON-RPC {}: {}",
                                err.code, err.message
                            ))));
                        } else {
                            let _ = p.send(Ok(resp.result.unwrap_or(Value::Null)));
                        }
                    }
                }
            }
        }
    });

    let do_req = |id: u64, method: &'static str, params: Value| {
        let write_tx = write_tx.clone();
        let pending = pending.clone();
        async move {
            let (tx, rx) = oneshot::channel();
            pending.lock().insert(id, tx);
            write_tx
                .send(protocol::request(id, method, params))
                .map_err(|_| AppError::NotConnected)?;
            match tokio::time::timeout(Duration::from_secs(30), rx).await {
                Ok(Ok(r)) => r,
                Ok(Err(_)) => Err(AppError::Agent("request channel closed".into())),
                Err(_) => Err(AppError::Agent(format!("timeout on {method}"))),
            }
        }
    };

    let result = async {
        let _ = do_req(1, "initialize", protocol::initialize_params()).await?;
        do_req(2, "authenticate", json!({ "methodId": "cached_token" })).await
    }
    .await;

    drop(write_tx);
    let _ = child.kill().await;
    let _ = reader.await;
    result
}
