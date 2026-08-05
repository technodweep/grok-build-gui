//! ACP (Agent Client Protocol) client over `grok agent stdio`.

mod client;
pub mod fs_policy;
mod oneshot;
mod process;
mod protocol;
pub mod terminal;

pub use client::{
    AcpHandle, AgentStatus, ConnectOptions, LiveSession, PermissionDecision, SessionModelsState,
    SessionState,
};
pub use oneshot::{authenticate_cached, list_sessions_ephemeral, AgentSessionInfo};
pub use terminal::TerminalSnapshot;
