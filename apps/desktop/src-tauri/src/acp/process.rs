use std::path::PathBuf;
use std::process::Stdio;

use tokio::process::{Child, ChildStdin, ChildStdout, Command};

use crate::error::{AppError, AppResult};

/// Long-lived `grok agent stdio` child process.
pub struct AgentProcess {
    pub child: Child,
    pub stdin: ChildStdin,
    pub stdout: ChildStdout,
    #[allow(dead_code)]
    pub binary: PathBuf,
}

impl AgentProcess {
    /// Spawn `grok agent stdio`.
    ///
    /// Interactive GUI defaults to **ask** permissions (no `--always-approve`).
    /// Pass `always_approve = true` only when the user opts into yolo mode.
    pub fn spawn(binary: PathBuf, always_approve: bool) -> AppResult<Self> {
        let mut cmd = Command::new(&binary);
        cmd.arg("agent");
        if always_approve {
            cmd.arg("--always-approve");
        }
        cmd.arg("stdio")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        // GUI apps on Linux often lack a full login PATH; ensure ~/.grok/bin is present.
        if let Some(home) = dirs::home_dir() {
            let grok_bin = home.join(".grok/bin");
            if let Ok(path) = std::env::var("PATH") {
                let prefix = grok_bin.display().to_string();
                if !path.split(':').any(|p| p == prefix) {
                    cmd.env("PATH", format!("{prefix}:{path}"));
                }
            }
        }

        let mut child = cmd.spawn().map_err(|e| {
            AppError::Agent(format!(
                "failed to spawn `{} agent stdio`: {e}",
                binary.display()
            ))
        })?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| AppError::Agent("agent stdin missing".into()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::Agent("agent stdout missing".into()))?;

        // Drain stderr in background so the pipe never blocks the agent.
        if let Some(stderr) = child.stderr.take() {
            tokio::spawn(async move {
                use tokio::io::{AsyncBufReadExt, BufReader};
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    tracing::debug!(target: "grok-agent", "{line}");
                }
            });
        }

        Ok(Self {
            child,
            stdin,
            stdout,
            binary,
        })
    }
}
