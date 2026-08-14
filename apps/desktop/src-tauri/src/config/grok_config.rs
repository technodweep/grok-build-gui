//! Read-only overview of `~/.grok/config.toml` + discovered skills.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use toml::Value as TomlValue;

use super::grok_home;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerInfo {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub transport: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub name: String,
    pub path: String,
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub disabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrokConfigOverview {
    pub config_path: String,
    pub config_exists: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub permission_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auto_compact_percent: Option<u64>,
    #[serde(default)]
    pub mcp_servers: Vec<McpServerInfo>,
    #[serde(default)]
    pub skills: Vec<SkillInfo>,
    #[serde(default)]
    pub skill_paths: Vec<String>,
    #[serde(default)]
    pub skill_disabled: Vec<String>,
    #[serde(default)]
    pub marketplace_sources: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parse_error: Option<String>,
}

pub fn config_toml_path() -> PathBuf {
    grok_home().join("config.toml")
}

pub fn load_grok_config_overview(project_cwd: Option<&str>) -> AppResult<GrokConfigOverview> {
    let path = config_toml_path();
    let config_exists = path.is_file();
    let mut overview = GrokConfigOverview {
        config_path: path.display().to_string(),
        config_exists,
        default_model: None,
        permission_mode: None,
        auto_compact_percent: None,
        mcp_servers: Vec::new(),
        skills: Vec::new(),
        skill_paths: Vec::new(),
        skill_disabled: Vec::new(),
        marketplace_sources: Vec::new(),
        parse_error: None,
    };

    if config_exists {
        match fs::read_to_string(&path) {
            Ok(raw) => match raw.parse::<TomlValue>() {
                Ok(doc) => apply_toml(&mut overview, &doc),
                Err(e) => {
                    overview.parse_error = Some(format!("parse config.toml: {e}"));
                }
            },
            Err(e) => {
                overview.parse_error = Some(format!("read config.toml: {e}"));
            }
        }
    }

    // Discover skills from common roots (user + bundled + project).
    let disabled: std::collections::HashSet<String> = overview
        .skill_disabled
        .iter()
        .map(|s| s.to_lowercase())
        .collect();

    let mut skills = Vec::new();
    scan_skills_root(&grok_home().join("skills"), "user", &disabled, &mut skills);
    scan_skills_root(
        &grok_home().join("bundled/skills"),
        "bundled",
        &disabled,
        &mut skills,
    );
    scan_skills_root(
        &grok_home().join("commands"),
        "user-commands",
        &disabled,
        &mut skills,
    );

    for extra in &overview.skill_paths {
        let p = expand_tilde(extra);
        scan_skills_root(&p, "config-paths", &disabled, &mut skills);
    }

    if let Some(cwd) = project_cwd {
        let cwd = PathBuf::from(cwd);
        scan_skills_root(&cwd.join(".grok/skills"), "project", &disabled, &mut skills);
        scan_skills_root(
            &cwd.join(".grok/commands"),
            "project-commands",
            &disabled,
            &mut skills,
        );
        // Walk up a few levels for repo-root .grok/skills
        if let Some(parent) = cwd.parent() {
            scan_skills_root(&parent.join(".grok/skills"), "repo", &disabled, &mut skills);
        }
    }

    // Deduplicate by name, prefer higher-priority sources.
    let priority = |src: &str| match src {
        "project" | "project-commands" => 0,
        "repo" => 1,
        "user" | "user-commands" | "config-paths" => 2,
        "bundled" => 3,
        _ => 4,
    };
    skills.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| priority(&a.source).cmp(&priority(&b.source)))
    });
    let mut seen = std::collections::HashSet::new();
    skills.retain(|s| seen.insert(s.name.to_lowercase()));
    skills.sort_by_key(|a| a.name.to_lowercase());
    overview.skills = skills;

    Ok(overview)
}

