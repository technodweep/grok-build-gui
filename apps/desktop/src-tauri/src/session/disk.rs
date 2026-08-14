//! Read/write Grok session metadata under `~/.grok/sessions/`.

use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::config;
use crate::error::{AppError, AppResult};

/// In-process cache so scroll-up pagination does not re-parse `updates.jsonl`.
struct HistoryCache {
    session_id: String,
    mtime: SystemTime,
    items: Vec<HistoryItem>,
}

static HISTORY_CACHE: Mutex<Option<HistoryCache>> = Mutex::new(None);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskSession {
    pub id: String,
    pub title: String,
    pub cwd: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub model_id: Option<String>,
    pub num_messages: Option<u64>,
    /// Absolute path to the session directory on disk.
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    pub kind: String,
    pub text: String,
    pub title: Option<String>,
    pub status: Option<String>,
    pub tool_call_id: Option<String>,
    pub tool_kind: Option<String>,
    /// Original event time in epoch ms when present in `updates.jsonl`.
    /// Not invented — omitted when the log line has no timestamp.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ts: Option<u64>,
}

/// One page of session history (newest page first via `before` offset from end).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPage {
    pub items: Vec<HistoryItem>,
    pub total: usize,
    /// More older items exist before this page.
    pub has_more: bool,
    /// How many items from the end are covered after applying this page
    /// (`before` + `items.len()`). Pass as next `before` to load older.
    pub loaded_from_end: usize,
    /// Absolute index of `items[0]` in the full history (0 = oldest).
    pub start_index: usize,
}

/// List sessions, optionally filtered by exact cwd.
pub fn list_sessions(cwd_filter: Option<&str>) -> AppResult<Vec<DiskSession>> {
    let root = config::grok_home().join("sessions");
    if !root.is_dir() {
        return Ok(Vec::new());
    }

    let mut out = Vec::new();
    scan_for_summaries(&root, &mut out)?;

    if let Some(filter) = cwd_filter {
        let filter = filter.trim_end_matches('/');
        out.retain(|s| s.cwd.trim_end_matches('/') == filter);
    }

    out.sort_by(|a, b| {
        b.updated_at
            .cmp(&a.updated_at)
            .then_with(|| b.created_at.cmp(&a.created_at))
    });
    Ok(out)
}

fn scan_for_summaries(dir: &Path, out: &mut Vec<DiskSession>) -> AppResult<()> {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let summary = path.join("summary.json");
            if summary.is_file() {
                if let Ok(s) = parse_summary(&summary) {
                    out.push(s);
                }
            } else {
                scan_for_summaries(&path, out)?;
            }
        }
    }
    Ok(())
}

fn parse_summary(path: &Path) -> AppResult<DiskSession> {
    let raw = fs::read_to_string(path)
        .map_err(|e| AppError::Message(format!("read {}: {e}", path.display())))?;
    let v: Value = serde_json::from_str(&raw)
        .map_err(|e| AppError::Message(format!("parse {}: {e}", path.display())))?;

    let info = v.get("info");
    let id = info
        .and_then(|i| i.get("id"))
        .and_then(|x| x.as_str())
        .or_else(|| {
            path.parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
        })
        .unwrap_or("unknown")
        .to_string();

    let cwd = info
        .and_then(|i| i.get("cwd"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            // Fallback: decode parent group folder name
            path.parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .map(urlencoding_decode)
        })
        .unwrap_or_else(|| "unknown".into());

    let title = v
        .get("generated_title")
        .and_then(|x| x.as_str())
        .or_else(|| v.get("session_summary").and_then(|x| x.as_str()))
        .unwrap_or("(untitled)")
        .to_string();

    let session_dir = path
        .parent()
        .map(|p| p.display().to_string())
        .unwrap_or_default();

    Ok(DiskSession {
        id,
        title,
        cwd,
        created_at: v
            .get("created_at")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string()),
        updated_at: v
            .get("last_active_at")
            .or_else(|| v.get("updated_at"))
            .and_then(|x| x.as_str())
            .map(|s| s.to_string()),
        model_id: v
            .get("current_model_id")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string()),
        num_messages: v.get("num_messages").and_then(|x| x.as_u64()),
        path: session_dir,
    })
}

