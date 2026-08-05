//! Agents (`.md` definitions) and personas (`.toml`) discovery + CRUD.
//! Paths follow Grok TUI: project → user → bundled.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::grok_home;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDef {
    pub name: String,
    pub path: String,
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub permission_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt_mode: Option<String>,
    /// Full file body (frontmatter + markdown) for editor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(default)]
    pub readonly: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonaDef {
    pub name: String,
    pub path: String,
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub instructions: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_isolation: Option<String>,
    /// Full TOML body for editor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(default)]
    pub readonly: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentsCatalog {
    pub agents: Vec<AgentDef>,
    pub personas: Vec<PersonaDef>,
    #[serde(default)]
    pub user_agents_dir: String,
    #[serde(default)]
    pub user_personas_dir: String,
    #[serde(default)]
    pub notes: Vec<String>,
}

pub fn load_agents_catalog(project_cwd: Option<&str>, include_bodies: bool) -> AgentsCatalog {
    let mut agents = Vec::new();
    let mut personas = Vec::new();
    let mut notes = Vec::new();

    // Bundled (readonly)
    scan_agents_dir(
        &grok_home().join("bundled/agents"),
        "bundled",
        true,
        include_bodies,
        &mut agents,
    );
    scan_personas_dir(
        &grok_home().join("bundled/personas"),
        "bundled",
        true,
        include_bodies,
        &mut personas,
    );

    // User
    let user_agents = grok_home().join("agents");
    let user_personas = grok_home().join("personas");
    scan_agents_dir(&user_agents, "user", false, include_bodies, &mut agents);
    scan_personas_dir(&user_personas, "user", false, include_bodies, &mut personas);

    // Project
    if let Some(cwd) = project_cwd {
        let cwd = PathBuf::from(cwd);
        scan_agents_dir(
            &cwd.join(".grok/agents"),
            "project",
            false,
            include_bodies,
            &mut agents,
        );
        scan_personas_dir(
            &cwd.join(".grok/personas"),
            "project",
            false,
            include_bodies,
            &mut personas,
        );
        // Walk one parent for monorepo root
        if let Some(parent) = cwd.parent() {
            scan_agents_dir(
                &parent.join(".grok/agents"),
                "repo",
                false,
                include_bodies,
                &mut agents,
            );
            scan_personas_dir(
                &parent.join(".grok/personas"),
                "repo",
                false,
                include_bodies,
                &mut personas,
            );
        }
    }

    // Config.toml inline personas
    if let Ok(extra) = load_config_personas(include_bodies) {
        for p in extra {
            personas.push(p);
        }
    }

    // Dedup by name: project > repo > user > config > bundled
    let prio = |src: &str| match src {
        "project" => 0,
        "repo" => 1,
        "user" => 2,
        "config" => 3,
        "bundled" => 4,
        _ => 5,
    };
    agents.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| prio(&a.source).cmp(&prio(&b.source)))
    });
    let mut seen = std::collections::HashSet::new();
    agents.retain(|a| seen.insert(a.name.to_lowercase()));
    agents.sort_by_key(|a| a.name.to_lowercase());

    personas.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| prio(&a.source).cmp(&prio(&b.source)))
    });
    seen.clear();
    personas.retain(|p| seen.insert(p.name.to_lowercase()));
    personas.sort_by_key(|p| p.name.to_lowercase());

    if agents.is_empty() {
        notes.push("No agent definitions found under bundled/user/project paths.".into());
    }

    AgentsCatalog {
        agents,
        personas,
        user_agents_dir: user_agents.display().to_string(),
        user_personas_dir: user_personas.display().to_string(),
        notes,
    }
}

fn scan_agents_dir(
    dir: &Path,
    source: &str,
    readonly: bool,
    include_bodies: bool,
    out: &mut Vec<AgentDef>,
) {
    if !dir.is_dir() {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("agent")
            .to_string();
        let raw = fs::read_to_string(&path).unwrap_or_default();
        let fm = parse_md_frontmatter(&raw);
        let description = fm
            .get("description")
            .cloned()
            .or_else(|| first_heading(&raw));
        out.push(AgentDef {
            name: fm.get("name").cloned().unwrap_or(name),
            path: path.display().to_string(),
            source: source.into(),
            description,
            model: fm.get("model").cloned(),
            permission_mode: fm.get("permission_mode").cloned(),
            prompt_mode: fm.get("prompt_mode").cloned(),
            body: if include_bodies { Some(raw) } else { None },
            readonly,
        });
    }
}

