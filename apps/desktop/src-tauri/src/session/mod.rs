//! Session helpers — disk index and history hydrate.

mod disk;

pub use disk::{
    delete_session, list_sessions, list_subagents, load_history, load_signals, rename_session,
    DiskSession, HistoryItem, SessionSignals, SubagentInfo,
};