fn urlencoding_decode(s: &str) -> String {
    // Minimal decode for %2F → /
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = &s[i + 1..i + 3];
            if let Ok(v) = u8::from_str_radix(hex, 16) {
                out.push(v as char);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

/// Permanently delete a session directory by id (searches under sessions/).
pub fn delete_session(session_id: &str) -> AppResult<()> {
    let path = find_session_dir(session_id)?
        .ok_or_else(|| AppError::Message(format!("session not found: {session_id}")))?;
    fs::remove_dir_all(&path)
        .map_err(|e| AppError::Message(format!("delete {}: {e}", path.display())))?;
    Ok(())
}

/// Rename by updating generated_title + session_summary in summary.json.
pub fn rename_session(session_id: &str, title: &str) -> AppResult<()> {
    let dir = find_session_dir(session_id)?
        .ok_or_else(|| AppError::Message(format!("session not found: {session_id}")))?;
    let summary_path = dir.join("summary.json");
    let raw = fs::read_to_string(&summary_path)
        .map_err(|e| AppError::Message(format!("read summary: {e}")))?;
    let mut v: Value =
        serde_json::from_str(&raw).map_err(|e| AppError::Message(format!("parse summary: {e}")))?;
    if let Some(obj) = v.as_object_mut() {
        obj.insert("generated_title".into(), Value::String(title.to_string()));
        obj.insert("session_summary".into(), Value::String(title.to_string()));
    }
    let pretty = serde_json::to_string_pretty(&v)
        .map_err(|e| AppError::Message(format!("serialize summary: {e}")))?;
    fs::write(&summary_path, pretty)
        .map_err(|e| AppError::Message(format!("write summary: {e}")))?;
    Ok(())
}

pub fn find_session_dir(session_id: &str) -> AppResult<Option<PathBuf>> {
    let root = config::grok_home().join("sessions");
    if !root.is_dir() {
        return Ok(None);
    }
    Ok(find_dir_named(&root, session_id))
}

fn find_dir_named(dir: &Path, name: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if path.file_name().and_then(|n| n.to_str()) == Some(name)
                && path.join("summary.json").is_file()
            {
                return Some(path);
            }
            if let Some(found) = find_dir_named(&path, name) {
                return Some(found);
            }
        }
    }
    None
}

/// Load `plan.md` for a session if present.
pub fn load_plan_md(session_id: &str) -> AppResult<Option<String>> {
    let dir = find_session_dir(session_id)?;
    let Some(dir) = dir else {
        return Ok(None);
    };
    let path = dir.join("plan.md");
    if !path.is_file() {
        return Ok(None);
    }
    let text = fs::read_to_string(&path)
        .map_err(|e| AppError::Message(format!("read plan.md: {e}")))?;
    Ok(Some(text))
}

/// Write `plan.md` for a session (creates file).
pub fn save_plan_md(session_id: &str, content: &str) -> AppResult<()> {
    let dir = find_session_dir(session_id)?
        .ok_or_else(|| AppError::Message(format!("session not found: {session_id}")))?;
    let path = dir.join("plan.md");
    fs::write(&path, content).map_err(|e| AppError::Message(format!("write plan.md: {e}")))?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanModeState {
    pub state: String,
    #[serde(default)]
    pub was_previously_active: bool,
    #[serde(default)]
    pub awaiting_plan_approval: bool,
}

/// Read `plan_mode.json` if present.
pub fn load_plan_mode(session_id: &str) -> AppResult<Option<PlanModeState>> {
    let dir = find_session_dir(session_id)?;
    let Some(dir) = dir else {
        return Ok(None);
    };
    let path = dir.join("plan_mode.json");
    if !path.is_file() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)
        .map_err(|e| AppError::Message(format!("read plan_mode.json: {e}")))?;
    let v: Value = serde_json::from_str(&raw)
        .map_err(|e| AppError::Message(format!("parse plan_mode.json: {e}")))?;
    Ok(Some(PlanModeState {
        state: v
            .get("state")
            .and_then(|x| x.as_str())
            .unwrap_or("Inactive")
            .to_string(),
        was_previously_active: v
            .get("was_previously_active")
            .and_then(|x| x.as_bool())
            .unwrap_or(false),
        awaiting_plan_approval: v
            .get("awaiting_plan_approval")
            .and_then(|x| x.as_bool())
            .unwrap_or(false),
    }))
}