fn apply_toml(out: &mut GrokConfigOverview, doc: &TomlValue) {
    if let Some(m) = doc
        .get("models")
        .and_then(|t| t.get("default"))
        .and_then(|v| v.as_str())
    {
        out.default_model = Some(m.to_string());
    }
    if let Some(p) = doc
        .get("ui")
        .and_then(|t| t.get("permission_mode"))
        .and_then(|v| v.as_str())
    {
        out.permission_mode = Some(p.to_string());
    }
    if let Some(n) = doc
        .get("session")
        .and_then(|t| t.get("auto_compact_threshold_percent"))
        .and_then(|v| v.as_integer())
    {
        out.auto_compact_percent = Some(n as u64);
    }

    // [mcp_servers.<name>]
    if let Some(servers) = doc.get("mcp_servers").and_then(|v| v.as_table()) {
        for (name, val) in servers {
            let enabled = val.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
            let command = val
                .get("command")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let url = val
                .get("url")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let transport = if url.is_some() {
                "http".into()
            } else if command.is_some() {
                "stdio".into()
            } else {
                "unknown".into()
            };
            out.mcp_servers.push(McpServerInfo {
                name: name.clone(),
                command,
                url,
                enabled,
                transport,
            });
        }
        out.mcp_servers.sort_by_key(|a| a.name.to_lowercase());
    }

    if let Some(skills) = doc.get("skills") {
        if let Some(arr) = skills.get("paths").and_then(|v| v.as_array()) {
            for v in arr {
                if let Some(s) = v.as_str() {
                    out.skill_paths.push(s.to_string());
                }
            }
        }
        if let Some(arr) = skills.get("disabled").and_then(|v| v.as_array()) {
            for v in arr {
                if let Some(s) = v.as_str() {
                    out.skill_disabled.push(s.to_string());
                }
            }
        }
    }

    if let Some(arr) = doc
        .get("marketplace")
        .and_then(|t| t.get("sources"))
        .and_then(|v| v.as_array())
    {
        for src in arr {
            let name = src.get("name").and_then(|v| v.as_str()).unwrap_or("source");
            let git = src.get("git").and_then(|v| v.as_str()).unwrap_or("");
            out.marketplace_sources.push(if git.is_empty() {
                name.to_string()
            } else {
                format!("{name} ({git})")
            });
        }
    }
}

fn scan_skills_root(
    root: &Path,
    source: &str,
    disabled: &std::collections::HashSet<String>,
    out: &mut Vec<SkillInfo>,
) {
    if !root.is_dir() {
        return;
    }
    // Direct SKILL.md children (skill dirs)
    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let skill_md = path.join("SKILL.md");
                if skill_md.is_file() {
                    let name = path
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("skill")
                        .to_string();
                    let description = read_skill_description(&skill_md);
                    out.push(SkillInfo {
                        name: name.clone(),
                        path: path.display().to_string(),
                        source: source.into(),
                        description,
                        disabled: disabled.contains(&name.to_lowercase()),
                    });
                } else {
                    // One level deeper (plugin skill packs)
                    if let Ok(inner) = fs::read_dir(&path) {
                        for e2 in inner.flatten() {
                            let p2 = e2.path();
                            let sm = p2.join("SKILL.md");
                            if p2.is_dir() && sm.is_file() {
                                let name = p2
                                    .file_name()
                                    .and_then(|s| s.to_str())
                                    .unwrap_or("skill")
                                    .to_string();
                                let description = read_skill_description(&sm);
                                out.push(SkillInfo {
                                    name: name.clone(),
                                    path: p2.display().to_string(),
                                    source: source.into(),
                                    description,
                                    disabled: disabled.contains(&name.to_lowercase()),
                                });
                            }
                        }
                    }
                }
            } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
                // Flat command markdown
                let name = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("cmd")
                    .to_string();
                out.push(SkillInfo {
                    name: name.clone(),
                    path: path.display().to_string(),
                    source: source.into(),
                    description: Some("slash command".into()),
                    disabled: disabled.contains(&name.to_lowercase()),
                });
            }
        }
    }
}

