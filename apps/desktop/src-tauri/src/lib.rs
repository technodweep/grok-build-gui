mod acp;
mod config;
mod error;
mod events;
mod fs_index;
mod session;

use std::path::PathBuf;
use std::sync::Arc;

use acp::{
    authenticate_cached, list_sessions_ephemeral, AcpHandle, AgentSessionInfo, AgentStatus,
    ConnectOptions, LiveSession, PermissionDecision, SessionModelsState, SessionState,
    TerminalSnapshot,
};
use config::{
    environment_info, load_grok_config_overview, load_settings, save_settings, EnvironmentInfo,
    GrokConfigOverview, GuiSettings,
};
use error::AppResult;
use fs_index::FileEntry;
use serde::Deserialize;
use serde_json::{json, Value};
use session::{
    delete_session, list_sessions, list_subagents, load_history, load_plan_md, load_plan_mode,
    load_signals, rename_session, save_plan_md, DiskSession, HistoryItem, PlanModeState,
    SessionSignals, SubagentInfo,
};
use tauri::Manager;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectArgs {
    cwd: String,
    #[serde(default)]
    binary_override: Option<String>,
    #[serde(default)]
    always_approve: bool,
    #[serde(default)]
    resume_session_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PromptArgs {
    text: String,
    /// Optional path attachments (relative or absolute under project).
    #[serde(default)]
    attachments: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FuzzyFilesArgs {
    cwd: String,
    #[serde(default)]
    query: String,
    #[serde(default)]
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListSessionsArgs {
    #[serde(default)]
    cwd: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionIdArgs {
    session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenameArgs {
    session_id: String,
    title: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistoryArgs {
    session_id: String,
    #[serde(default)]
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DispatchArgs {
    #[serde(default)]
    cwd: Option<String>,
    #[serde(default)]
    prompt: Option<String>,
    #[serde(default)]
    title: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SwitchArgs {
    session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PinArgs {
    session_id: String,
    pinned: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloseLiveArgs {
    session_id: String,
    #[serde(default)]
    delete_disk: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetModelArgs {
    model_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetEffortArgs {
    effort: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetModeArgs {
    mode_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavePlanArgs {
    session_id: String,
    content: String,
}

#[tauri::command]
fn get_environment(binary_override: Option<String>) -> EnvironmentInfo {
    let settings = load_settings();
    let override_path = binary_override.or(settings.binary_override);
    environment_info(override_path.as_deref())
}

#[tauri::command]
fn get_agent_status(handle: tauri::State<'_, Arc<AcpHandle>>) -> AgentStatus {
    handle.status()
}

#[tauri::command]
fn get_session(handle: tauri::State<'_, Arc<AcpHandle>>) -> Option<SessionState> {
    handle.session()
}

#[tauri::command]
async fn connect_agent(
    app: tauri::AppHandle,
    handle: tauri::State<'_, Arc<AcpHandle>>,
    args: ConnectArgs,
) -> AppResult<SessionState> {
    let cwd = PathBuf::from(&args.cwd);
    if !cwd.is_dir() {
        return Err(error::AppError::Message(format!(
            "Working directory does not exist: {}",
            cwd.display()
        )));
    }

    // Persist last project + yolo preference; prefer explicit override then saved.
    let mut settings = load_settings();
    settings.last_project_cwd = Some(args.cwd.clone());
    settings.always_approve = args.always_approve;
    let binary_override = args.binary_override.or(settings.binary_override.clone());
    let _ = save_settings(&settings);

    handle
        .connect(
            app,
            ConnectOptions {
                binary_override,
                cwd,
                always_approve: args.always_approve,
                resume_session_id: args.resume_session_id,
            },
        )
        .await
}

#[tauri::command]
async fn disconnect_agent(handle: tauri::State<'_, Arc<AcpHandle>>) -> AppResult<()> {
    handle.disconnect().await;
    Ok(())
}

#[tauri::command]
async fn new_session(
    app: tauri::AppHandle,
    handle: tauri::State<'_, Arc<AcpHandle>>,
) -> AppResult<SessionState> {
    handle.new_session(app).await
}

#[tauri::command]
async fn send_prompt(handle: tauri::State<'_, Arc<AcpHandle>>, args: PromptArgs) -> AppResult<()> {
    let text = args.text.trim();
    if text.is_empty() && args.attachments.is_empty() {
        return Err(error::AppError::Message("Prompt is empty".into()));
    }

    if args.attachments.is_empty() {
        return handle.send_prompt(text).await;
    }

    let cwd = handle
        .session()
        .map(|s| s.cwd)
        .ok_or(error::AppError::NoSession)?;

    let mut blocks: Vec<Value> = Vec::new();
    if !text.is_empty() {
        blocks.push(json!({ "type": "text", "text": text }));
    }

    for rel in &args.attachments {
        let path_label = rel.clone();
        match fs_index::read_attachment(&cwd, rel, 48 * 1024) {
            Ok(content) => {
                // Prefer embedded resource with text for small files.
                let uri = format!("file://{cwd}/{rel}");
                blocks.push(json!({
                    "type": "resource",
                    "resource": {
                        "uri": uri,
                        "mimeType": "text/plain",
                        "text": content
                    }
                }));
                // Also mention path so the model sees the reference clearly.
                blocks.push(json!({
                    "type": "text",
                    "text": format!("\n[Attached file: {path_label}]\n")
                }));
            }
            Err(_) => {
                // Path-only attachment when binary/large/unreadable.
                blocks.push(json!({
                    "type": "text",
                    "text": format!("\n[Attached path: @{path_label}]\n")
                }));
            }
        }
    }

    handle.send_prompt_blocks(blocks).await
}

#[tauri::command]
fn fuzzy_project_files(args: FuzzyFilesArgs) -> AppResult<Vec<FileEntry>> {
    fs_index::list_project_files(&args.cwd, &args.query, args.limit.unwrap_or(40))
}

#[tauri::command]
async fn cancel_turn(handle: tauri::State<'_, Arc<AcpHandle>>) -> AppResult<()> {
    handle.cancel().await
}

#[tauri::command]
fn respond_permission(
    handle: tauri::State<'_, Arc<AcpHandle>>,
    decision: PermissionDecision,
) -> AppResult<()> {
    handle.respond_permission(decision)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ElicitationDecision {
    request_id: Value,
    outcome: Value,
}

#[tauri::command]
fn respond_elicitation(
    handle: tauri::State<'_, Arc<AcpHandle>>,
    decision: ElicitationDecision,
) -> AppResult<()> {
    handle.respond_elicitation(decision.request_id, decision.outcome)
}

#[tauri::command]
fn list_disk_sessions(args: ListSessionsArgs) -> AppResult<Vec<DiskSession>> {
    list_sessions(args.cwd.as_deref())
}

#[tauri::command]
fn delete_disk_session(args: SessionIdArgs) -> AppResult<()> {
    delete_session(&args.session_id)
}

#[tauri::command]
fn rename_disk_session(args: RenameArgs) -> AppResult<()> {
    let title = args.title.trim();
    if title.is_empty() {
        return Err(error::AppError::Message("Title is empty".into()));
    }
    rename_session(&args.session_id, title)
}

#[tauri::command]
fn get_session_history(args: HistoryArgs) -> AppResult<Vec<HistoryItem>> {
    load_history(&args.session_id, args.limit.unwrap_or(200))
}

#[tauri::command]
fn get_session_signals(args: SessionIdArgs) -> AppResult<SessionSignals> {
    load_signals(&args.session_id)
}

#[tauri::command]
fn list_session_subagents(args: SessionIdArgs) -> AppResult<Vec<SubagentInfo>> {
    list_subagents(&args.session_id)
}

#[tauri::command]
fn get_gui_settings() -> GuiSettings {
    load_settings()
}

#[tauri::command]
fn set_gui_settings(settings: GuiSettings) -> AppResult<()> {
    save_settings(&settings)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrokConfigArgs {
    #[serde(default)]
    project_cwd: Option<String>,
}

#[tauri::command]
fn get_grok_config_overview(args: GrokConfigArgs) -> AppResult<GrokConfigOverview> {
    load_grok_config_overview(args.project_cwd.as_deref())
}

#[tauri::command]
fn get_grok_config_path() -> String {
    config::grok_config::config_toml_path()
        .display()
        .to_string()
}

#[tauri::command]
fn list_live_sessions(handle: tauri::State<'_, Arc<AcpHandle>>) -> Vec<LiveSession> {
    handle.list_live_sessions()
}

#[tauri::command]
fn list_terminals(handle: tauri::State<'_, Arc<AcpHandle>>) -> Vec<TerminalSnapshot> {
    handle.terminals().list_snapshots()
}

/// Write an export file chosen by the user (save dialog). Not sandboxed to project cwd.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListAgentSessionsArgs {
    #[serde(default)]
    cwd: Option<String>,
    #[serde(default)]
    binary_override: Option<String>,
}

#[tauri::command]
async fn list_agent_sessions(
    handle: tauri::State<'_, Arc<AcpHandle>>,
    args: ListAgentSessionsArgs,
) -> AppResult<Vec<AgentSessionInfo>> {
    let cwd = args.cwd.as_deref();
    // Prefer live connection when agent is ready.
    if handle.status() == AgentStatus::Ready {
        if let Ok(list) = handle.list_agent_sessions(cwd).await {
            return Ok(list);
        }
    }
    let settings = load_settings();
    let binary = args.binary_override.or(settings.binary_override);
    list_sessions_ephemeral(cwd, binary.as_deref()).await
}

#[tauri::command]
async fn authenticate_agent(binary_override: Option<String>) -> AppResult<Value> {
    let settings = load_settings();
    let binary = binary_override.or(settings.binary_override);
    authenticate_cached(binary.as_deref()).await
}

#[tauri::command]
fn write_export_file(path: String, content: String) -> AppResult<()> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| {
                error::AppError::Message(format!("create parent dirs: {e}"))
            })?;
        }
    }
    std::fs::write(&p, content.as_bytes())
        .map_err(|e| error::AppError::Message(format!("write {}: {e}", p.display())))?;
    Ok(())
}

#[tauri::command]
fn get_session_models(handle: tauri::State<'_, Arc<AcpHandle>>) -> SessionModelsState {
    handle.models()
}

#[tauri::command]
async fn set_session_model(
    app: tauri::AppHandle,
    handle: tauri::State<'_, Arc<AcpHandle>>,
    args: SetModelArgs,
) -> AppResult<SessionModelsState> {
    handle.set_model(app, &args.model_id).await
}

#[tauri::command]
async fn set_session_effort(
    app: tauri::AppHandle,
    handle: tauri::State<'_, Arc<AcpHandle>>,
    args: SetEffortArgs,
) -> AppResult<SessionModelsState> {
    handle.set_effort(app, &args.effort).await
}

/// Set session mode via ACP `session/set_mode` (plan / ask / auto / always-approve / effort).
#[tauri::command]
async fn set_session_mode(
    app: tauri::AppHandle,
    handle: tauri::State<'_, Arc<AcpHandle>>,
    args: SetModeArgs,
) -> AppResult<SessionModelsState> {
    // Reuse set_effort path — both map to session/set_mode with modeId.
    handle.set_effort(app, &args.mode_id).await
}

#[tauri::command]
fn get_session_plan(args: SessionIdArgs) -> AppResult<Option<String>> {
    load_plan_md(&args.session_id)
}

#[tauri::command]
fn save_session_plan(args: SavePlanArgs) -> AppResult<()> {
    save_plan_md(&args.session_id, &args.content)
}

#[tauri::command]
fn get_plan_mode_state(args: SessionIdArgs) -> AppResult<Option<PlanModeState>> {
    load_plan_mode(&args.session_id)
}

#[tauri::command]
async fn dispatch_session(
    app: tauri::AppHandle,
    handle: tauri::State<'_, Arc<AcpHandle>>,
    args: DispatchArgs,
) -> AppResult<SessionState> {
    handle
        .dispatch(app, args.cwd, args.prompt, args.title)
        .await
}

#[tauri::command]
fn switch_session(
    app: tauri::AppHandle,
    handle: tauri::State<'_, Arc<AcpHandle>>,
    args: SwitchArgs,
) -> AppResult<SessionState> {
    handle.switch_session(&app, &args.session_id)
}

#[tauri::command]
fn pin_live_session(
    app: tauri::AppHandle,
    handle: tauri::State<'_, Arc<AcpHandle>>,
    args: PinArgs,
) -> AppResult<()> {
    handle.pin_session(&app, &args.session_id, args.pinned)
}

#[tauri::command]
fn rename_live_session(
    app: tauri::AppHandle,
    handle: tauri::State<'_, Arc<AcpHandle>>,
    args: RenameArgs,
) -> AppResult<()> {
    let title = args.title.trim();
    if title.is_empty() {
        return Err(error::AppError::Message("Title is empty".into()));
    }
    handle.rename_live(&app, &args.session_id, title)
}

#[tauri::command]
async fn cancel_live_session(
    app: tauri::AppHandle,
    handle: tauri::State<'_, Arc<AcpHandle>>,
    args: SwitchArgs,
) -> AppResult<()> {
    handle.cancel_session(app, &args.session_id).await
}

#[tauri::command]
fn close_live_session(
    app: tauri::AppHandle,
    handle: tauri::State<'_, Arc<AcpHandle>>,
    args: CloseLiveArgs,
) -> AppResult<Option<SessionState>> {
    handle.close_live_session(&app, &args.session_id, args.delete_disk)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let acp = Arc::new(AcpHandle::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(acp)
        .invoke_handler(tauri::generate_handler![
            get_environment,
            get_agent_status,
            get_session,
            connect_agent,
            disconnect_agent,
            new_session,
            send_prompt,
            fuzzy_project_files,
            cancel_turn,
            respond_permission,
            respond_elicitation,
            list_disk_sessions,
            list_agent_sessions,
            authenticate_agent,
            delete_disk_session,
            rename_disk_session,
            get_session_history,
            get_session_signals,
            list_session_subagents,
            get_gui_settings,
            set_gui_settings,
            get_grok_config_overview,
            get_grok_config_path,
            list_live_sessions,
            list_terminals,
            write_export_file,
            get_session_models,
            set_session_model,
            set_session_effort,
            set_session_mode,
            get_session_plan,
            save_session_plan,
            get_plan_mode_state,
            dispatch_session,
            switch_session,
            pin_live_session,
            rename_live_session,
            cancel_live_session,
            close_live_session,
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("Grok Build");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