fn scan_personas_dir(
    dir: &Path,
    source: &str,
    readonly: bool,
    include_bodies: bool,
    out: &mut Vec<PersonaDef>,
) {
    if !dir.is_dir() {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("toml") {
            continue;
        }
        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("persona")
            .to_string();
        let raw = fs::read_to_string(&path).unwrap_or_default();
        let (description, instructions, model, effort, isolation) = parse_persona_toml(&raw);
        out.push(PersonaDef {
            name,
            path: path.display().to_string(),
            source: source.into(),
            description,
            instructions,
            model,
            reasoning_effort: effort,
            default_isolation: isolation,
            body: if include_bodies { Some(raw) } else { None },
            readonly,
        });
    }
}

fn load_config_personas(include_bodies: bool) -> AppResult<Vec<PersonaDef>> {
    let path = grok_home().join("config.toml");
    let raw = fs::read_to_string(&path).map_err(|e| AppError::Message(e.to_string()))?;
    let doc: toml::Value = raw
        .parse()
        .map_err(|e| AppError::Message(format!("parse config: {e}")))?;
    let mut out = Vec::new();
    let Some(personas) = doc
        .get("subagents")
        .and_then(|s| s.get("personas"))
        .and_then(|p| p.as_table())
    else {
        return Ok(out);
    };
    for (name, val) in personas {
        let description = val
            .get("description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let instructions = val
            .get("instructions")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let model = val
            .get("model")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let effort = val
            .get("reasoning_effort")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let isolation = val
            .get("default_isolation")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let body = if include_bodies {
            Some(format!(
                "# from config.toml [subagents.personas.{name}]\ndescription = {:?}\ninstructions = {:?}\n",
                description.as_deref().unwrap_or(""),
                instructions.as_deref().unwrap_or("")
            ))
        } else {
            None
        };
        out.push(PersonaDef {
            name: name.clone(),
            path: format!("config.toml#subagents.personas.{}", name),
            source: "config".into(),
            description,
            instructions,
            model,
            reasoning_effort: effort,
            default_isolation: isolation,
            body,
            readonly: true, // edit via config.toml for now
        });
    }
    Ok(out)
}

/// Save or create a user agent at `~/.grok/agents/<name>.md`.
pub fn save_user_agent(name: &str, body: &str) -> AppResult<AgentDef> {
    let name = sanitize_name(name)?;
    let dir = grok_home().join("agents");
    fs::create_dir_all(&dir).map_err(|e| AppError::Message(format!("create agents dir: {e}")))?;
    let path = dir.join(format!("{name}.md"));
    // Ensure frontmatter name matches
    let body = ensure_agent_name_frontmatter(body, &name);
    fs::write(&path, &body).map_err(|e| AppError::Message(format!("write agent: {e}")))?;
    let fm = parse_md_frontmatter(&body);
    Ok(AgentDef {
        name: fm.get("name").cloned().unwrap_or(name),
        path: path.display().to_string(),
        source: "user".into(),
        description: fm.get("description").cloned(),
        model: fm.get("model").cloned(),
        permission_mode: fm.get("permission_mode").cloned(),
        prompt_mode: fm.get("prompt_mode").cloned(),
        body: Some(body),
        readonly: false,
    })
}

pub fn delete_user_agent(name: &str) -> AppResult<()> {
    let name = sanitize_name(name)?;
    let path = grok_home().join("agents").join(format!("{name}.md"));
    if !path.is_file() {
        return Err(AppError::Message(format!(
            "user agent not found: {name} (only ~/.grok/agents/*.md can be deleted here)"
        )));
    }
    fs::remove_file(&path).map_err(|e| AppError::Message(format!("delete agent: {e}")))?;
    Ok(())
}

/// Save persona at `~/.grok/personas/<name>.toml`.
pub fn save_user_persona(name: &str, body: &str) -> AppResult<PersonaDef> {
    let name = sanitize_name(name)?;
    let dir = grok_home().join("personas");
    fs::create_dir_all(&dir)
        .map_err(|e| AppError::Message(format!("create personas dir: {e}")))?;
    let path = dir.join(format!("{name}.toml"));
    fs::write(&path, body).map_err(|e| AppError::Message(format!("write persona: {e}")))?;
    let (description, instructions, model, effort, isolation) = parse_persona_toml(body);
    Ok(PersonaDef {
        name,
        path: path.display().to_string(),
        source: "user".into(),
        description,
        instructions,
        model,
        reasoning_effort: effort,
        default_isolation: isolation,
        body: Some(body.to_string()),
        readonly: false,
    })
}

pub fn delete_user_persona(name: &str) -> AppResult<()> {
    let name = sanitize_name(name)?;
    let path = grok_home().join("personas").join(format!("{name}.toml"));
    if !path.is_file() {
        return Err(AppError::Message(format!(
            "user persona not found: {name}"
        )));
    }
    fs::remove_file(&path).map_err(|e| AppError::Message(format!("delete persona: {e}")))?;
    Ok(())
}

fn sanitize_name(name: &str) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty()
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(AppError::Message(
            "name must be alphanumeric, '-', or '_'".into(),
        ));
    }
    Ok(name.to_string())
}

