//! Lightweight project file listing for the `@` picker.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{AppError, AppResult};

const SKIP_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".turbo",
    "__pycache__",
    ".venv",
    "venv",
    ".cache",
    "coverage",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    /// Path relative to project root, using `/` separators.
    pub path: String,
    pub is_dir: bool,
}

/// Fuzzy-ish list of files under `cwd`, capped for UI.
pub fn list_project_files(cwd: &str, query: &str, limit: usize) -> AppResult<Vec<FileEntry>> {
    let root = PathBuf::from(cwd);
    if !root.is_dir() {
        return Err(AppError::Message(format!("not a directory: {cwd}")));
    }
    let root = root
        .canonicalize()
        .map_err(|e| AppError::Message(format!("cwd resolve: {e}")))?;

    let mut all = Vec::new();
    walk(&root, &root, 0, &mut all)?;

    let q = query.trim().to_lowercase();
    let mut matched: Vec<FileEntry> = if q.is_empty() {
        all
    } else {
        all.into_iter()
            .filter(|e| {
                let p = e.path.to_lowercase();
                // Simple subsequence / substring score filter
                p.contains(&q) || fuzzy_match(&p, &q)
            })
            .collect()
    };

    // Prefer shorter paths, then alpha
    matched.sort_by(|a, b| {
        let sa = score(&a.path, &q);
        let sb = score(&b.path, &q);
        sa.cmp(&sb)
            .then_with(|| a.path.len().cmp(&b.path.len()))
            .then_with(|| a.path.cmp(&b.path))
    });

    matched.truncate(limit.clamp(1, 200));
    Ok(matched)
}

fn walk(root: &Path, dir: &Path, depth: u32, out: &mut Vec<FileEntry>) -> AppResult<()> {
    if depth > 12 || out.len() > 8000 {
        return Ok(());
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') && name != ".env" && name != ".github" {
            // skip most dotfiles/dirs; keep .env and .github
            if path.is_dir() && name != ".github" {
                continue;
            }
            if path.is_file() && name != ".env" && !name.starts_with(".env.") {
                continue;
            }
        }
        if path.is_dir() {
            if SKIP_DIRS.contains(&name.as_ref()) {
                continue;
            }
            let rel = rel_path(root, &path);
            out.push(FileEntry {
                path: rel,
                is_dir: true,
            });
            walk(root, &path, depth + 1, out)?;
        } else if path.is_file() {
            out.push(FileEntry {
                path: rel_path(root, &path),
                is_dir: false,
            });
        }
    }
    Ok(())
}

fn rel_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn fuzzy_match(hay: &str, needle: &str) -> bool {
    let mut it = hay.chars();
    for c in needle.chars() {
        loop {
            match it.next() {
                Some(h) if h == c => break,
                Some(_) => continue,
                None => return false,
            }
        }
    }
    true
}

fn score(path: &str, q: &str) -> i32 {
    if q.is_empty() {
        return 0;
    }
    let p = path.to_lowercase();
    if p == q {
        return -1000;
    }
    if p.ends_with(q) {
        return -500;
    }
    if p.contains(q) {
        return -100 + p.find(q).unwrap_or(0) as i32;
    }
    0
}

/// Read a text file under cwd for attachment (capped).
pub fn read_attachment(cwd: &str, rel: &str, max_bytes: usize) -> AppResult<String> {
    let root = PathBuf::from(cwd)
        .canonicalize()
        .map_err(|e| AppError::Message(format!("cwd: {e}")))?;
    let path = crate::acp::fs_policy::resolve_sandboxed(&root, rel)?;
    let meta = fs::metadata(&path).map_err(|e| AppError::Message(e.to_string()))?;
    if meta.len() as usize > max_bytes {
        return Err(AppError::Message(format!(
            "file too large ({} bytes); attach path reference only",
            meta.len()
        )));
    }
    fs::read_to_string(&path).map_err(|e| AppError::Message(e.to_string()))
}
