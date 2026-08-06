//! Discover and edit project / home instruction files (AGENTS.md, rules/*.md).

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::grok_home;
use crate::error::{AppError, AppResult};

const ROOT_NAMES: &[&str] = &[
    "AGENTS.md",
    "AGENT.md",
    "Agents.md",
    "CLAUDE.md",
    "Claude.md",
    "CLAUDE.local.md",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRuleFile {
    pub path: String,
    pub rel_path: String,
    /// project | home | rules
    pub scope: String,
    pub name: String,
    pub size_bytes: u64,
    pub writable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRulesCatalog {
    pub project_cwd: Option<String>,
    pub files: Vec<ProjectRuleFile>,
    #[serde(default)]
    pub notes: Vec<String>,
    pub suggested_agents_path: Option<String>,
    pub home_rules_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRuleContent {
    pub path: String,
    pub content: String,
    pub truncated: bool,
}

pub fn load_project_rules(project_cwd: Option<&str>) -> ProjectRulesCatalog {
    let mut files = Vec::new();
    let mut notes = Vec::new();
    let home_rules = grok_home().join("rules");
    let home_rules_dir = home_rules.display().to_string();

    // Home ~/.grok/rules/*.md
    if home_rules.is_dir() {
        scan_rules_dir(&home_rules, "home", true, &mut files);
    } else {
        notes.push("No ~/.grok/rules yet — create a home rule for all projects.".into());
    }

    // Top-level home AGENTS-like (rare but supported conceptually as user files)
    let home = grok_home();
    for name in ROOT_NAMES {
        let p = home.join(name);
        if p.is_file() {
            push_file(&p, name, "home", true, &mut files);
        }
    }

    let mut suggested = None;
    if let Some(cwd) = project_cwd.map(str::trim).filter(|s| !s.is_empty()) {
        let root = PathBuf::from(cwd);
        if root.is_dir() {
            suggested = Some(root.join("AGENTS.md").display().to_string());
            // Project root instruction files
            for name in ROOT_NAMES {
                let p = root.join(name);
                if p.is_file() {
                    push_file(&p, name, "project", true, &mut files);
                }
            }
            // .grok/rules
            let pr = root.join(".grok").join("rules");
            if pr.is_dir() {
                scan_rules_dir(&pr, "rules", true, &mut files);
            }
            // .claude / .cursor CLAUDE.md
            for rel in [".claude/CLAUDE.md", ".claude/CLAUDE.local.md"] {
                let p = root.join(rel);
                if p.is_file() {
                    push_file(&p, rel, "project", true, &mut files);
                }
            }
            if !files.iter().any(|f| f.scope == "project" || f.scope == "rules") {
                notes.push(
                    "No project AGENTS.md or .grok/rules yet — create one to set conventions."
                        .into(),
                );
            }
        } else {
            notes.push(format!("Project path is not a directory: {cwd}"));
        }
    } else {
        notes.push("Open a project folder to edit project-level AGENTS.md.".into());
    }

    // Dedupe by path
    let mut seen = std::collections::HashSet::new();
    files.retain(|f| seen.insert(f.path.clone()));
    files.sort_by(|a, b| {
        scope_rank(&a.scope)
            .cmp(&scope_rank(&b.scope))
            .then_with(|| a.rel_path.cmp(&b.rel_path))
    });

    ProjectRulesCatalog {
        project_cwd: project_cwd.map(|s| s.to_string()),
        files,
        notes,
        suggested_agents_path: suggested,
        home_rules_dir,
    }
}

fn scope_rank(s: &str) -> u8 {
    match s {
        "home" => 0,
        "project" => 1,
        "rules" => 2,
        _ => 3,
    }
}

fn scan_rules_dir(dir: &Path, scope: &str, writable: bool, out: &mut Vec<ProjectRuleFile>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for e in entries.flatten() {
        let p = e.path();
        if !p.is_file() {
            continue;
        }
        let name = e.file_name().to_string_lossy().to_string();
        if !name.to_lowercase().ends_with(".md") {
            continue;
        }
        push_file(&p, &name, scope, writable, out);
    }
}

fn push_file(path: &Path, rel: &str, scope: &str, writable: bool, out: &mut Vec<ProjectRuleFile>) {
    let Ok(meta) = fs::metadata(path) else {
        return;
    };
    out.push(ProjectRuleFile {
        path: path.display().to_string(),
        rel_path: rel.to_string(),
        scope: scope.to_string(),
        name: path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(rel)
            .to_string(),
        size_bytes: meta.len(),
        writable,
    });
}

fn path_allowed_write(path: &Path, project_cwd: Option<&str>) -> bool {
    let Ok(canon) = path.canonicalize().or_else(|_| {
        // New file: canonicalize parent
        path.parent()
            .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "no parent"))
            .and_then(|p| {
                fs::create_dir_all(p)?;
                p.canonicalize()
            })
            .map(|parent| parent.join(path.file_name().unwrap_or_default()))
    }) else {
        return false;
    };
    if let Ok(home) = grok_home().canonicalize() {
        if canon.starts_with(home.join("rules")) || canon.starts_with(&home) {
            // Only rules + known names under home, not arbitrary paths
            if canon.starts_with(home.join("rules")) {
                return true;
            }
            if let Some(name) = canon.file_name().and_then(|n| n.to_str()) {
                if ROOT_NAMES.iter().any(|n| n.eq_ignore_ascii_case(name)) {
                    return true;
                }
            }
        }
    }
    if let Some(cwd) = project_cwd {
        if let Ok(root) = PathBuf::from(cwd).canonicalize() {
            if canon.starts_with(&root) {
                return true;
            }
        }
    }
    false
}

pub fn read_project_rule(path: &str, max_chars: usize) -> AppResult<ProjectRuleContent> {
    let path = path.trim();
    if path.is_empty() {
        return Err(AppError::Message("path is empty".into()));
    }
    let p = PathBuf::from(path);
    if !path_allowed_write(&p, None)
        && !path_looks_safe_read(&p)
    {
        // Allow read of discovered paths under home/project that exist
        if !p.is_file() {
            return Err(AppError::Message("path not readable".into()));
        }
    }
    let raw = fs::read_to_string(&p).map_err(|e| AppError::Message(e.to_string()))?;
    let max = max_chars.clamp(1_000, 500_000);
    let truncated = raw.chars().count() > max;
    let content = if truncated {
        raw.chars().take(max).collect::<String>() + "\n\n… (truncated)"
    } else {
        raw
    };
    Ok(ProjectRuleContent {
        path: p.display().to_string(),
        content,
        truncated,
    })
}

fn path_looks_safe_read(path: &Path) -> bool {
    let Ok(canon) = path.canonicalize() else {
        return false;
    };
    if let Ok(home) = grok_home().canonicalize() {
        if canon.starts_with(&home) {
            return true;
        }
    }
    // Allow any absolute path under home dir projects? Too broad.
    // Read is only used after list from our catalog — still check extension.
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("md"))
        .unwrap_or(false)
}