/// Best-effort hydrate of scrollback from `updates.jsonl`.
///
/// `before` = number of newest items already loaded (skip from the end).
/// First page: `limit=150, before=0` → newest 150.
/// Older page: `limit=100, before=150` → next 100 older, etc.
pub fn load_history(session_id: &str, limit: usize, before: usize) -> AppResult<HistoryPage> {
    let limit = limit.clamp(1, 500);
    let all = load_history_all_cached(session_id)?;
    let total = all.len();
    if total == 0 {
        return Ok(HistoryPage {
            items: Vec::new(),
            total: 0,
            has_more: false,
            loaded_from_end: 0,
            start_index: 0,
        });
    }

    let end = total.saturating_sub(before);
    if end == 0 {
        return Ok(HistoryPage {
            items: Vec::new(),
            total,
            has_more: false,
            loaded_from_end: before.min(total),
            start_index: 0,
        });
    }
    let start = end.saturating_sub(limit);
    let items = all[start..end].to_vec();
    let loaded_from_end = before + items.len();
    let has_more = start > 0;

    Ok(HistoryPage {
        items,
        total,
        has_more,
        loaded_from_end,
        start_index: start,
    })
}

fn updates_mtime(path: &Path) -> SystemTime {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH)
}

fn load_history_all_cached(session_id: &str) -> AppResult<Vec<HistoryItem>> {
    let dir = find_session_dir(session_id)?
        .ok_or_else(|| AppError::Message(format!("session not found: {session_id}")))?;
    let updates = dir.join("updates.jsonl");
    if !updates.is_file() {
        return Ok(Vec::new());
    }
    let mtime = updates_mtime(&updates);

    if let Ok(guard) = HISTORY_CACHE.lock() {
        if let Some(cache) = guard.as_ref() {
            if cache.session_id == session_id && cache.mtime == mtime {
                return Ok(cache.items.clone());
            }
        }
    }

    let items = parse_history_file(&updates)?;
    if let Ok(mut guard) = HISTORY_CACHE.lock() {
        *guard = Some(HistoryCache {
            session_id: session_id.to_string(),
            mtime,
            items: items.clone(),
        });
    }
    Ok(items)
}

