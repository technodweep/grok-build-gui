use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, oneshot};

use super::fs_policy;
use super::process::AgentProcess;
use super::protocol::{
    self, initialize_params, session_cancel_params, session_load_params, session_new_params,
    session_prompt_blocks, session_prompt_params, Incoming,
};
use super::terminal::TerminalManager;
use crate::config;
use crate::error::{AppError, AppResult};
use crate::events;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentStatus {
    Disconnected,
    Connecting,
    Ready,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
    pub session_id: String,
    pub cwd: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningEffortOption {
    pub id: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableModel {
    pub model_id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub supports_reasoning_effort: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
    #[serde(default)]
    pub reasoning_efforts: Vec<ReasoningEffortOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionModelsState {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_model_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_effort: Option<String>,
    #[serde(default)]
    pub available_models: Vec<AvailableModel>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LiveSessionState {
    Idle,
    Working,
    NeedsInput,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveSession {
    pub session_id: String,
    pub cwd: String,
    pub title: String,
    pub pinned: bool,
    pub state: LiveSessionState,
    pub activity: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ConnectOptions {
    pub binary_override: Option<String>,
    pub cwd: PathBuf,
    pub always_approve: bool,
    /// When set, call `session/load` instead of `session/new`.
    pub resume_session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRequestPayload {
    /// JSON-RPC request id (number or string) for respond_permission.
    pub request_id: Value,
    pub session_id: Option<String>,
    pub tool_call: Option<Value>,
    pub options: Vec<PermissionOption>,
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionOption {
    pub option_id: String,
    pub name: String,
    pub kind: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionDecision {
    pub request_id: Value,
    /// `allow-once` | `allow-always` | `reject` (or agent-specific optionId)
    pub option_id: String,
}

enum AgentCommand {
    Write(String),
    Shutdown,
}

struct Pending {
    tx: oneshot::Sender<Result<Value, AppError>>,
}

struct PendingPermission {
    tx: oneshot::Sender<String>,
}

/// Shared handle used by Tauri commands.
pub struct AcpHandle {
    inner: Mutex<Option<LiveAgent>>,
    status: Mutex<AgentStatus>,
    next_id: AtomicU64,
    /// When true, auto-select allow-once/allow-always without UI.
    always_approve: Mutex<bool>,
    /// request_id string key → waiter
    pending_permissions: Arc<Mutex<HashMap<String, PendingPermission>>>,
    terminals: Arc<TerminalManager>,
}

struct LiveAgent {
    cmd_tx: mpsc::UnboundedSender<AgentCommand>,
    /// Active session used for prompts/cancel.
    active_session_id: Option<String>,
    /// All top-level sessions on this agent connection.
    sessions: HashMap<String, LiveSession>,
    cwd: PathBuf,
    pending: Arc<Mutex<HashMap<u64, Pending>>>,
    /// JSON-RPC request ids for in-flight `session/prompt` (so cancel can unblock waiters).
    in_flight_prompts: Arc<Mutex<std::collections::HashSet<u64>>>,
    /// Models catalog for the connection (updated on session open + agent notifications).
    models: SessionModelsState,
}

impl AcpHandle {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
            status: Mutex::new(AgentStatus::Disconnected),
            next_id: AtomicU64::new(1),
            always_approve: Mutex::new(false),
            pending_permissions: Arc::new(Mutex::new(HashMap::new())),
            terminals: TerminalManager::new(),
        }
    }

    pub fn terminals(&self) -> Arc<TerminalManager> {
        self.terminals.clone()
    }

    pub fn status(&self) -> AgentStatus {
        self.status.lock().clone()
    }

    pub fn session(&self) -> Option<SessionState> {
        let guard = self.inner.lock();
        let live = guard.as_ref()?;
        let id = live.active_session_id.as_ref()?;
        let s = live.sessions.get(id)?;
        Some(SessionState {
            session_id: s.session_id.clone(),
            cwd: s.cwd.clone(),
            model_id: s.model_id.clone(),
            effort: s.effort.clone().or_else(|| live.models.current_effort.clone()),
        })
    }

    pub fn models(&self) -> SessionModelsState {
        self.inner
            .lock()
            .as_ref()
            .map(|l| l.models.clone())
            .unwrap_or_default()
    }

    /// List sessions via live agent `session/list` when connected.
    pub async fn list_agent_sessions(
        &self,
        cwd: Option<&str>,
    ) -> AppResult<Vec<super::oneshot::AgentSessionInfo>> {
        if self.inner.lock().is_none() {
            return Err(AppError::NotConnected);
        }
        let mut params = json!({});
        if let Some(c) = cwd {
            params["cwd"] = json!(c);
        }
        let result = self.request("session/list", params).await?;
        Ok(super::oneshot::parse_session_list(&result))
    }

    pub fn session_cwd(&self) -> Option<PathBuf> {
        self.inner.lock().as_ref().map(|a| a.cwd.clone())
    }

    pub fn list_live_sessions(&self) -> Vec<LiveSession> {
        let guard = self.inner.lock();
        let Some(live) = guard.as_ref() else {
            return Vec::new();
        };
        let mut list: Vec<_> = live.sessions.values().cloned().collect();
        list.sort_by(|a, b| {
            b.pinned
                .cmp(&a.pinned)
                .then_with(|| b.updated_at.cmp(&a.updated_at))
        });
        list
    }

    #[allow(dead_code)]
    pub fn active_session_id(&self) -> Option<String> {
        self.inner
            .lock()
            .as_ref()
            .and_then(|a| a.active_session_id.clone())
    }

    fn set_status(&self, app: &AppHandle, status: AgentStatus) {
        *self.status.lock() = status.clone();
        let _ = app.emit(events::AGENT_STATUS, status);
    }

    fn emit_roster(&self, app: &AppHandle) {
        let _ = app.emit(events::ROSTER, self.list_live_sessions());
    }

    fn register_session(&self, app: &AppHandle, session: &SessionState, title: Option<String>) {
        let now = chrono_like_now();
        if let Some(live) = self.inner.lock().as_mut() {
            live.sessions.insert(
                session.session_id.clone(),
                LiveSession {
                    session_id: session.session_id.clone(),
                    cwd: session.cwd.clone(),
                    title: title.unwrap_or_else(|| {
                        format!(
                            "Session {}",
                            &session.session_id[..8.min(session.session_id.len())]
                        )
                    }),
                    pinned: false,
                    state: LiveSessionState::Idle,
                    activity: "idle".into(),
                    updated_at: now,
                    model_id: session.model_id.clone(),
                    effort: session.effort.clone(),
                },
            );
            live.active_session_id = Some(session.session_id.clone());
            live.cwd = PathBuf::from(&session.cwd);
        }
        self.emit_roster(app);
    }

    fn emit_models(&self, app: &AppHandle) {
        let _ = app.emit(events::MODELS_UPDATE, self.models());
    }

    fn apply_models_state(&self, app: &AppHandle, models: SessionModelsState) {
        if let Some(live) = self.inner.lock().as_mut() {
            live.models = models.clone();
            if let Some(id) = live.active_session_id.clone() {
                if let Some(s) = live.sessions.get_mut(&id) {
                    if models.current_model_id.is_some() {
                        s.model_id = models.current_model_id.clone();
                    }
                    if models.current_effort.is_some() {
                        s.effort = models.current_effort.clone();
                    }
                }
            }
        }
        self.emit_models(app);
        self.emit_roster(app);
    }

    /// Apply `_x.ai/models/update` or session models payload.
    fn apply_models_payload(&self, app: &AppHandle, params: &Value) {
        let mut models = parse_models_state(params);
        // Preserve effort if update omitted it.
        if models.current_effort.is_none() {
            if let Some(prev) = self.inner.lock().as_ref().map(|l| l.models.current_effort.clone()) {
                models.current_effort = prev;
            }
        }
        // If still missing, derive from current model's meta.
        if models.current_effort.is_none() {
            if let Some(mid) = models.current_model_id.as_deref() {
                models.current_effort = models
                    .available_models
                    .iter()
                    .find(|m| m.model_id == mid)
                    .and_then(|m| m.reasoning_effort.clone());
            }
        }
        self.apply_models_state(app, models);
    }

    fn apply_model_changed(&self, app: &AppHandle, update: &Value) {
        let model_id = update
            .get("model_id")
            .or_else(|| update.get("modelId"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let effort = update
            .get("reasoning_effort")
            .or_else(|| update.get("reasoningEffort"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        if let Some(live) = self.inner.lock().as_mut() {
            if let Some(mid) = model_id.clone() {
                live.models.current_model_id = Some(mid.clone());
                if let Some(id) = live.active_session_id.clone() {
                    if let Some(s) = live.sessions.get_mut(&id) {
                        s.model_id = Some(mid);
                    }
                }
            }
            if let Some(eff) = effort.clone() {
                live.models.current_effort = Some(eff.clone());
                // Keep available model meta in sync.
                if let Some(mid) = live.models.current_model_id.clone() {
                    if let Some(m) = live
                        .models
                        .available_models
                        .iter_mut()
                        .find(|m| m.model_id == mid)
                    {
                        m.reasoning_effort = Some(eff.clone());
                    }
                }
                if let Some(id) = live.active_session_id.clone() {
                    if let Some(s) = live.sessions.get_mut(&id) {
                        s.effort = Some(eff);
                    }
                }
            }
        }
        self.emit_models(app);
        self.emit_roster(app);
    }

    fn touch_session(
        &self,
        app: &AppHandle,
        session_id: &str,
        state: LiveSessionState,
        activity: &str,
    ) {
        if let Some(live) = self.inner.lock().as_mut() {
            if let Some(s) = live.sessions.get_mut(session_id) {
                s.state = state;
                s.activity = activity.into();
                s.updated_at = chrono_like_now();
            }
        }
        self.emit_roster(app);
    }

    pub async fn connect(
        self: &Arc<Self>,
        app: AppHandle,
        opts: ConnectOptions,
    ) -> AppResult<SessionState> {
        self.disconnect().await;
        self.set_status(&app, AgentStatus::Connecting);
        *self.always_approve.lock() = opts.always_approve;

        let binary = config::detect_grok_binary(opts.binary_override.as_deref())
            .ok_or(AppError::GrokNotFound)?;

        let process = AgentProcess::spawn(binary, opts.always_approve)?;
        let AgentProcess {
            mut child,
            stdin,
            stdout,
            ..
        } = process;

        let pending: Arc<Mutex<HashMap<u64, Pending>>> = Arc::new(Mutex::new(HashMap::new()));
        let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<AgentCommand>();

        let mut stdin = stdin;
        tokio::spawn(async move {
            while let Some(cmd) = cmd_rx.recv().await {
                match cmd {
                    AgentCommand::Write(line) => {
                        if stdin.write_all(line.as_bytes()).await.is_err() {
                            break;
                        }
                        if stdin.flush().await.is_err() {
                            break;
                        }
                    }
                    AgentCommand::Shutdown => break,
                }
            }
        });

        let cwd_for_handlers = opts.cwd.canonicalize().unwrap_or_else(|_| opts.cwd.clone());

        let app_reader = app.clone();
        let pending_reader = pending.clone();
        let cmd_tx_reader = cmd_tx.clone();
        let handle_for_status = Arc::clone(self);
        let always_approve = opts.always_approve;
        let pending_perms = self.pending_permissions.clone();
        let cwd_reader = cwd_for_handlers.clone();
        let terminals = self.terminals.clone();

        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if line.trim().is_empty() {
                    continue;
                }
                match Incoming::parse(&line) {
                    Ok(Incoming::Response(resp)) => {
                        let id = resp.id.as_ref().and_then(|v| {
                            v.as_u64()
                                .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                        });
                        if let Some(id) = id {
                            if let Some(p) = pending_reader.lock().remove(&id) {
                                if let Some(err) = resp.error {
                                    let _ = p.tx.send(Err(AppError::Agent(format!(
                                        "JSON-RPC {}: {}",
                                        err.code, err.message
                                    ))));
                                } else {
                                    let _ = p.tx.send(Ok(resp.result.unwrap_or(Value::Null)));
                                }
                            }
                        }
                    }
                    Ok(Incoming::Notification(n)) => {
                        if n.method == "session/update" {
                            let params = n.params.unwrap_or(Value::Null);
                            // Mark session activity for dashboard roster.
                            if let Some(sid) = params.get("sessionId").and_then(|v| v.as_str()) {
                                let kind = params
                                    .pointer("/update/sessionUpdate")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("");
                                let working = matches!(
                                    kind,
                                    "agent_message_chunk"
                                        | "agent_thought_chunk"
                                        | "tool_call"
                                        | "tool_call_update"
                                        | "user_message_chunk"
                                );
                                if working {
                                    handle_for_status.touch_session(
                                        &app_reader,
                                        sid,
                                        LiveSessionState::Working,
                                        kind,
                                    );
                                }
                                // Standard ACP model/mode updates when present.
                                if kind == "model_update" || kind == "current_mode_update" {
                                    if let Some(update) = params.get("update") {
                                        handle_for_status.apply_model_changed(&app_reader, update);
                                    }
                                }
                                if kind == "config_option_update" {
                                    if let Some(opts) = params.pointer("/update/configOptions") {
                                        handle_for_status.apply_models_payload(
                                            &app_reader,
                                            &json!({ "configOptions": opts }),
                                        );
                                    }
                                }
                            }
                            let _ = app_reader.emit(events::SESSION_UPDATE, params);
                        } else if n.method == "_x.ai/models/update" {
                            let params = n.params.unwrap_or(Value::Null);
                            handle_for_status.apply_models_payload(&app_reader, &params);
                        } else if n.method == "_x.ai/session_notification" {
                            let params = n.params.unwrap_or(Value::Null);
                            let kind = params
                                .pointer("/update/sessionUpdate")
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            if kind == "model_changed" {
                                if let Some(update) = params.get("update") {
                                    handle_for_status.apply_model_changed(&app_reader, update);
                                }
                            }
                        }
                    }
                    Ok(Incoming::Request {
                        id, method, params, ..
                    }) => {
                        handle_agent_request(
                            &app_reader,
                            &cmd_tx_reader,
                            id,
                            &method,
                            params,
                            always_approve,
                            &pending_perms,
                            &cwd_reader,
                            &terminals,
                        )
                        .await;
                    }
                    Err(e) => {
                        tracing::warn!("bad agent JSON: {e} | {line}");
                    }
                }
            }
            handle_for_status.set_status(&app_reader, AgentStatus::Disconnected);
            let _ = app_reader.emit(events::AGENT_ERROR, "Agent process ended".to_string());
        });

        tokio::spawn(async move {
            let _ = child.wait().await;
        });

        *self.inner.lock() = Some(LiveAgent {
            cmd_tx: cmd_tx.clone(),
            active_session_id: None,
            sessions: HashMap::new(),
            cwd: cwd_for_handlers.clone(),
            pending: pending.clone(),
            in_flight_prompts: Arc::new(Mutex::new(std::collections::HashSet::new())),
            models: SessionModelsState::default(),
        });

        let _init = self
            .request("initialize", initialize_params())
            .await
            .inspect_err(|_| {
                self.set_status(&app, AgentStatus::Error);
            })?;

        // Prefer cached auth so session/new doesn't hit auth_required when token exists.
        match self
            .request(
                "authenticate",
                serde_json::json!({ "methodId": "cached_token" }),
            )
            .await
        {
            Ok(meta) => {
                tracing::info!(
                    target: "acp",
                    "authenticate ok: {}",
                    meta.pointer("/_meta/email")
                        .and_then(|v| v.as_str())
                        .unwrap_or("(no email)")
                );
            }
            Err(e) => {
                tracing::warn!(target: "acp", "authenticate cached_token: {e}");
            }
        }

        let cwd = cwd_for_handlers.display().to_string();

        let session = if let Some(resume_id) = opts.resume_session_id.as_deref() {
            self.open_loaded_session(&app, resume_id, &cwd, opts.always_approve)
                .await?
        } else {
            self.open_new_session(&app, &cwd, opts.always_approve)
                .await?
        };

        self.set_status(&app, AgentStatus::Ready);
        Ok(session)
    }

    async fn open_new_session(
        &self,
        app: &AppHandle,
        cwd: &str,
        yolo: bool,
    ) -> AppResult<SessionState> {
        let result = self
            .request("session/new", session_new_params(cwd, yolo))
            .await
            .inspect_err(|_| {
                self.set_status(app, AgentStatus::Error);
            })?;

        let session_id = result
            .get("sessionId")
            .and_then(|v| v.as_str())
            .ok_or_else(|| AppError::Agent("session/new missing sessionId".into()))?
            .to_string();

        let models = parse_models_state(&result);
        let session = SessionState {
            session_id,
            cwd: cwd.to_string(),
            model_id: models.current_model_id.clone(),
            effort: models.current_effort.clone(),
        };
        self.register_session(app, &session, None);
        self.apply_models_state(app, models);
        Ok(session)
    }

    async fn open_loaded_session(
        &self,
        app: &AppHandle,
        session_id: &str,
        cwd: &str,
        yolo: bool,
    ) -> AppResult<SessionState> {
        let result = self
            .request("session/load", session_load_params(session_id, cwd, yolo))
            .await
            .inspect_err(|_| {
                self.set_status(app, AgentStatus::Error);
            })?;

        // Prefer id from response; fall back to requested id.
        let session_id = result
            .get("sessionId")
            .and_then(|v| v.as_str())
            .unwrap_or(session_id)
            .to_string();

        let models = parse_models_state(&result);
        let session = SessionState {
            session_id: session_id.clone(),
            cwd: cwd.to_string(),
            model_id: models.current_model_id.clone(),
            effort: models.current_effort.clone(),
        };
        // Prefer disk title if available.
        let title = crate::session::list_sessions(Some(cwd))
            .ok()
            .and_then(|list| {
                list.into_iter()
                    .find(|s| s.id == session.session_id)
                    .map(|s| s.title)
            });
        self.register_session(app, &session, title);
        self.apply_models_state(app, models);
        Ok(session)
    }

    /// Switch the active session's model via ACP `session/set_model`.
    pub async fn set_model(
        &self,
        app: AppHandle,
        model_id: &str,
    ) -> AppResult<SessionModelsState> {
        let session = self.session().ok_or(AppError::NoSession)?;
        let model_id = model_id.trim();
        if model_id.is_empty() {
            return Err(AppError::Message("Model id is empty".into()));
        }
        let _ = self
            .request(
                "session/set_model",
                json!({
                    "sessionId": session.session_id,
                    "modelId": model_id,
                }),
            )
            .await?;
        // Optimistically update; agent may also push `_x.ai/models/update`.
        {
            let mut guard = self.inner.lock();
            if let Some(live) = guard.as_mut() {
                live.models.current_model_id = Some(model_id.to_string());
                if let Some(m) = live
                    .models
                    .available_models
                    .iter()
                    .find(|m| m.model_id == model_id)
                {
                    if let Some(eff) = m.reasoning_effort.clone() {
                        live.models.current_effort = Some(eff);
                    }
                }
                if let Some(s) = live.sessions.get_mut(&session.session_id) {
                    s.model_id = Some(model_id.to_string());
                    s.effort = live.models.current_effort.clone();
                }
            }
        }
        self.emit_models(&app);
        self.emit_roster(&app);
        Ok(self.models())
    }

    /// Set reasoning effort via ACP `session/set_mode` (Grok maps modes → effort levels).
    pub async fn set_effort(
        &self,
        app: AppHandle,
        effort: &str,
    ) -> AppResult<SessionModelsState> {
        let session = self.session().ok_or(AppError::NoSession)?;
        let effort = effort.trim();
        if effort.is_empty() {
            return Err(AppError::Message("Effort is empty".into()));
        }
        let _ = self
            .request(
                "session/set_mode",
                json!({
                    "sessionId": session.session_id,
                    "modeId": effort,
                }),
            )
            .await?;
        {
            let mut guard = self.inner.lock();
            if let Some(live) = guard.as_mut() {
                live.models.current_effort = Some(effort.to_string());
                if let Some(mid) = live.models.current_model_id.clone() {
                    if let Some(m) = live
                        .models
                        .available_models
                        .iter_mut()
                        .find(|m| m.model_id == mid)
                    {
                        m.reasoning_effort = Some(effort.to_string());
                    }
                }
                if let Some(s) = live.sessions.get_mut(&session.session_id) {
                    s.effort = Some(effort.to_string());
                }
            }
        }
        self.emit_models(&app);
        self.emit_roster(&app);
        Ok(self.models())
    }

    /// Start a brand-new session on the already-connected agent (same process).
    pub async fn new_session(&self, app: AppHandle) -> AppResult<SessionState> {
        let cwd = self
            .session_cwd()
            .ok_or(AppError::NotConnected)?
            .display()
            .to_string();
        let yolo = *self.always_approve.lock();
        // Clear pending permission waiters for previous session.
        let pending = std::mem::take(&mut *self.pending_permissions.lock());
        for (_, p) in pending {
            let _ = p.tx.send("reject".into());
        }
        let session = self.open_new_session(&app, &cwd, yolo).await?;
        self.set_status(&app, AgentStatus::Ready);
        Ok(session)
    }

    /// Dispatch a new top-level agent session, optionally seeding a prompt.
    pub async fn dispatch(
        &self,
        app: AppHandle,
        cwd: Option<String>,
        prompt: Option<String>,
        title: Option<String>,
    ) -> AppResult<SessionState> {
        let cwd = cwd
            .or_else(|| self.session_cwd().map(|p| p.display().to_string()))
            .ok_or(AppError::NotConnected)?;
        let yolo = *self.always_approve.lock();
        let session = self.open_new_session(&app, &cwd, yolo).await?;
        if let Some(t) = title {
            self.rename_live(&app, &session.session_id, &t)?;
        }
        if let Some(p) = prompt.filter(|s| !s.trim().is_empty()) {
            self.touch_session(
                &app,
                &session.session_id,
                LiveSessionState::Working,
                "dispatch",
            );
            // Send on this session even if active was different — open_new sets active.
            if let Err(e) = self.send_prompt(p.trim()).await {
                self.touch_session(
                    &app,
                    &session.session_id,
                    LiveSessionState::Failed,
                    "dispatch failed",
                );
                return Err(e);
            }
            self.touch_session(&app, &session.session_id, LiveSessionState::Idle, "idle");
        }
        Ok(session)
    }

    pub fn switch_session(&self, app: &AppHandle, session_id: &str) -> AppResult<SessionState> {
        let mut guard = self.inner.lock();
        let live = guard.as_mut().ok_or(AppError::NotConnected)?;
        let s = live
            .sessions
            .get(session_id)
            .ok_or_else(|| AppError::Message(format!("unknown session {session_id}")))?
            .clone();
        live.active_session_id = Some(session_id.to_string());
        live.cwd = PathBuf::from(&s.cwd);
        drop(guard);
        self.emit_roster(app);
        Ok(SessionState {
            session_id: s.session_id,
            cwd: s.cwd,
            model_id: s.model_id,
            effort: s.effort,
        })
    }

    pub fn pin_session(&self, app: &AppHandle, session_id: &str, pinned: bool) -> AppResult<()> {
        {
            let mut guard = self.inner.lock();
            let live = guard.as_mut().ok_or(AppError::NotConnected)?;
            let s = live
                .sessions
                .get_mut(session_id)
                .ok_or_else(|| AppError::Message(format!("unknown session {session_id}")))?;
            s.pinned = pinned;
            s.updated_at = chrono_like_now();
        }
        self.emit_roster(app);
        Ok(())
    }

    pub fn rename_live(&self, app: &AppHandle, session_id: &str, title: &str) -> AppResult<()> {
        {
            let mut guard = self.inner.lock();
            let live = guard.as_mut().ok_or(AppError::NotConnected)?;
            let s = live
                .sessions
                .get_mut(session_id)
                .ok_or_else(|| AppError::Message(format!("unknown session {session_id}")))?;
            s.title = title.to_string();
            s.updated_at = chrono_like_now();
        }
        // Best-effort disk rename too.
        let _ = crate::session::rename_session(session_id, title);
        self.emit_roster(app);
        Ok(())
    }

    pub async fn cancel_session(&self, app: AppHandle, session_id: &str) -> AppResult<()> {
        // Prefer full cancel path (unblocks prompt waiters) when this is the active session.
        if self.session().as_ref().map(|s| s.session_id.as_str()) == Some(session_id) {
            self.cancel().await?;
            self.emit_roster(&app);
            return Ok(());
        }
        let line = protocol::notification("session/cancel", session_cancel_params(session_id));
        {
            let guard = self.inner.lock();
            let live = guard.as_ref().ok_or(AppError::NotConnected)?;
            live.cmd_tx
                .send(AgentCommand::Write(line))
                .map_err(|_| AppError::NotConnected)?;
        }
        self.touch_session(&app, session_id, LiveSessionState::Idle, "cancelled");
        Ok(())
    }

    /// Remove from live roster (does not delete disk unless requested).
    pub fn close_live_session(
        &self,
        app: &AppHandle,
        session_id: &str,
        delete_disk: bool,
    ) -> AppResult<Option<SessionState>> {
        let mut next_active: Option<SessionState> = None;
        {
            let mut guard = self.inner.lock();
            let live = guard.as_mut().ok_or(AppError::NotConnected)?;
            live.sessions.remove(session_id);
            if live.active_session_id.as_deref() == Some(session_id) {
                live.active_session_id = live.sessions.keys().next().cloned();
                if let Some(id) = &live.active_session_id {
                    if let Some(s) = live.sessions.get(id) {
                        next_active = Some(SessionState {
                            session_id: s.session_id.clone(),
                            cwd: s.cwd.clone(),
                            model_id: s.model_id.clone(),
                            effort: s.effort.clone(),
                        });
                        live.cwd = PathBuf::from(&s.cwd);
                    }
                }
            }
        }
        if delete_disk {
            let _ = crate::session::delete_session(session_id);
        }
        self.emit_roster(app);
        Ok(next_active)
    }

    pub async fn disconnect(&self) {
        // Fail any waiting permission prompts.
        let pending = std::mem::take(&mut *self.pending_permissions.lock());
        for (_, p) in pending {
            let _ = p.tx.send("reject".into());
        }
        let live = self.inner.lock().take();
        if let Some(live) = live {
            let _ = live.cmd_tx.send(AgentCommand::Shutdown);
        }
        *self.status.lock() = AgentStatus::Disconnected;
    }

    async fn request(&self, method: &str, params: Value) -> AppResult<Value> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        let is_prompt = method == "session/prompt";

        {
            let mut guard = self.inner.lock();
            let live = guard.as_mut().ok_or(AppError::NotConnected)?;
            live.pending.lock().insert(id, Pending { tx });
            if is_prompt {
                live.in_flight_prompts.lock().insert(id);
            }
            let line = protocol::request(id, method, params);
            live.cmd_tx
                .send(AgentCommand::Write(line))
                .map_err(|_| AppError::NotConnected)?;
        }

        // Prompts can run a long time; cancel unblocks via in_flight_prompts.
        // Other RPCs keep a shorter bound.
        let timeout = if is_prompt {
            std::time::Duration::from_secs(3600)
        } else {
            std::time::Duration::from_secs(120)
        };

        let result = match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err(AppError::Agent("request channel closed".into())),
            Err(_) => Err(AppError::Agent(format!(
                "timeout waiting for response to {method}"
            ))),
        };

        if is_prompt {
            if let Some(live) = self.inner.lock().as_ref() {
                live.in_flight_prompts.lock().remove(&id);
            }
        }
        result
    }

    pub async fn send_prompt(&self, text: &str) -> AppResult<()> {
        let session = self.session().ok_or(AppError::NoSession)?;
        // We need AppHandle for roster — set working without app via inner only.
        if let Some(live) = self.inner.lock().as_mut() {
            if let Some(s) = live.sessions.get_mut(&session.session_id) {
                s.state = LiveSessionState::Working;
                s.activity = "prompt".into();
                s.updated_at = chrono_like_now();
            }
        }
        let result = self
            .request(
                "session/prompt",
                session_prompt_params(&session.session_id, text),
            )
            .await;
        self.finish_prompt_state(&session.session_id, &result);
        result.map(|_| ())
    }

    /// Send a multi-block ACP prompt (text + resource attachments).
    pub async fn send_prompt_blocks(&self, blocks: Vec<Value>) -> AppResult<()> {
        if blocks.is_empty() {
            return Err(AppError::Message("Prompt is empty".into()));
        }
        let session = self.session().ok_or(AppError::NoSession)?;
        if let Some(live) = self.inner.lock().as_mut() {
            if let Some(s) = live.sessions.get_mut(&session.session_id) {
                s.state = LiveSessionState::Working;
                s.activity = "prompt".into();
                s.updated_at = chrono_like_now();
            }
        }
        let result = self
            .request(
                "session/prompt",
                session_prompt_blocks(&session.session_id, blocks),
            )
            .await;
        self.finish_prompt_state(&session.session_id, &result);
        result.map(|_| ())
    }

    fn finish_prompt_state(&self, session_id: &str, result: &AppResult<Value>) {
        if let Some(live) = self.inner.lock().as_mut() {
            if let Some(s) = live.sessions.get_mut(session_id) {
                let cancelled = result
                    .as_ref()
                    .ok()
                    .and_then(|v| {
                        v.get("stopReason")
                            .or_else(|| v.get("stop_reason"))
                            .and_then(|x| x.as_str())
                    })
                    .is_some_and(|r| r == "cancelled" || r == "canceled");
                if cancelled {
                    s.state = LiveSessionState::Idle;
                    s.activity = "cancelled".into();
                } else if result.is_ok() {
                    s.state = LiveSessionState::Idle;
                    s.activity = "idle".into();
                } else if result
                    .as_ref()
                    .err()
                    .is_some_and(|e| e.to_string().contains("cancelled"))
                {
                    s.state = LiveSessionState::Idle;
                    s.activity = "cancelled".into();
                } else {
                    s.state = LiveSessionState::Failed;
                    s.activity = "error".into();
                }
                s.updated_at = chrono_like_now();
            }
        }
    }

    pub async fn cancel(&self) -> AppResult<()> {
        let session_id = self.session().ok_or(AppError::NoSession)?.session_id;

        // 1) Tell the agent to stop the turn.
        let cancel_line =
            protocol::notification("session/cancel", session_cancel_params(&session_id));

        let prompt_ids: Vec<u64> = {
            let guard = self.inner.lock();
            let live = guard.as_ref().ok_or(AppError::NotConnected)?;
            live.cmd_tx
                .send(AgentCommand::Write(cancel_line))
                .map_err(|_| AppError::NotConnected)?;

            // Also send protocol-level cancel for each in-flight prompt request id.
            let ids: Vec<u64> = live.in_flight_prompts.lock().iter().copied().collect();
            for id in &ids {
                let line = protocol::notification(
                    "$/cancel_request",
                    json!({ "requestId": id }),
                );
                let _ = live.cmd_tx.send(AgentCommand::Write(line));
            }
            ids
        };

        // 2) Unblock local waiters immediately so the UI is not stuck on send_prompt.
        {
            let guard = self.inner.lock();
            if let Some(live) = guard.as_ref() {
                let mut pending = live.pending.lock();
                let mut inflight = live.in_flight_prompts.lock();
                for id in prompt_ids {
                    inflight.remove(&id);
                    if let Some(p) = pending.remove(&id) {
                        let _ = p.tx.send(Ok(json!({
                            "stopReason": "cancelled"
                        })));
                    }
                }
            }
        }

        // 3) Deny any open permission prompts so the agent is not stuck there either.
        {
            let pending = std::mem::take(&mut *self.pending_permissions.lock());
            for (_, p) in pending {
                let _ = p.tx.send("reject".into());
            }
        }

        if let Some(live) = self.inner.lock().as_mut() {
            if let Some(s) = live.sessions.get_mut(&session_id) {
                s.state = LiveSessionState::Idle;
                s.activity = "cancelled".into();
                s.updated_at = chrono_like_now();
            }
        }
        Ok(())
    }

    /// Resolve a pending permission request from the UI.
    pub fn respond_permission(&self, decision: PermissionDecision) -> AppResult<()> {
        let key = request_id_key(&decision.request_id);
        let waiter = self
            .pending_permissions
            .lock()
            .remove(&key)
            .ok_or_else(|| AppError::Message("No pending permission for that request id".into()))?;
        let _ = waiter.tx.send(decision.option_id);
        Ok(())
    }
}

fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    // Zero-padded for lexicographic sort.
    format!("{ms:015}")
}

fn request_id_key(id: &Value) -> String {
    match id {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        other => other.to_string(),
    }
}

fn parse_permission_options(params: &Option<Value>) -> Vec<PermissionOption> {
    let mut options = Vec::new();
    if let Some(arr) = params
        .as_ref()
        .and_then(|p| p.get("options"))
        .and_then(|o| o.as_array())
    {
        for o in arr {
            let option_id = o
                .get("optionId")
                .or_else(|| o.get("option_id"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if option_id.is_empty() {
                continue;
            }
            let name = o
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or(&option_id)
                .to_string();
            let kind = o
                .get("kind")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            options.push(PermissionOption {
                option_id,
                name,
                kind,
            });
        }
    }
    if options.is_empty() {
        // ACP common defaults
        options = vec![
            PermissionOption {
                option_id: "allow-once".into(),
                name: "Allow once".into(),
                kind: Some("allow_once".into()),
            },
            PermissionOption {
                option_id: "allow-always".into(),
                name: "Allow always".into(),
                kind: Some("allow_always".into()),
            },
            PermissionOption {
                option_id: "reject".into(),
                name: "Deny".into(),
                kind: Some("reject_once".into()),
            },
        ];
    }
    options
}

fn pick_auto_allow(options: &[PermissionOption]) -> String {
    options
        .iter()
        .find(|o| {
            o.option_id == "allow-always"
                || o.option_id == "allow_always"
                || o.kind.as_deref() == Some("allow_always")
        })
        .or_else(|| {
            options.iter().find(|o| {
                o.option_id == "allow-once"
                    || o.option_id == "allow_once"
                    || o.kind.as_deref() == Some("allow_once")
            })
        })
        .map(|o| o.option_id.clone())
        .unwrap_or_else(|| "allow-once".into())
}

fn permission_response(option_id: &str) -> Value {
    // Prefer selected outcome (ACP); some agents also accept cancelled.
    if option_id == "reject" || option_id == "deny" || option_id == "cancelled" {
        // Try selected with reject id first; agents that use cancel use cancelled outcome.
        if option_id == "cancelled" {
            return json!({ "outcome": { "outcome": "cancelled" } });
        }
        return json!({
            "outcome": {
                "outcome": "selected",
                "optionId": option_id
            }
        });
    }
    json!({
        "outcome": {
            "outcome": "selected",
            "optionId": option_id
        }
    })
}

/// Respond to agent-originated requests (permissions, fs, etc.).
#[allow(clippy::too_many_arguments)]
async fn handle_agent_request(
    app: &AppHandle,
    cmd_tx: &mpsc::UnboundedSender<AgentCommand>,
    id: Value,
    method: &str,
    params: Option<Value>,
    always_approve: bool,
    pending_perms: &Arc<Mutex<HashMap<String, PendingPermission>>>,
    cwd: &std::path::Path,
    terminals: &Arc<TerminalManager>,
) {
    match method {
        "session/request_permission" => {
            let options = parse_permission_options(&params);
            let session_id = params
                .as_ref()
                .and_then(|p| p.get("sessionId"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let tool_call = params
                .as_ref()
                .and_then(|p| p.get("toolCall").cloned())
                .or_else(|| params.as_ref().and_then(|p| p.get("tool_call").cloned()));

            // Note: roster NeedsInput is updated on the frontend from permission events.

            let payload = PermissionRequestPayload {
                request_id: id.clone(),
                session_id,
                tool_call,
                options: options.clone(),
                raw: params.clone().unwrap_or(Value::Null),
            };

            if always_approve {
                let option_id = pick_auto_allow(&options);
                let _ = app.emit(events::PERMISSION_REQUEST, &payload);
                let reply = protocol::response(id, permission_response(&option_id));
                let _ = cmd_tx.send(AgentCommand::Write(reply));
                return;
            }

            let (tx, rx) = oneshot::channel();
            let key = request_id_key(&id);
            pending_perms.lock().insert(key, PendingPermission { tx });

            let _ = app.emit(events::PERMISSION_REQUEST, &payload);

            let option_id =
                match tokio::time::timeout(std::time::Duration::from_secs(300), rx).await {
                    Ok(Ok(choice)) => choice,
                    Ok(Err(_)) => "reject".into(),
                    Err(_) => {
                        tracing::warn!("permission prompt timed out; denying");
                        "reject".into()
                    }
                };

            let reply = protocol::response(id, permission_response(&option_id));
            let _ = cmd_tx.send(AgentCommand::Write(reply));
        }
        "fs/read_text_file" => {
            let path = params
                .as_ref()
                .and_then(|p| p.get("path"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match fs_policy::resolve_sandboxed(cwd, path) {
                Ok(resolved) => match std::fs::read_to_string(&resolved) {
                    Ok(content) => {
                        let reply = protocol::response(id, json!({ "content": content }));
                        let _ = cmd_tx.send(AgentCommand::Write(reply));
                    }
                    Err(e) => {
                        let reply = json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "error": { "code": -32000, "message": e.to_string() }
                        })
                        .to_string()
                            + "\n";
                        let _ = cmd_tx.send(AgentCommand::Write(reply));
                    }
                },
                Err(e) => {
                    let reply = json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "error": { "code": -32000, "message": e.to_string() }
                    })
                    .to_string()
                        + "\n";
                    let _ = cmd_tx.send(AgentCommand::Write(reply));
                }
            }
        }
        "fs/write_text_file" => {
            let path = params
                .as_ref()
                .and_then(|p| p.get("path"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let content = params
                .as_ref()
                .and_then(|p| p.get("content"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match fs_policy::resolve_sandboxed(cwd, path) {
                Ok(resolved) => {
                    if let Some(parent) = resolved.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    match std::fs::write(&resolved, content) {
                        Ok(()) => {
                            let reply = protocol::response(id, json!({}));
                            let _ = cmd_tx.send(AgentCommand::Write(reply));
                        }
                        Err(e) => {
                            let reply = json!({
                                "jsonrpc": "2.0",
                                "id": id,
                                "error": { "code": -32000, "message": e.to_string() }
                            })
                            .to_string()
                                + "\n";
                            let _ = cmd_tx.send(AgentCommand::Write(reply));
                        }
                    }
                }
                Err(e) => {
                    let reply = json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "error": { "code": -32000, "message": e.to_string() }
                    })
                    .to_string()
                        + "\n";
                    let _ = cmd_tx.send(AgentCommand::Write(reply));
                }
            }
        }
        "terminal/create" => match terminals.create(app.clone(), &params, cwd).await {
            Ok(result) => {
                let reply = protocol::response(id, result);
                let _ = cmd_tx.send(AgentCommand::Write(reply));
            }
            Err(e) => {
                let reply = json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": { "code": -32000, "message": e }
                })
                .to_string()
                    + "\n";
                let _ = cmd_tx.send(AgentCommand::Write(reply));
            }
        },
        "terminal/output" => match terminals.output(&params) {
            Ok(result) => {
                let reply = protocol::response(id, result);
                let _ = cmd_tx.send(AgentCommand::Write(reply));
            }
            Err(e) => {
                let reply = json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": { "code": -32000, "message": e }
                })
                .to_string()
                    + "\n";
                let _ = cmd_tx.send(AgentCommand::Write(reply));
            }
        },
        "terminal/wait_for_exit" => match terminals.wait_for_exit(&params).await {
            Ok(result) => {
                let reply = protocol::response(id, result);
                let _ = cmd_tx.send(AgentCommand::Write(reply));
            }
            Err(e) => {
                let reply = json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": { "code": -32000, "message": e }
                })
                .to_string()
                    + "\n";
                let _ = cmd_tx.send(AgentCommand::Write(reply));
            }
        },
        "terminal/kill" => match terminals.kill(app, &params) {
            Ok(result) => {
                let reply = protocol::response(id, result);
                let _ = cmd_tx.send(AgentCommand::Write(reply));
            }
            Err(e) => {
                let reply = json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": { "code": -32000, "message": e }
                })
                .to_string()
                    + "\n";
                let _ = cmd_tx.send(AgentCommand::Write(reply));
            }
        },
        "terminal/release" => match terminals.release(app, &params) {
            Ok(result) => {
                let reply = protocol::response(id, result);
                let _ = cmd_tx.send(AgentCommand::Write(reply));
            }
            Err(e) => {
                let reply = json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": { "code": -32000, "message": e }
                })
                .to_string()
                    + "\n";
                let _ = cmd_tx.send(AgentCommand::Write(reply));
            }
        },
        other => {
            tracing::warn!("unhandled agent request: {other}");
            let reply = json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": { "code": -32601, "message": format!("Method not found: {other}") }
            })
            .to_string()
                + "\n";
            let _ = cmd_tx.send(AgentCommand::Write(reply));
        }
    }
}