fn read_skill_description(skill_md: &Path) -> Option<String> {
    let raw = fs::read_to_string(skill_md).ok()?;
    // YAML frontmatter description: or first non-empty markdown line.
    if let Some(after) = raw.strip_prefix("---") {
        if let Some(end) = after.find("---") {
            let fm = &after[..end];
            for line in fm.lines() {
                let line = line.trim();
                if let Some(rest) = line.strip_prefix("description:") {
                    let d = rest.trim().trim_matches('"').trim_matches('\'');
                    if !d.is_empty() {
                        return Some(d.to_string());
                    }
                }
            }
        }
    }
    for line in raw.lines() {
        let t = line.trim();
        if t.is_empty() || t.starts_with("---") || t.starts_with('#') {
            if t.starts_with("# ") {
                return Some(t.trim_start_matches('#').trim().to_string());
            }
            continue;
        }
        return Some(t.chars().take(120).collect());
    }
    None
}

fn expand_tilde(p: &str) -> PathBuf {
    if let Some(rest) = p.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    if p == "~" {
        if let Some(home) = dirs::home_dir() {
            return home;
        }
    }
    PathBuf::from(p)
}

/// Reveal / open path with the OS default (used by frontend opener as well).
#[allow(dead_code)]
pub fn ensure_config_exists() -> AppResult<PathBuf> {
    let path = config_toml_path();
    if !path.is_file() {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| AppError::Message(format!("create grok home: {e}")))?;
        }
        fs::write(
            &path,
            "# Grok config — see https://x.ai/docs\n# Edit this file to configure MCP, models, UI, etc.\n",
        )
        .map_err(|e| AppError::Message(format!("create config.toml: {e}")))?;
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_mcp_servers_from_toml() {
        let raw = r#"
[models]
default = "grok-4.5"

[ui]
permission_mode = "ask"

[session]
auto_compact_threshold_percent = 85

[mcp_servers.fs]
command = "npx"
enabled = true

[mcp_servers.remote]
url = "https://example.com/mcp"
enabled = false

[skills]
disabled = ["wip"]
paths = ["~/extra-skills"]

[[marketplace.sources]]
name = "Official"
git = "https://example.com/m.git"
"#;
        let doc: TomlValue = raw.parse().unwrap();
        let mut overview = GrokConfigOverview {
            config_path: "test".into(),
            config_exists: true,
            default_model: None,
            permission_mode: None,
            auto_compact_percent: None,
            mcp_servers: Vec::new(),
            skills: Vec::new(),
            skill_paths: Vec::new(),
            skill_disabled: Vec::new(),
            marketplace_sources: Vec::new(),
            parse_error: None,
        };
        apply_toml(&mut overview, &doc);
        assert_eq!(overview.default_model.as_deref(), Some("grok-4.5"));
        assert_eq!(overview.permission_mode.as_deref(), Some("ask"));
        assert_eq!(overview.auto_compact_percent, Some(85));
        assert_eq!(overview.mcp_servers.len(), 2);
        let fs = overview
            .mcp_servers
            .iter()
            .find(|s| s.name == "fs")
            .unwrap();
        assert_eq!(fs.transport, "stdio");
        assert!(fs.enabled);
        let remote = overview
            .mcp_servers
            .iter()
            .find(|s| s.name == "remote")
            .unwrap();
        assert_eq!(remote.transport, "http");
        assert!(!remote.enabled);
        assert_eq!(overview.skill_disabled, vec!["wip".to_string()]);
        assert_eq!(overview.skill_paths, vec!["~/extra-skills".to_string()]);
        assert_eq!(overview.marketplace_sources.len(), 1);
    }

    #[test]
    fn skill_description_from_frontmatter() {
        let dir = std::env::temp_dir().join(format!(
            "grok-skill-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("SKILL.md");
        fs::write(
            &path,
            "---\nname: demo\ndescription: Does useful things\n---\n\n# Demo\n",
        )
        .unwrap();
        let d = read_skill_description(&path);
        assert_eq!(d.as_deref(), Some("Does useful things"));
        let _ = fs::remove_dir_all(&dir);
    }
}
