//! Path sandbox for ACP client `fs/*` handlers.

use std::path::{Component, Path, PathBuf};

use crate::error::{AppError, AppResult};

/// Resolve `path` and ensure it stays under `cwd`.
///
/// Relative paths are joined with `cwd`. `..` escapes and symlink escapes are denied.
pub fn resolve_sandboxed(cwd: &Path, path: &str) -> AppResult<PathBuf> {
    if path.is_empty() {
        return Err(AppError::Message("empty path".into()));
    }

    let cwd = cwd
        .canonicalize()
        .map_err(|e| AppError::Message(format!("invalid session cwd {}: {e}", cwd.display())))?;

    let raw = PathBuf::from(path);
    let joined = if raw.is_absolute() {
        raw
    } else {
        cwd.join(raw)
    };

    // Lexically normalize (resolve `.` / `..`) before IO.
    let normalized = normalize_path(&joined)?;
    if !is_under_prefix(&normalized, &cwd) {
        return Err(AppError::Message(format!(
            "path escapes project sandbox: {}",
            normalized.display()
        )));
    }

    // If it exists, re-check after canonicalize (symlinks).
    if normalized.exists() {
        let canon = normalized
            .canonicalize()
            .map_err(|e| AppError::Message(format!("path resolve failed: {e}")))?;
        if !canon.starts_with(&cwd) {
            return Err(AppError::Message(format!(
                "path escapes project sandbox: {}",
                canon.display()
            )));
        }
        return Ok(canon);
    }

    // New path: canonicalize the nearest existing ancestor, then rejoin the rest.
    let mut ancestor = normalized.clone();
    let mut missing = Vec::new();
    while !ancestor.exists() {
        if let Some(name) = ancestor.file_name() {
            missing.push(name.to_os_string());
        }
        match ancestor.parent() {
            Some(p) if p != ancestor.as_path() => ancestor = p.to_path_buf(),
            _ => break,
        }
    }
    if ancestor.exists() {
        let ancestor = ancestor
            .canonicalize()
            .map_err(|e| AppError::Message(format!("ancestor resolve failed: {e}")))?;
        if !ancestor.starts_with(&cwd) {
            return Err(AppError::Message(format!(
                "path escapes project sandbox: {}",
                normalized.display()
            )));
        }
        let mut out = ancestor;
        for part in missing.into_iter().rev() {
            out.push(part);
        }
        if !is_under_prefix(&out, &cwd) {
            return Err(AppError::Message(format!(
                "path escapes project sandbox: {}",
                out.display()
            )));
        }
        return Ok(out);
    }

    Ok(normalized)
}

fn normalize_path(path: &Path) -> AppResult<PathBuf> {
    let mut out = PathBuf::new();
    for c in path.components() {
        match c {
            Component::Prefix(p) => out.push(p.as_os_str()),
            Component::RootDir => out.push(Component::RootDir.as_os_str()),
            Component::CurDir => {}
            Component::ParentDir => {
                if !out.pop() {
                    return Err(AppError::Message(
                        "path escapes project sandbox via ..".into(),
                    ));
                }
            }
            Component::Normal(s) => out.push(s),
        }
    }
    Ok(out)
}

fn is_under_prefix(path: &Path, root: &Path) -> bool {
    let root_c: Vec<_> = root.components().collect();
    let path_c: Vec<_> = path.components().collect();
    path_c.len() >= root_c.len() && path_c[..root_c.len()] == root_c[..]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn allows_relative_under_cwd() {
        let dir = tempfile_dir();
        let p = resolve_sandboxed(&dir, "src/main.rs").unwrap();
        assert!(p.starts_with(&dir));
        assert!(p.ends_with("src/main.rs"));
    }

    #[test]
    fn denies_escape() {
        let dir = tempfile_dir();
        assert!(resolve_sandboxed(&dir, "../etc/passwd").is_err());
    }

    fn tempfile_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("grok-gui-fs-{}", uuidish()));
        let _ = fs::create_dir_all(&dir);
        dir.canonicalize().unwrap()
    }

    fn uuidish() -> u128 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    }
}
