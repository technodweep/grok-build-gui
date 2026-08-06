//! Cross-session memory browser + local media helpers.
//! Memory files live under `~/.grok/memory/`; the agent owns indexing and tools.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};
use toml::Value as TomlValue;
use toml_edit::{value, DocumentMut, Item, Table};

use super::grok_config::config_toml_path;
use super::grok_home;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryFileEntry {
    pub path: String,
    pub rel_path: String,
    /// global | workspace | session
    pub scope: String,
    /// Workspace slug or empty for global.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace: Option<String>,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub modified_ms: Option<u64>,
    /// Session log files may be deleted from the GUI.
    pub deletable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryCatalog {
    pub memory_root: String,
    pub config_enabled: bool,
    pub env_enabled: Option<bool>,
    pub files: Vec<MemoryFileEntry>,
    #[serde(default)]
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryFileContent {
    pub path: String,
    pub content: String,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalMediaData {
    pub path: String,
    pub mime: String,
    /// data URL (data:mime;base64,...)
    pub data_url: String,
    pub size_bytes: u64,
    pub kind: String, // image | video | other
}

pub fn memory_root() -> PathBuf {
    grok_home().join("memory")
}

fn mtime_ms(meta: &std::fs::Metadata) -> Option<u64> {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
}

fn read_memory_enabled_from_config() -> bool {
    let path = config_toml_path();
    let Ok(raw) = fs::read_to_string(&path) else {
        return false;
    };
    let Ok(doc) = raw.parse::<TomlValue>() else {
        return false;
    };
    doc.get("memory")
        .and_then(|m| m.get("enabled"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

fn env_memory_flag() -> Option<bool> {
    match std::env::var("GROK_MEMORY") {
        Ok(v) => {
            let t = v.trim().to_lowercase();
            if t == "1" || t == "true" || t == "yes" || t == "on" {
                Some(true)
            } else if t == "0" || t == "false" || t == "no" || t == "off" {
                Some(false)
            } else {
                None
            }
        }
        Err(_) => None,
    }
}

/// List all markdown (and related) memory files under `~/.grok/memory/`.
pub fn load_memory_catalog() -> MemoryCatalog {
    let root = memory_root();
    let mut files = Vec::new();
    let mut notes = Vec::new();

    if !root.is_dir() {
        notes.push(
            "No memory directory yet. Enable memory and use /remember or /flush to create it."
                .into(),
        );
        return MemoryCatalog {
            memory_root: root.display().to_string(),
            config_enabled: read_memory_enabled_from_config(),
            env_enabled: env_memory_flag(),
            files,
            notes,
        };
    }

    // Global MEMORY.md
    let global = root.join("MEMORY.md");
    if global.is_file() {
        if let Ok(meta) = fs::metadata(&global) {
            files.push(MemoryFileEntry {
                path: global.display().to_string(),
                rel_path: "MEMORY.md".into(),
                scope: "global".into(),
                workspace: None,
                name: "MEMORY.md".into(),
                size_bytes: Some(meta.len()),
                modified_ms: mtime_ms(&meta),
                deletable: false,
            });
        }
    }

    // Workspace dirs: <slug>-<hash>/
    let Ok(entries) = fs::read_dir(&root) else {
        return MemoryCatalog {
            memory_root: root.display().to_string(),
            config_enabled: read_memory_enabled_from_config(),
            env_enabled: env_memory_flag(),
            files,
            notes,
        };
    };

    for ent in entries.flatten() {
        let p = ent.path();
        if !p.is_dir() {
            continue;
        }
        let ws_name = ent.file_name().to_string_lossy().to_string();
        // Workspace MEMORY.md
        let ws_mem = p.join("MEMORY.md");
        if ws_mem.is_file() {
            if let Ok(meta) = fs::metadata(&ws_mem) {
                files.push(MemoryFileEntry {
                    path: ws_mem.display().to_string(),
                    rel_path: format!("{ws_name}/MEMORY.md"),
                    scope: "workspace".into(),
                    workspace: Some(ws_name.clone()),
                    name: "MEMORY.md".into(),
                    size_bytes: Some(meta.len()),
                    modified_ms: mtime_ms(&meta),
                    deletable: false,
                });
            }
        }
        // Sessions
        let sessions = p.join("sessions");
        if sessions.is_dir() {
            if let Ok(sess) = fs::read_dir(&sessions) {
                for s in sess.flatten() {
                    let sp = s.path();
                    if !sp.is_file() {
                        continue;
                    }
                    let fname = s.file_name().to_string_lossy().to_string();
                    if !fname.ends_with(".md") && !fname.ends_with(".markdown") {
                        continue;
                    }
                    if let Ok(meta) = fs::metadata(&sp) {
                        files.push(MemoryFileEntry {
                            path: sp.display().to_string(),
                            rel_path: format!("{ws_name}/sessions/{fname}"),
                            scope: "session".into(),
                            workspace: Some(ws_name.clone()),
                            name: fname,
                            size_bytes: Some(meta.len()),
                            modified_ms: mtime_ms(&meta),
                            deletable: true,
                        });
                    }
                }
            }
        }
        // Other md files at workspace root
        if let Ok(ws_ents) = fs::read_dir(&p) {
            for we in ws_ents.flatten() {
                let wp = we.path();
                if !wp.is_file() {
                    continue;
                }
                let fname = we.file_name().to_string_lossy().to_string();
                if fname.eq_ignore_ascii_case("MEMORY.md") {
                    continue;
                }
                if !(fname.ends_with(".md") || fname.ends_with(".markdown")) {
                    continue;
                }
                if let Ok(meta) = fs::metadata(&wp) {
                    files.push(MemoryFileEntry {
                        path: wp.display().to_string(),
                        rel_path: format!("{ws_name}/{fname}"),
                        scope: "workspace".into(),
                        workspace: Some(ws_name.clone()),
                        name: fname,
                        size_bytes: Some(meta.len()),
                        modified_ms: mtime_ms(&meta),
                        deletable: false,
                    });
                }
            }
        }
    }

    // Sort: global first, then workspace MEMORY, then sessions by mtime desc
    files.sort_by(|a, b| {
        let sa = scope_rank(&a.scope);
        let sb = scope_rank(&b.scope);
        sa.cmp(&sb)
            .then_with(|| b.modified_ms.unwrap_or(0).cmp(&a.modified_ms.unwrap_or(0)))
            .then_with(|| a.rel_path.cmp(&b.rel_path))
    });

    if files.is_empty() {
        notes.push("Memory directory exists but no MEMORY.md or session logs yet.".into());
    }
    if !read_memory_enabled_from_config() && env_memory_flag() != Some(true) {
        notes.push(
            "Memory is off in config. Enable it here or send /memory on in a session.".into(),
        );
    }

    MemoryCatalog {
        memory_root: root.display().to_string(),
        config_enabled: read_memory_enabled_from_config(),
        env_enabled: env_memory_flag(),
        files,
        notes,
    }
}

fn scope_rank(scope: &str) -> u8 {
    match scope {
        "global" => 0,
        "workspace" => 1,
        "session" => 2,
        _ => 3,
    }
}

/// Read a memory file if it lies under `~/.grok/memory/`.
pub fn read_memory_file(path: &str, max_chars: usize) -> AppResult<MemoryFileContent> {
    let path = path.trim();
    if path.is_empty() {
        return Err(AppError::Message("path is empty".into()));
    }
    let root = memory_root()
        .canonicalize()
        .map_err(|e| AppError::Message(format!("memory root: {e}")))?;
    let p = PathBuf::from(path);
    let canon = p
        .canonicalize()
        .map_err(|e| AppError::Message(format!("resolve path: {e}")))?;
    if !canon.starts_with(&root) {
        return Err(AppError::Message(
            "refusing to read path outside ~/.grok/memory".into(),
        ));
    }
    let raw = fs::read_to_string(&canon).map_err(|e| AppError::Message(e.to_string()))?;
    let max = max_chars.clamp(1_000, 500_000);
    let truncated = raw.chars().count() > max;
    let content: String = if truncated {
        raw.chars().take(max).collect::<String>() + "\n\n… (truncated)"
    } else {
        raw
    };
    Ok(MemoryFileContent {
        path: canon.display().to_string(),
        content,
        truncated,
    })
}

/// Delete a session memory file (not global/workspace MEMORY.md).
pub fn delete_memory_file(path: &str) -> AppResult<()> {
    let path = path.trim();
    if path.is_empty() {
        return Err(AppError::Message("path is empty".into()));
    }
    let root = memory_root()
        .canonicalize()
        .map_err(|e| AppError::Message(format!("memory root: {e}")))?;
    let canon = PathBuf::from(path)
        .canonicalize()
        .map_err(|e| AppError::Message(format!("resolve path: {e}")))?;
    if !canon.starts_with(&root) {
        return Err(AppError::Message(
            "refusing to delete path outside ~/.grok/memory".into(),
        ));
    }
    // Only allow under .../sessions/
    let rel = canon
        .strip_prefix(&root)
        .map_err(|_| AppError::Message("path not under memory root".into()))?;
    let rel_s = rel.to_string_lossy();
    if !rel_s.contains("sessions/") && !rel_s.contains("sessions\\") {
        return Err(AppError::Message(
            "only session logs under sessions/ can be deleted".into(),
        ));
    }
    if canon
        .file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.eq_ignore_ascii_case("MEMORY.md"))
        .unwrap_or(false)
    {
        return Err(AppError::Message("cannot delete MEMORY.md".into()));
    }
    fs::remove_file(&canon).map_err(|e| AppError::Message(format!("delete: {e}")))?;
    Ok(())
}

/// Persist `[memory].enabled` in `~/.grok/config.toml`.
/// Session still needs `/memory on` or a reconnect for live tools.
pub fn set_memory_config_enabled(enabled: bool) -> AppResult<bool> {
    let path = config_toml_path();
    let mut doc = if path.is_file() {
        let raw = fs::read_to_string(&path)
            .map_err(|e| AppError::Message(format!("read config.toml: {e}")))?;
        raw.parse::<DocumentMut>()
            .map_err(|e| AppError::Message(format!("parse config.toml: {e}")))?
    } else {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| AppError::Message(format!("create grok home: {e}")))?;
        }
        DocumentMut::new()
    };

    {
        let mem = doc["memory"]
            .or_insert(Item::Table(Table::new()))
            .as_table_mut()
            .ok_or_else(|| AppError::Message("memory is not a table".into()))?;
        mem["enabled"] = value(enabled);
    }

    fs::write(&path, doc.to_string())
        .map_err(|e| AppError::Message(format!("write config.toml: {e}")))?;
    Ok(enabled)
}

// ── Local media (imagine gallery + prompt image attach) ────────────────────

fn mime_for_path(path: &Path) -> (&'static str, &'static str) {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "png" => ("image/png", "image"),
        "jpg" | "jpeg" => ("image/jpeg", "image"),
        "gif" => ("image/gif", "image"),
        "webp" => ("image/webp", "image"),
        "bmp" => ("image/bmp", "image"),
        "svg" => ("image/svg+xml", "image"),
        "mp4" => ("video/mp4", "video"),
        "webm" => ("video/webm", "video"),
        "mov" => ("video/quicktime", "video"),
        "mkv" => ("video/x-matroska", "video"),
        _ => ("application/octet-stream", "other"),
    }
}

fn path_allowed_for_media(path: &Path, project_cwd: Option<&str>) -> bool {
    let Ok(canon) = path.canonicalize() else {
        return false;
    };
    // Home .grok
    if let Ok(home) = grok_home().canonicalize() {
        if canon.starts_with(&home) {
            return true;
        }
    }
    // Project cwd
    if let Some(cwd) = project_cwd {
        if let Ok(root) = PathBuf::from(cwd).canonicalize() {
            if canon.starts_with(&root) {
                return true;
            }
        }
    }
    // /tmp and common temp
    if canon.starts_with("/tmp") || canon.starts_with("/var/tmp") {
        return true;
    }
    // User home Downloads / Pictures (best-effort)
    if let Some(home) = dirs::home_dir() {
        if let Ok(h) = home.canonicalize() {
            if canon.starts_with(h.join("Downloads"))
                || canon.starts_with(h.join("Pictures"))
                || canon.starts_with(h.join(".cache"))
            {
                return true;
            }
        }
    }
    false
}

/// Read a local image/video as a data URL for the webview (size-capped).
pub fn read_local_media(
    path: &str,
    project_cwd: Option<&str>,
    max_bytes: usize,
) -> AppResult<LocalMediaData> {
    let path = path.trim();
    if path.is_empty() {
        return Err(AppError::Message("path is empty".into()));
    }
    // Strip file:// prefix
    let path = path
        .strip_prefix("file://")
        .unwrap_or(path)
        .to_string();
    let p = {
        let raw = PathBuf::from(&path);
        if raw.is_absolute() {
            raw
        } else if let Some(cwd) = project_cwd {
            PathBuf::from(cwd).join(&raw)
        } else {
            raw
        }
    };
    if !path_allowed_for_media(&p, project_cwd) {
        return Err(AppError::Message(
            "media path not under project, ~/.grok, or allowed temp dirs".into(),
        ));
    }
    let canon = p
        .canonicalize()
        .map_err(|e| AppError::Message(format!("resolve: {e}")))?;
    let meta = fs::metadata(&canon).map_err(|e| AppError::Message(e.to_string()))?;
    let max = max_bytes.clamp(64 * 1024, 24 * 1024 * 1024);
    if meta.len() as usize > max {
        return Err(AppError::Message(format!(
            "file too large ({} bytes; max {})",
            meta.len(),
            max
        )));
    }
    let bytes = fs::read(&canon).map_err(|e| AppError::Message(e.to_string()))?;
    let (mime, kind) = mime_for_path(&canon);
    let b64 = B64.encode(&bytes);
    Ok(LocalMediaData {
        path: canon.display().to_string(),
        mime: mime.into(),
        data_url: format!("data:{mime};base64,{b64}"),
        size_bytes: meta.len(),
        kind: kind.into(),
    })
}

/// Scan recent media files under project + ~/.grok for the imagine gallery.
pub fn list_recent_media(
    project_cwd: Option<&str>,
    limit: usize,
) -> AppResult<Vec<MemoryFileEntry>> {
    let mut out: Vec<MemoryFileEntry> = Vec::new();
    let limit = limit.clamp(1, 100);

    let mut roots: Vec<PathBuf> = Vec::new();
    if let Some(cwd) = project_cwd {
        let c = PathBuf::from(cwd);
        roots.push(c.join("images"));
        roots.push(c.join("media"));
        roots.push(c.join(".grok").join("images"));
        // Also shallow scan project root for loose images
        roots.push(c);
    }
    roots.push(grok_home().join("downloads"));
    // Session dirs may hold generated assets
    roots.push(grok_home().join("sessions"));

    for root in roots {
        if !root.is_dir() {
            continue;
        }
        scan_media_dir(&root, 0, &mut out, limit * 2);
        if out.len() >= limit * 2 {
            break;
        }
    }

    out.sort_by(|a, b| {
        b.modified_ms
            .unwrap_or(0)
            .cmp(&a.modified_ms.unwrap_or(0))
            .then_with(|| a.path.cmp(&b.path))
    });
    out.truncate(limit);
    Ok(out)
}

fn is_media_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".gif")
        || lower.ends_with(".webp")
        || lower.ends_with(".mp4")
        || lower.ends_with(".webm")
        || lower.ends_with(".mov")
}