/// Parse Grok / ACP models payload from `session/new`, `session/load`, or `_x.ai/models/update`.
fn parse_models_state(value: &Value) -> SessionModelsState {
    let models_root = value.get("models").unwrap_or(value);

    let current_model_id = models_root
        .get("currentModelId")
        .or_else(|| models_root.get("current_model_id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let mut available_models = Vec::new();
    if let Some(arr) = models_root
        .get("availableModels")
        .or_else(|| models_root.get("available_models"))
        .and_then(|v| v.as_array())
    {
        for m in arr {
            let model_id = m
                .get("modelId")
                .or_else(|| m.get("model_id"))
                .or_else(|| m.get("id"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if model_id.is_empty() {
                continue;
            }
            let name = m
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or(&model_id)
                .to_string();
            let description = m
                .get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let meta = m.get("_meta").cloned().unwrap_or(Value::Null);
            let supports = meta
                .get("supportsReasoningEffort")
                .or_else(|| meta.get("supports_reasoning_effort"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let reasoning_effort = meta
                .get("reasoningEffort")
                .or_else(|| meta.get("reasoning_effort"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let mut efforts = Vec::new();
            if let Some(eff_arr) = meta
                .get("reasoningEfforts")
                .or_else(|| meta.get("reasoning_efforts"))
                .and_then(|v| v.as_array())
            {
                for e in eff_arr {
                    let id = e
                        .get("id")
                        .or_else(|| e.get("value"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    if id.is_empty() {
                        continue;
                    }
                    let label = e
                        .get("label")
                        .or_else(|| e.get("name"))
                        .and_then(|v| v.as_str())
                        .unwrap_or(&id)
                        .to_string();
                    let description = e
                        .get("description")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    let default = e.get("default").and_then(|v| v.as_bool()).unwrap_or(false);
                    efforts.push(ReasoningEffortOption {
                        id,
                        label,
                        description,
                        default,
                    });
                }
            }
            available_models.push(AvailableModel {
                model_id,
                name,
                description,
                supports_reasoning_effort: supports || !efforts.is_empty(),
                reasoning_effort,
                reasoning_efforts: efforts,
            });
        }
    }

    // Grok also exposes effort options under `_meta["x.ai/sessionConfig"].options`.
    let mut current_effort = current_model_id.as_ref().and_then(|mid| {
        available_models
            .iter()
            .find(|m| &m.model_id == mid)
            .and_then(|m| m.reasoning_effort.clone())
    });

    if let Some(opts) = value
        .pointer("/_meta/x.ai/sessionConfig/options")
        .and_then(|v| v.as_array())
    {
        // If the current model has no effort list, harvest mode-category options.
        let mode_opts: Vec<_> = opts
            .iter()
            .filter(|o| o.get("category").and_then(|c| c.as_str()) == Some("mode"))
            .collect();
        if !mode_opts.is_empty() {
            if let Some(mid) = current_model_id.as_ref() {
                if let Some(m) = available_models.iter_mut().find(|m| &m.model_id == mid) {
                    if m.reasoning_efforts.is_empty() {
                        for o in &mode_opts {
                            let id = o
                                .get("id")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            if id.is_empty() {
                                continue;
                            }
                            let label = o
                                .get("label")
                                .or_else(|| o.get("name"))
                                .and_then(|v| v.as_str())
                                .unwrap_or(&id)
                                .to_string();
                            let description = o
                                .get("description")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                            let selected =
                                o.get("selected").and_then(|v| v.as_bool()).unwrap_or(false);
                            if selected {
                                current_effort = Some(id.clone());
                                m.reasoning_effort = Some(id.clone());
                            }
                            m.reasoning_efforts.push(ReasoningEffortOption {
                                id,
                                label,
                                description,
                                default: selected,
                            });
                        }
                        m.supports_reasoning_effort = true;
                    }
                }
            }
            // Selected mode when model meta lacked effort.
            if current_effort.is_none() {
                current_effort = mode_opts.iter().find_map(|o| {
                    if o.get("selected").and_then(|v| v.as_bool()).unwrap_or(false) {
                        o.get("id").and_then(|v| v.as_str()).map(|s| s.to_string())
                    } else {
                        None
                    }
                });
            }
        }
    }

    SessionModelsState {
        current_model_id,
        current_effort,
        available_models,
    }
}
