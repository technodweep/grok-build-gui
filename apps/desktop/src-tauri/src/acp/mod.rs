//! ACP (Agent Client Protocol) client over `grok agent stdio`.

mod client;
pub mod fs_policy;
mod process;
mod protocol;
pub mod terminal;

pub use client::{
    AcpHandle, AgentStatus, ConnectOptions, LiveSession, PermissionDecision, SessionModelsState,
    SessionState,
};
pub use terminal::TerminalSnapshot;
