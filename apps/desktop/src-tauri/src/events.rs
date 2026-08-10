//! Event names emitted from Rust to the frontend.

pub const AGENT_STATUS: &str = "agent://status";
pub const SESSION_UPDATE: &str = "session://update";
pub const PERMISSION_REQUEST: &str = "session://permission";
pub const AGENT_ERROR: &str = "agent://error";
/// Full live-session roster snapshot for the dashboard.
pub const ROSTER: &str = "agent://roster";
/// Live terminal output snapshot (ACP terminal host).
pub const TERMINAL_UPDATE: &str = "terminal://update";
pub const TERMINAL_CLOSED: &str = "terminal://closed";
/// Available models + current model/effort for the active session.
pub const MODELS_UPDATE: &str = "session://models";
/// ACP elicitation/create request for structured user input.
pub const ELICITATION_REQUEST: &str = "session://elicitation";
/// Grok `_x.ai/ask_user_question` (TUI question card).
pub const USER_QUESTION_REQUEST: &str = "session://user_question";
/// Grok `_x.ai/exit_plan_mode` (plan approval card).
pub const PLAN_APPROVAL_REQUEST: &str = "session://plan_approval";