fn parse_history_file(updates: &Path) -> AppResult<Vec<HistoryItem>> {
    let file =
        fs::File::open(updates).map_err(|e| AppError::Message(format!("open updates: {e}")))?;
    let reader = BufReader::new(file);

    // Keep only user/agent/thought/tool chunks; merge consecutive same-kind text.
    let mut items: Vec<HistoryItem> = Vec::new();
    for line in reader.lines().map_while(Result::ok) {
        if line.trim().is_empty() {
            continue;
        }
        let Ok(v) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let update = v
            .pointer("/params/update")
            .or_else(|| v.get("update"))
            .cloned();
        let Some(update) = update else { continue };
        let kind = update
            .get("sessionUpdate")
            .and_then(|x| x.as_str())
            .unwrap_or("");
        // Only use timestamps already present in the log — never invent.
        let line_ts = extract_line_ts(&v);

        match kind {
            "user_message_chunk" | "agent_message_chunk" | "agent_thought_chunk" => {
                let text = extract_text(&update);
                if text.is_empty() {
                    continue;
                }
                let item_kind = match kind {
                    "user_message_chunk" => "user",
                    "agent_thought_chunk" => "thought",
                    _ => "agent",
                };
                if let Some(last) = items.last_mut() {
                    if last.kind == item_kind {
                        last.text.push_str(&text);
                        // Keep first-seen original ts for the merged item.
                        continue;
                    }
                }
                items.push(HistoryItem {
                    kind: item_kind.into(),
                    text,
                    title: None,
                    status: None,
                    tool_call_id: None,
                    tool_kind: None,
                    ts: line_ts,
                });
            }
            "tool_call" | "tool_call_update" => {
                let tool_call_id = update
                    .get("toolCallId")
                    .and_then(|x| x.as_str())
                    .unwrap_or("tool")
                    .to_string();
                let title = update
                    .get("title")
                    .and_then(|x| x.as_str())
                    .unwrap_or("tool")
                    .to_string();
                let status = update
                    .get("status")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string());
                let tool_kind = update
                    .get("kind")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string());

                if let Some(last) = items.iter_mut().rev().find(|i| {
                    i.kind == "tool" && i.tool_call_id.as_deref() == Some(tool_call_id.as_str())
                }) {
                    last.title = Some(title);
                    if status.is_some() {
                        last.status = status;
                    }
                    if tool_kind.is_some() {
                        last.tool_kind = tool_kind;
                    }
                    // Preserve first-seen ts; fill only if missing.
                    if last.ts.is_none() {
                        last.ts = line_ts;
                    }
                } else {
                    items.push(HistoryItem {
                        kind: "tool".into(),
                        text: String::new(),
                        title: Some(title),
                        status,
                        tool_call_id: Some(tool_call_id),
                        tool_kind,
                        ts: line_ts,
                    });
                }
            }
            _ => {}
        }
    }
    Ok(items)
}

fn extract_text(update: &Value) -> String {
    let content = update.get("content");
    if let Some(s) = content.and_then(|c| c.as_str()) {
        return s.to_string();
    }
    if let Some(s) = content.and_then(|c| c.get("text")).and_then(|t| t.as_str()) {
        return s.to_string();
    }
    String::new()
}

/// Read original timestamps already stored in `updates.jsonl`.
/// Prefers `_meta.agentTimestampMs` (ms), else top-level `timestamp` (sec or ms).
fn extract_line_ts(v: &Value) -> Option<u64> {
    let ms = v
        .pointer("/params/_meta/agentTimestampMs")
        .and_then(|x| as_u64(x))
        .or_else(|| v.pointer("/_meta/agentTimestampMs").and_then(|x| as_u64(x)));
    if let Some(ms) = ms {
        return Some(ms);
    }
    let t = v.get("timestamp").and_then(|x| as_u64(x))?;
    // Heuristic: values below ~1e12 are unix seconds; larger are ms.
    Some(if t < 1_000_000_000_000 { t.saturating_mul(1000) } else { t })
}

fn as_u64(v: &Value) -> Option<u64> {
    v.as_u64()
        .or_else(|| v.as_i64().map(|n| n.max(0) as u64))
        .or_else(|| v.as_f64().map(|n| n.max(0.0) as u64))
}

/// Session usage / context signals from `signals.json` (best-effort).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSignals {
    pub session_id: String,
    pub context_tokens_used: u64,
    pub context_window_tokens: u64,
    /// 0.0–1.0 when known.
    pub context_window_usage: f64,
    pub turn_count: u64,
    pub user_message_count: u64,
    pub assistant_message_count: u64,
    pub tool_call_count: u64,
    pub error_count: u64,
    pub compaction_count: u64,
    pub primary_model_id: Option<String>,
    pub models_used: Vec<String>,
    pub tools_used: Vec<String>,
    pub session_duration_seconds: u64,
    pub avg_time_to_first_token_ms: u64,
    pub avg_response_time_ms: u64,
    pub agent_lines_added: u64,
    pub agent_lines_removed: u64,
    pub agent_files_touched: u64,
    pub human_files_touched: u64,
    pub total_files_touched: u64,
    pub free_tokens: u64,
    pub usage_percent: f64,
}