pub fn save_project_rule(path: &str, content: &str, project_cwd: Option<&str>) -> AppResult<()> {
    let path = path.trim();
    if path.is_empty() {
        return Err(AppError::Message("path is empty".into()));
    }
    let p = PathBuf::from(path);
    // For new files, ensure parent exists and path is allowed
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| AppError::Message(format!("create parent: {e}")))?;
    }
    if !path_allowed_write(&p, project_cwd) {
        return Err(AppError::Message(
            "refusing to write outside project or ~/.grok/rules".into(),
        ));
    }
    // Only markdown
    if !p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("md"))
        .unwrap_or(false)
    {
        return Err(AppError::Message("only .md rule files can be saved".into()));
    }
    fs::write(&p, content.as_bytes()).map_err(|e| AppError::Message(format!("write: {e}")))?;
    Ok(())
}

/// Create project-root AGENTS.md if missing.
pub fn ensure_agents_md(project_cwd: &str, content: Option<&str>) -> AppResult<String> {
    let root = PathBuf::from(project_cwd.trim());
    if !root.is_dir() {
        return Err(AppError::Message("project cwd is not a directory".into()));
    }
    let path = root.join("AGENTS.md");
    if path.is_file() {
        return Ok(path.display().to_string());
    }
    let body = content.unwrap_or(
        "# Project rules\n\n<!-- Instructions for Grok when working in this repository -->\n\n## Conventions\n\n- \n\n## Build & test\n\n- \n",
    );
    save_project_rule(&path.display().to_string(), body, Some(project_cwd))?;
    Ok(path.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn root_names_include_agents() {
        assert!(ROOT_NAMES.iter().any(|n| *n == "AGENTS.md"));
    }
}