fn scan_media_dir(dir: &Path, depth: u32, out: &mut Vec<MemoryFileEntry>, cap: usize) {
    if depth > 4 || out.len() >= cap {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for ent in entries.flatten() {
        if out.len() >= cap {
            return;
        }
        let p = ent.path();
        let name = ent.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if p.is_dir() {
            // Skip heavy dirs
            if matches!(
                name.as_str(),
                "node_modules" | "target" | ".git" | "dist" | "build" | "vendor"
            ) {
                continue;
            }
            // At project root depth 0, only descend into image-ish folders
            if depth == 0
                && !matches!(
                    name.to_lowercase().as_str(),
                    "images" | "image" | "media" | "assets" | "img" | "videos" | "video"
                )
            {
                // Still allow one level for session folders under ~/.grok/sessions
                if !dir.ends_with("sessions") && !dir.ends_with("downloads") {
                    continue;
                }
            }
            scan_media_dir(&p, depth + 1, out, cap);
            continue;
        }
        if !is_media_name(&name) {
            continue;
        }
        if let Ok(meta) = fs::metadata(&p) {
            // Skip huge files in listing
            if meta.len() > 50 * 1024 * 1024 {
                continue;
            }
            let kind = if name.to_lowercase().ends_with(".mp4")
                || name.to_lowercase().ends_with(".webm")
                || name.to_lowercase().ends_with(".mov")
            {
                "video"
            } else {
                "image"
            };
            out.push(MemoryFileEntry {
                path: p.display().to_string(),
                rel_path: name.clone(),
                scope: kind.into(),
                workspace: None,
                name,
                size_bytes: Some(meta.len()),
                modified_ms: mtime_ms(&meta),
                deletable: false,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mime_png() {
        let (m, k) = mime_for_path(Path::new("foo/bar.PNG"));
        assert_eq!(m, "image/png");
        assert_eq!(k, "image");
    }

    #[test]
    fn is_media() {
        assert!(is_media_name("shot.png"));
        assert!(is_media_name("clip.MP4"));
        assert!(!is_media_name("readme.md"));
    }
}