fn ensure_agent_name_frontmatter(body: &str, name: &str) -> String {
    if body.trim_start().starts_with("---") {
        // If name: missing, inject after first ---
        if !body.lines().take(20).any(|l| l.trim().starts_with("name:")) {
            if let Some(rest) = body.strip_prefix("---") {
                return format!("---\nname: {name}{rest}");
            }
        }
        return body.to_string();
    }
    format!(
        "---\nname: {name}\ndescription: Custom agent\nprompt_mode: full\npermission_mode: default\n---\n\n{body}"
    )
}

/// Parse simple YAML-ish frontmatter key: value (supports `>` folded blocks as single line join).
fn parse_md_frontmatter(raw: &str) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    let Some(after) = raw.strip_prefix("---") else {
        return map;
    };
    let Some(end) = after.find("\n---") else {
        return map;
    };
    let fm = &after[..end];
    let mut key: Option<String> = None;
    let mut acc = String::new();
    let mut folded = false;
    for line in fm.lines() {
        if let Some(rest) = line.strip_prefix("  ") {
            if key.is_some() {
                if !acc.is_empty() {
                    acc.push(' ');
                }
                acc.push_str(rest.trim());
            }
            continue;
        }
        if let Some(k) = key.take() {
            map.insert(k, acc.trim().to_string());
            acc.clear();
            folded = false;
        }
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some((k, v)) = line.split_once(':') {
            let k = k.trim().to_string();
            let v = v.trim();
            if v == ">" || v == "|" {
                key = Some(k);
                folded = true;
                acc.clear();
            } else {
                map.insert(k, v.trim_matches('"').trim_matches('\'').to_string());
            }
        } else if folded {
            if !acc.is_empty() {
                acc.push(' ');
            }
            acc.push_str(line);
        }
    }
    if let Some(k) = key {
        map.insert(k, acc.trim().to_string());
    }
    map
}

fn first_heading(raw: &str) -> Option<String> {
    for line in raw.lines() {
        let t = line.trim();
        if let Some(rest) = t.strip_prefix("# ") {
            return Some(rest.trim().to_string());
        }
    }
    None
}

fn parse_persona_toml(
    raw: &str,
) -> (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    let Ok(v) = raw.parse::<toml::Value>() else {
        // fallback: line scan
        let mut description = None;
        let instructions = None;
        for line in raw.lines() {
            if let Some(rest) = line.strip_prefix("description") {
                if let Some(eq) = rest.find('=') {
                    description = Some(rest[eq + 1..].trim().trim_matches('"').to_string());
                }
            }
        }
        return (description, instructions, None, None, None);
    };
    let description = v
        .get("description")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    let instructions = v
        .get("instructions")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    let model = v
        .get("model")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    let effort = v
        .get("reasoning_effort")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    let isolation = v
        .get("default_isolation")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    (description, instructions, model, effort, isolation)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_frontmatter_name() {
        let raw = "---\nname: explore\ndescription: >\n  Fast agent\nmodel: inherit\n---\n\nBody\n";
        let fm = parse_md_frontmatter(raw);
        assert_eq!(fm.get("name").map(|s| s.as_str()), Some("explore"));
        assert!(fm.get("description").is_some());
    }
}
