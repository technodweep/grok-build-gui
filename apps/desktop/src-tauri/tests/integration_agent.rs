//! Optional live-agent integration tests.
//!
//! Run with:
//! ```bash
//! KAYG_INTEGRATION=1 cargo test -p kayg --test integration_agent -- --nocapture
//! ```
//!
//! Requires a working `grok` binary on PATH (or `GROK_BINARY`) and preferably
//! a valid `~/.grok/auth.json`. These tests spawn a real `grok agent stdio`
//! process for a few seconds.

use std::time::Duration;

fn enabled() -> bool {
    matches!(
        std::env::var("KAYG_INTEGRATION")
            .unwrap_or_default()
            .to_lowercase()
            .as_str(),
        "1" | "true" | "yes" | "on"
    )
}

fn skip_msg() {
    eprintln!("skip: set KAYG_INTEGRATION=1 to run live agent tests");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn integrate_authenticate_cached() {
    if !enabled() {
        skip_msg();
        return;
    }
    let result = tokio::time::timeout(
        Duration::from_secs(45),
        kayg_lib::test_support::authenticate_cached(None),
    )
    .await;
    match result {
        Ok(Ok(v)) => {
            eprintln!("authenticate ok: {v}");
        }
        Ok(Err(e)) => {
            // Auth may fail without credentials; still proves the agent spawns.
            let msg = e.to_string();
            eprintln!("authenticate returned error (may be expected without token): {msg}");
            assert!(
                !msg.contains("GrokNotFound") && !msg.to_lowercase().contains("not found"),
                "grok binary missing: {msg}"
            );
        }
        Err(_) => panic!("authenticate timed out"),
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn integrate_list_sessions_ephemeral() {
    if !enabled() {
        skip_msg();
        return;
    }
    let cwd = std::env::temp_dir().to_string_lossy().to_string();
    let result = tokio::time::timeout(
        Duration::from_secs(60),
        kayg_lib::test_support::list_sessions_ephemeral(Some(&cwd), None),
    )
    .await;
    match result {
        Ok(Ok(list)) => {
            eprintln!("session/list returned {} entries", list.len());
        }
        Ok(Err(e)) => {
            let msg = e.to_string();
            eprintln!("list sessions error: {msg}");
            // Accept auth_required / empty — only hard-fail on missing binary.
            assert!(
                !msg.to_lowercase().contains("grok not found") && !msg.contains("GrokNotFound"),
                "grok binary missing: {msg}"
            );
        }
        Err(_) => panic!("list sessions timed out"),
    }
}