/// Child / subagent entry (disk + best-effort schema).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubagentInfo {
    pub id: String,
    pub parent_session_id: String,
    pub name: Option<String>,
    pub agent_type: Option<String>,
    pub status: Option<String>,
    pub title: Option<String>,
    pub child_session_id: Option<String>,
    /// Isolation mode: `none` | `worktree` | …
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub isolation: Option<String>,
    /// Worktree path when isolation is worktree.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,
    /// Persona applied to this subagent, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub persona: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    /// true when observed from live tool stream rather than disk only.
    #[serde(default)]
    pub live: bool,
}

/// List subagents recorded under `session/subagents/` for a parent session.
pub fn list_subagents(parent_session_id: &str) -> AppResult<Vec<SubagentInfo>> {
    let dir = find_session_dir(parent_session_id)?
        .ok_or_else(|| AppError::Message(format!("session not found: {parent_session_id}")))?;
    let sub_root = dir.join("subagents");
    if !sub_root.is_dir() {
        return Ok(Vec::new());
    }

    let mut out = Vec::new();
    let entries = fs::read_dir(&sub_root)
        .map_err(|e| AppError::Message(format!("read subagents: {e}")))?;
    for entry in entries.flatten() {
        let path = entry.path();
        // meta.json either directly or in a subdirectory
        let meta_path = if path.is_file() && path.file_name().and_then(|n| n.to_str()) == Some("meta.json")
        {
            path.clone()
        } else if path.is_dir() {
            let m = path.join("meta.json");
            if m.is_file() {
                m
            } else {
                continue;
            }
        } else {
            continue;
        };

        let raw = match fs::read_to_string(&meta_path) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let v: Value = match serde_json::from_str(&raw) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let id = v
            .get("id")
            .or_else(|| v.get("subagentId"))
            .or_else(|| v.get("agentId"))
            .and_then(|x| x.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                path.file_name()
                    .and_then(|n| n.to_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| "unknown".into());

        let isolation = v
            .get("isolation")
            .or_else(|| v.get("isolationMode"))
            .or_else(|| v.get("isolation_mode"))
            .and_then(|x| x.as_str())
            .map(|s| s.to_string());
        let worktree_path = v
            .get("worktreePath")
            .or_else(|| v.get("worktree_path"))
            .or_else(|| v.get("worktree"))
            .and_then(|x| {
                if let Some(s) = x.as_str() {
                    Some(s.to_string())
                } else {
                    x.get("path").and_then(|p| p.as_str()).map(|s| s.to_string())
                }
            });
        let isolation = isolation.or_else(|| {
            if worktree_path.is_some() {
                Some("worktree".into())
            } else {
                None
            }
        });

        out.push(SubagentInfo {
            id,
            parent_session_id: parent_session_id.to_string(),
            // Prefer human title/description as the display name when no name field.
            name: v
                .get("name")
                .or_else(|| v.get("agentName"))
                .or_else(|| v.get("description"))
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            agent_type: v
                .get("agentType")
                .or_else(|| v.get("subagent_type"))
                .or_else(|| v.get("subagentType"))
                .or_else(|| v.get("type"))
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            status: v
                .get("status")
                .or_else(|| v.get("state"))
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            title: v
                .get("title")
                .or_else(|| v.get("summary"))
                .or_else(|| v.get("description"))
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            child_session_id: v
                .get("sessionId")
                .or_else(|| v.get("childSessionId"))
                .or_else(|| v.get("session_id"))
                .or_else(|| v.get("child_session_id"))
                // CLI often sets child_session_id == subagent_id
                .or_else(|| v.get("subagent_id"))
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            isolation,
            worktree_path,
            persona: v
                .get("persona")
                .or_else(|| v.get("personaName"))
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            model_id: v
                .get("modelId")
                .or_else(|| v.get("model"))
                .or_else(|| v.get("model_id"))
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            live: false,
        });
    }

    // Active / running first, then completed; stable by id within group.
    out.sort_by(|a, b| {
        let rank = |s: &SubagentInfo| -> u8 {
            let st = s.status.as_deref().unwrap_or("").to_ascii_lowercase();
            if s.live
                || st.contains("run")
                || st.contains("work")
                || st.contains("active")
                || st.contains("progress")
                || st.contains("pending")
            {
                0
            } else if st.contains("fail") || st.contains("error") || st.contains("cancel") {
                1
            } else {
                2
            }
        };
        rank(a)
            .cmp(&rank(b))
            .then_with(|| b.id.cmp(&a.id)) // newest-ish ids first
    });
    Ok(out)
}

pub fn load_signals(session_id: &str) -> AppResult<SessionSignals> {
    let dir = find_session_dir(session_id)?
        .ok_or_else(|| AppError::Message(format!("session not found: {session_id}")))?;
    let path = dir.join("signals.json");
    if !path.is_file() {
        return Err(AppError::Message(
            "signals.json not found yet (send a prompt first)".into(),
        ));
    }
    let raw = fs::read_to_string(&path)
        .map_err(|e| AppError::Message(format!("read signals: {e}")))?;
    let v: Value = serde_json::from_str(&raw)
        .map_err(|e| AppError::Message(format!("parse signals: {e}")))?;

    let used = v
        .get("contextTokensUsed")
        .and_then(|x| x.as_u64())
        .unwrap_or(0);
    let window = v
        .get("contextWindowTokens")
        .and_then(|x| x.as_u64())
        .unwrap_or(0);
    let usage = v
        .get("contextWindowUsage")
        .and_then(|x| x.as_f64())
        .unwrap_or_else(|| {
            if window > 0 {
                used as f64 / window as f64
            } else {
                0.0
            }
        });
    let free = window.saturating_sub(used);
    let usage_percent = if window > 0 {
        (used as f64 / window as f64) * 100.0
    } else {
        usage * 100.0
    };

    let models_used = v
        .get("modelsUsed")
        .and_then(|x| x.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let tools_used = v
        .get("toolsUsed")
        .and_then(|x| x.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    Ok(SessionSignals {
        session_id: session_id.to_string(),
        context_tokens_used: used,
        context_window_tokens: window,
        context_window_usage: usage,
        turn_count: v.get("turnCount").and_then(|x| x.as_u64()).unwrap_or(0),
        user_message_count: v
            .get("userMessageCount")
            .and_then(|x| x.as_u64())
            .unwrap_or(0),
        assistant_message_count: v
            .get("assistantMessageCount")
            .and_then(|x| x.as_u64())
            .unwrap_or(0),
        tool_call_count: v
            .get("toolCallCount")
            .and_then(|x| x.as_u64())
            .unwrap_or(0),
        error_count: v.get("errorCount").and_then(|x| x.as_u64()).unwrap_or(0),
        compaction_count: v
            .get("compactionCount")
            .and_then(|x| x.as_u64())
            .unwrap_or(0),
        primary_model_id: v
            .get("primaryModelId")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string()),
        models_used,
        tools_used,
        session_duration_seconds: v
            .get("sessionDurationSeconds")
            .and_then(|x| x.as_u64())
            .unwrap_or(0),
        avg_time_to_first_token_ms: v
            .get("avgTimeToFirstTokenMs")
            .and_then(|x| x.as_u64())
            .unwrap_or(0),
        avg_response_time_ms: v
            .get("avgResponseTimeMs")
            .and_then(|x| x.as_u64())
            .unwrap_or(0),
        agent_lines_added: v
            .get("agentLinesAdded")
            .and_then(|x| x.as_u64())
            .unwrap_or(0),
        agent_lines_removed: v
            .get("agentLinesRemoved")
            .and_then(|x| x.as_u64())
            .unwrap_or(0),
        agent_files_touched: v
            .get("agentFilesTouched")
            .and_then(|x| x.as_u64())
            .unwrap_or(0),
        human_files_touched: v
            .get("humanFilesTouched")
            .and_then(|x| x.as_u64())
            .unwrap_or(0),
        total_files_touched: v
            .get("totalFilesTouched")
            .and_then(|x| x.as_u64())
            .unwrap_or(0),
        free_tokens: free,
        usage_percent,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn urldecode_slash() {
        assert_eq!(urlencoding_decode("%2Fhome%2Fsandeep"), "/home/sandeep");
    }

    #[test]
    fn parse_summary_from_disk() {
        let dir = std::env::temp_dir().join(format!(
            "grok-gui-session-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let summary = dir.join("summary.json");
        // Shape matches on-disk Grok summary.json (title/model at root).
        let body = r#"{
          "info": {
            "id": "sess-abc",
            "cwd": "/tmp/project"
          },
          "generated_title": "Test session",
          "created_at": "2026-01-01T00:00:00Z",
          "last_active_at": "2026-01-02T00:00:00Z",
          "current_model_id": "grok-4.5",
          "num_messages": 3
        }"#;
        let mut f = fs::File::create(&summary).unwrap();
        f.write_all(body.as_bytes()).unwrap();
        let s = parse_summary(&summary).unwrap();
        assert_eq!(s.id, "sess-abc");
        assert_eq!(s.title, "Test session");
        assert_eq!(s.cwd, "/tmp/project");
        assert_eq!(s.model_id.as_deref(), Some("grok-4.5"));
        assert_eq!(s.num_messages, Some(3));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_sessions_filters_cwd() {
        let root = std::env::temp_dir().join(format!(
            "grok-gui-sessions-root-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let a = root.join("%2Ftmp%2Fa").join("sess1");
        let b = root.join("%2Ftmp%2Fb").join("sess2");
        fs::create_dir_all(&a).unwrap();
        fs::create_dir_all(&b).unwrap();
        for (path, id, cwd) in [
            (a.join("summary.json"), "s1", "/tmp/a"),
            (b.join("summary.json"), "s2", "/tmp/b"),
        ] {
            let body = format!(
                r#"{{"info":{{"id":"{id}","cwd":"{cwd}"}},"generated_title":"{id}"}}"#
            );
            fs::write(&path, body).unwrap();
        }

        // scan_for_summaries is private; exercise via temporary GROK_HOME
        // SAFETY: test-only process isolation
        let prev = std::env::var("GROK_HOME").ok();
        unsafe {
            std::env::set_var("GROK_HOME", root.parent().unwrap().join("fake-grok-home"));
        }
        // Put sessions under fake home
        let home = crate::config::grok_home();
        let sessions = home.join("sessions");
        let _ = fs::remove_dir_all(&sessions);
        // copy tree
        copy_dir(&root, &sessions);
        let all = list_sessions(None).unwrap();
        assert!(all.len() >= 2);
        let filtered = list_sessions(Some("/tmp/a")).unwrap();
        assert!(filtered.iter().all(|s| s.cwd.trim_end_matches('/') == "/tmp/a"));
        assert!(!filtered.is_empty());
        match prev {
            Some(v) => unsafe { std::env::set_var("GROK_HOME", v) },
            None => unsafe { std::env::remove_var("GROK_HOME") },
        }
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&home);
    }

    fn copy_dir(src: &Path, dst: &Path) {
        fs::create_dir_all(dst).unwrap();
        for e in fs::read_dir(src).unwrap().flatten() {
            let p = e.path();
            let to = dst.join(e.file_name());
            if p.is_dir() {
                copy_dir(&p, &to);
            } else {
                fs::copy(&p, &to).unwrap();
            }
        }
    }
}
