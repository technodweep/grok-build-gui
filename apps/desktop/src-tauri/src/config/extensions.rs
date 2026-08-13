//! Extensions hub: MCP / skills / plugins / marketplace / hooks / folder trust.
//!
//! Config mutations target `~/.grok/config.toml` via `toml_edit` (preserves formatting
//! as much as possible). Plugin install/uninstall shells out to the `grok` CLI.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use toml_edit::{Array, DocumentMut, Item, Table, Value as TomlEditValue};

use super::detect_grok_binary;
use super::grok_config::{
    config_toml_path, load_grok_config_overview, GrokConfigOverview, McpServerInfo,
};
use super::grok_home;
use crate::error::{AppError, AppResult};

// ── Types ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookInfo {
    pub name: String,
    pub path: String,
    pub scope: String,
    /// Event keys discovered in the file (SessionStart, PreToolUse, …).
    #[serde(default)]
    pub events: Vec<String>,
    #[serde(default)]
    pub trusted: bool,
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(default)]
    pub installed: bool,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(default)]
    pub trusted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplacePlugin {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub homepage: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub marketplace: Option<String>,
    #[serde(default)]
    pub installed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustedFolder {
    pub path: String,
    #[serde(default)]
    pub trusted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionsHub {
    pub overview: GrokConfigOverview,
    #[serde(default)]
    pub hooks: Vec<HookInfo>,
    #[serde(default)]
    pub plugins: Vec<PluginInfo>,
    #[serde(default)]
    pub marketplace_plugins: Vec<MarketplacePlugin>,
    #[serde(default)]
    pub trusted_folders: Vec<TrustedFolder>,
    #[serde(default)]
    pub project_cwd: Option<String>,
    #[serde(default)]
    pub project_trusted: bool,
    #[serde(default)]
    pub notes: Vec<String>,
}

// ── Load hub ───────────────────────────────────────────────────────────────

pub fn load_extensions_hub(project_cwd: Option<&str>) -> AppResult<ExtensionsHub> {
    let overview = load_grok_config_overview(project_cwd)?;
    let mut notes = Vec::new();

    let trusted = load_trusted_folders();
    let project_trusted = project_cwd
        .map(|c| is_path_trusted(&trusted, c))
        .unwrap_or(false);

    let hooks = load_hooks(project_cwd, project_trusted);
    let (plugins, plugin_notes) = load_plugins();
    notes.extend(plugin_notes);

    let installed_names: std::collections::HashSet<String> = plugins
        .iter()
        .filter(|p| p.installed)
        .map(|p| p.name.to_lowercase())
        .collect();

    let marketplace_plugins = load_marketplace_plugins(&installed_names);

    Ok(ExtensionsHub {
        overview,
        hooks,
        plugins,
        marketplace_plugins,
        trusted_folders: trusted,
        project_cwd: project_cwd.map(|s| s.to_string()),
        project_trusted,
        notes,
    })
}

// ── Hooks ──────────────────────────────────────────────────────────────────

fn load_hooks(project_cwd: Option<&str>, project_trusted: bool) -> Vec<HookInfo> {
    let mut out = Vec::new();
    scan_hooks_dir(&grok_home().join("hooks"), "user", true, &mut out);
    if let Some(cwd) = project_cwd {
        let p = PathBuf::from(cwd).join(".grok/hooks");
        scan_hooks_dir(&p, "project", project_trusted, &mut out);
    }
    out.sort_by(|a, b| {
        a.scope
            .cmp(&b.scope)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    out
}

fn scan_hooks_dir(dir: &Path, scope: &str, trusted: bool, out: &mut Vec<HookInfo>) {
    if !dir.is_dir() {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        if !name.ends_with(".json") {
            continue;
        }
        let enabled = !name.ends_with(".disabled.json") && !name.contains(".disabled.");
        let display = name
            .trim_end_matches(".disabled.json")
            .trim_end_matches(".json")
            .to_string();
        let events = parse_hook_events(&path);
        out.push(HookInfo {
            name: display,
            path: path.display().to_string(),
            scope: scope.into(),
            events,
            trusted,
            enabled,
        });
    }
}

fn parse_hook_events(path: &Path) -> Vec<String> {
    let Ok(raw) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let Ok(v) = serde_json::from_str::<JsonValue>(&raw) else {
        return Vec::new();
    };
    let mut events = Vec::new();
    if let Some(obj) = v.get("hooks").and_then(|h| h.as_object()) {
        for k in obj.keys() {
            events.push(k.clone());
        }
    } else if let Some(obj) = v.as_object() {
        // Flat event map
        for k in obj.keys() {
            if k != "version" && k != "matcher" {
                events.push(k.clone());
            }
        }
    }
    events.sort();
    events
}

/// Toggle a hook file by renaming `name.json` ↔ `name.disabled.json`.
pub fn set_hook_enabled(path: &str, enabled: bool) -> AppResult<HookInfo> {
    let p = PathBuf::from(path);
    if !p.is_file() {
        return Err(AppError::Message(format!("hook file not found: {path}")));
    }
    let file_name = p
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::Message("invalid hook path".into()))?
        .to_string();

    let parent = p
        .parent()
        .ok_or_else(|| AppError::Message("invalid hook path".into()))?;

    let base = file_name
        .trim_end_matches(".disabled.json")
        .trim_end_matches(".json");
    let target_name = if enabled {
        format!("{base}.json")
    } else {
        format!("{base}.disabled.json")
    };
    let target = parent.join(&target_name);
    if target != p {
        fs::rename(&p, &target).map_err(|e| AppError::Message(format!("rename hook: {e}")))?;
    }
    let events = parse_hook_events(&target);
    let scope = if target.starts_with(grok_home().join("hooks")) {
        "user"
    } else {
        "project"
    };
    Ok(HookInfo {
        name: base.to_string(),
        path: target.display().to_string(),
        scope: scope.into(),
        events,
        trusted: true,
        enabled,
    })
}

// ── Trusted folders ────────────────────────────────────────────────────────

fn trusted_folders_path() -> PathBuf {
    grok_home().join("trusted_folders.toml")
}

pub fn load_trusted_folders() -> Vec<TrustedFolder> {
    let path = trusted_folders_path();
    let Ok(raw) = fs::read_to_string(&path) else {
        return Vec::new();
    };
    let Ok(doc) = raw.parse::<toml::Value>() else {
        return Vec::new();
    };
    let mut out = Vec::new();
    // Common shapes: folders = ["/a", "/b"] or [folders] entries
    if let Some(arr) = doc.get("folders").and_then(|v| v.as_array()) {
        for v in arr {
            if let Some(s) = v.as_str() {
                out.push(TrustedFolder {
                    path: s.to_string(),
                    trusted: true,
                });
            } else if let Some(t) = v.as_table() {
                if let Some(p) = t.get("path").and_then(|x| x.as_str()) {
                    let trusted = t.get("trusted").and_then(|x| x.as_bool()).unwrap_or(true);
                    out.push(TrustedFolder {
                        path: p.to_string(),
                        trusted,
                    });
                }
            }
        }
    }
    if let Some(arr) = doc.get("trusted").and_then(|v| v.as_array()) {
        for v in arr {
            if let Some(s) = v.as_str() {
                if !out.iter().any(|f| f.path == s) {
                    out.push(TrustedFolder {
                        path: s.to_string(),
                        trusted: true,
                    });
                }
            }
        }
    }
    // Table of path = true
    if let Some(tbl) = doc.get("paths").and_then(|v| v.as_table()) {
        for (k, v) in tbl {
            let trusted = v.as_bool().unwrap_or(true);
            if !out.iter().any(|f| f.path == *k) {
                out.push(TrustedFolder {
                    path: k.clone(),
                    trusted,
                });
            }
        }
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    out
}

fn is_path_trusted(folders: &[TrustedFolder], path: &str) -> bool {
    let path = Path::new(path);
    folders.iter().any(|f| {
        if !f.trusted {
            return false;
        }
        let trusted = Path::new(&f.path);
        path == trusted || path.starts_with(trusted)
    })
}

/// Trust a project folder for hooks / project MCP / LSP (folder-trust store).
pub fn set_project_trust(path: &str, trusted: bool) -> AppResult<Vec<TrustedFolder>> {
    let path = canonicalize_soft(path);
    let mut folders = load_trusted_folders();
    if trusted {
        if !folders.iter().any(|f| f.path == path && f.trusted) {
            folders.retain(|f| f.path != path);
            folders.push(TrustedFolder {
                path: path.clone(),
                trusted: true,
            });
        }
    } else {
        folders.retain(|f| f.path != path);
    }
    folders.sort_by(|a, b| a.path.cmp(&b.path));
    write_trusted_folders(&folders)?;
    Ok(folders)
}

fn write_trusted_folders(folders: &[TrustedFolder]) -> AppResult<()> {
    let path = trusted_folders_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| AppError::Message(format!("create grok home: {e}")))?;
    }
    let mut doc = DocumentMut::new();
    let mut arr = Array::new();
    for f in folders {
        if f.trusted {
            arr.push(f.path.as_str());
        }
    }
    doc["folders"] = Item::Value(TomlEditValue::Array(arr));
    // Comment header
    let body = format!(
        "# Grok folder trust — project hooks, MCP, and LSP require trust.\n\
         # Edited by KayG. Paths cascade to subdirectories.\n\n{}",
        doc
    );
    fs::write(&path, body).map_err(|e| AppError::Message(format!("write trusted_folders: {e}")))?;
    Ok(())
}

fn canonicalize_soft(path: &str) -> String {
    let p = PathBuf::from(path);
    fs::canonicalize(&p)
        .map(|c| c.display().to_string())
        .unwrap_or_else(|_| path.to_string())
}

// ── Plugins & marketplace ──────────────────────────────────────────────────

fn load_plugins() -> (Vec<PluginInfo>, Vec<String>) {
    let mut notes = Vec::new();
    let mut plugins = Vec::new();

    // Prefer CLI JSON list
    if let Some(bin) = detect_grok_binary(None) {
        match Command::new(&bin)
            .args(["plugin", "list", "--json"])
            .output()
        {
            Ok(out) if out.status.success() => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                if let Ok(v) = serde_json::from_str::<JsonValue>(stdout.trim()) {
                    plugins.extend(parse_plugin_list_json(&v));
                }
            }
            Ok(out) => {
                let err = String::from_utf8_lossy(&out.stderr);
                if !err.trim().is_empty() {
                    notes.push(format!("plugin list: {}", err.trim().chars().take(200).collect::<String>()));
                }
            }
            Err(e) => notes.push(format!("plugin list failed: {e}")),
        }
    }

    // Also scan marketplace cache for known catalog (available, not installed)
    // Already handled in marketplace_plugins.

    plugins.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    (plugins, notes)
}

fn parse_plugin_list_json(v: &JsonValue) -> Vec<PluginInfo> {
    let mut out = Vec::new();
    let arr = if let Some(a) = v.as_array() {
        a.clone()
    } else if let Some(a) = v.get("plugins").and_then(|x| x.as_array()) {
        a.clone()
    } else {
        return out;
    };
    for item in arr {
        let name = item
            .get("name")
            .or_else(|| item.get("id"))
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        if name.is_empty() {
            continue;
        }
        let enabled = item
            .get("enabled")
            .and_then(|x| x.as_bool())
            .unwrap_or(true);
        let trusted = item
            .get("trusted")
            .and_then(|x| x.as_bool())
            .unwrap_or(false);
        out.push(PluginInfo {
            name,
            description: item
                .get("description")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            version: item
                .get("version")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            installed: true,
            enabled,
            source: item
                .get("source")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            category: item
                .get("category")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string()),
            trusted,
        });
    }
    out
}

fn load_marketplace_plugins(
    installed: &std::collections::HashSet<String>,
) -> Vec<MarketplacePlugin> {
    let mut out = Vec::new();
    let cache = grok_home().join("marketplace-cache");
    if !cache.is_dir() {
        return out;
    }
    let Ok(entries) = fs::read_dir(&cache) else {
        return out;
    };
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let market_json = dir.join(".grok-plugin/marketplace.json");
        if !market_json.is_file() {
            continue;
        }
        let Ok(raw) = fs::read_to_string(&market_json) else {
            continue;
        };
        let Ok(v) = serde_json::from_str::<JsonValue>(&raw) else {
            continue;
        };
        let market_name = v
            .get("name")
            .and_then(|x| x.as_str())
            .unwrap_or("marketplace")
            .to_string();
        let Some(plugins) = v.get("plugins").and_then(|x| x.as_array()) else {
            continue;
        };
        for p in plugins {
            let name = p
                .get("name")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            if name.is_empty() {
                continue;
            }
            out.push(MarketplacePlugin {
                name: name.clone(),
                description: p
                    .get("description")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string()),
                category: p
                    .get("category")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string()),
                homepage: p
                    .get("homepage")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string()),
                marketplace: Some(market_name.clone()),
                installed: installed.contains(&name.to_lowercase()),
            });
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    // Dedupe by name
    let mut seen = std::collections::HashSet::new();
    out.retain(|p| seen.insert(p.name.to_lowercase()));
    out
}

/// Install a plugin via `grok plugin install <source> --trust` (requires explicit trust from UI).
pub fn plugin_install(source: &str, trust: bool) -> AppResult<String> {
    let bin = detect_grok_binary(None)
        .ok_or_else(|| AppError::Message("grok binary not found".into()))?;
    let mut args = vec!["plugin", "install", source];
    if trust {
        args.push("--trust");
    }
    let out = Command::new(&bin)
        .args(&args)
        .output()
        .map_err(|e| AppError::Message(format!("plugin install: {e}")))?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let stderr = String::from_utf8_lossy(&out.stderr);
    if !out.status.success() {
        return Err(AppError::Message(format!(
            "plugin install failed: {}",
            stderr.trim().if_empty(stdout.trim())
        )));
    }
    Ok(stdout.trim().if_empty(stderr.trim()).to_string())
}

pub fn plugin_uninstall(name: &str) -> AppResult<String> {
    let bin = detect_grok_binary(None)
        .ok_or_else(|| AppError::Message("grok binary not found".into()))?;
    let out = Command::new(&bin)
        .args(["plugin", "uninstall", name, "--confirm"])
        .output()
        .map_err(|e| AppError::Message(format!("plugin uninstall: {e}")))?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let stderr = String::from_utf8_lossy(&out.stderr);
    if !out.status.success() {
        return Err(AppError::Message(format!(
            "plugin uninstall failed: {}",
            stderr.trim().if_empty(stdout.trim())
        )));
    }
    Ok(stdout.trim().if_empty(stderr.trim()).to_string())
}

pub fn plugin_set_enabled(name: &str, enabled: bool) -> AppResult<String> {
    let bin = detect_grok_binary(None)
        .ok_or_else(|| AppError::Message("grok binary not found".into()))?;
    let sub = if enabled { "enable" } else { "disable" };
    let out = Command::new(&bin)
        .args(["plugin", sub, name])
        .output()
        .map_err(|e| AppError::Message(format!("plugin {sub}: {e}")))?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let stderr = String::from_utf8_lossy(&out.stderr);
    if !out.status.success() {
        return Err(AppError::Message(format!(
            "plugin {sub} failed: {}",
            stderr.trim().if_empty(stdout.trim())
        )));
    }
    Ok(stdout.trim().if_empty(stderr.trim()).to_string())
}

// ── Config.toml mutations (MCP + skills) ───────────────────────────────────

fn read_config_doc() -> AppResult<DocumentMut> {
    let path = config_toml_path();
    if !path.is_file() {
        // Ensure file exists
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| AppError::Message(format!("create grok home: {e}")))?;
        }
        fs::write(
            &path,
            "# Grok config — managed in part by KayG\n",
        )
        .map_err(|e| AppError::Message(format!("create config.toml: {e}")))?;
    }
    let raw = fs::read_to_string(&path)
        .map_err(|e| AppError::Message(format!("read config.toml: {e}")))?;
    raw.parse::<DocumentMut>()
        .map_err(|e| AppError::Message(format!("parse config.toml: {e}")))
}

fn write_config_doc(doc: &DocumentMut) -> AppResult<()> {
    let path = config_toml_path();
    fs::write(&path, doc.to_string())
        .map_err(|e| AppError::Message(format!("write config.toml: {e}")))?;
    Ok(())
}

pub fn set_mcp_enabled(name: &str, enabled: bool) -> AppResult<McpServerInfo> {
    let name = name.trim();
    if name.is_empty() || name.contains('.') || name.contains('[') {
        return Err(AppError::Message("invalid MCP server name".into()));
    }
    let mut doc = read_config_doc()?;
    {
        let servers = doc["mcp_servers"]
            .or_insert(Item::Table(Table::new()))
            .as_table_mut()
            .ok_or_else(|| AppError::Message("mcp_servers is not a table".into()))?;
        let server = servers
            .get_mut(name)
            .ok_or_else(|| AppError::Message(format!("MCP server not found: {name}")))?;
        server["enabled"] = Item::Value(TomlEditValue::from(enabled));
    }
    write_config_doc(&doc)?;
    let item = doc["mcp_servers"]
        .get(name)
        .ok_or_else(|| AppError::Message(format!("MCP server not found: {name}")))?;
    Ok(mcp_info_from_item(name, item))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddMcpArgs {
    pub name: String,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub args: Option<Vec<String>>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub enabled: Option<bool>,
}

pub fn add_mcp_server(args: AddMcpArgs) -> AppResult<McpServerInfo> {
    let name = args.name.trim().to_string();
    if name.is_empty()
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(AppError::Message(
            "MCP name must be alphanumeric, '-', or '_'".into(),
        ));
    }
    let has_cmd = args.command.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false);
    let has_url = args.url.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false);
    if has_cmd == has_url {
        return Err(AppError::Message(
            "Provide either a stdio command or an HTTP url (not both/neither)".into(),
        ));
    }

    let mut doc = read_config_doc()?;
    {
        let servers = doc["mcp_servers"]
            .or_insert(Item::Table(Table::new()))
            .as_table_mut()
            .ok_or_else(|| AppError::Message("mcp_servers is not a table".into()))?;
        if servers.contains_key(&name) {
            return Err(AppError::Message(format!(
                "MCP server already exists: {name}"
            )));
        }

        let mut table = Table::new();
        table["enabled"] = Item::Value(TomlEditValue::from(args.enabled.unwrap_or(true)));
        if has_cmd {
            table["command"] =
                Item::Value(TomlEditValue::from(args.command.as_ref().unwrap().trim()));
            if let Some(a) = &args.args {
                if !a.is_empty() {
                    let mut arr = Array::new();
                    for s in a {
                        arr.push(s.as_str());
                    }
                    table["args"] = Item::Value(TomlEditValue::Array(arr));
                }
            }
        } else {
            table["url"] = Item::Value(TomlEditValue::from(args.url.as_ref().unwrap().trim()));
        }
        servers.insert(&name, Item::Table(table));
    }
    write_config_doc(&doc)?;
    let item = doc["mcp_servers"]
        .get(&name)
        .ok_or_else(|| AppError::Message(format!("MCP server not found after insert: {name}")))?;
    Ok(mcp_info_from_item(&name, item))
}

pub fn remove_mcp_server(name: &str) -> AppResult<()> {
    let name = name.trim();
    let mut doc = read_config_doc()?;
    let Some(servers) = doc["mcp_servers"].as_table_mut() else {
        return Err(AppError::Message("no mcp_servers table".into()));
    };
    if servers.remove(name).is_none() {
        return Err(AppError::Message(format!("MCP server not found: {name}")));
    }
    write_config_doc(&doc)?;
    Ok(())
}

fn mcp_info_from_item(name: &str, item: &Item) -> McpServerInfo {
    let enabled = item
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let command = item
        .get("command")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let url = item
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
    McpServerInfo {
        name: name.to_string(),
        command,
        url,
        enabled,
        transport,
    }
}

pub fn set_skill_disabled(name: &str, disabled: bool) -> AppResult<Vec<String>> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::Message("empty skill name".into()));
    }
    let mut doc = read_config_doc()?;
    let skills = doc["skills"]
        .or_insert(Item::Table(Table::new()))
        .as_table_mut()
        .ok_or_else(|| AppError::Message("skills is not a table".into()))?;

    let mut list: Vec<String> = skills
        .get("disabled")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let lower = name.to_lowercase();
    list.retain(|s| s.to_lowercase() != lower);
    if disabled {
        list.push(name.to_string());
        list.sort_by_key(|s| s.to_lowercase());
    }

    let mut arr = Array::new();
    for s in &list {
        arr.push(s.as_str());
    }
    skills["disabled"] = Item::Value(TomlEditValue::Array(arr));
    write_config_doc(&doc)?;
    Ok(list)
}

// ── helpers ────────────────────────────────────────────────────────────────

trait IfEmpty {
    fn if_empty<'a>(&'a self, other: &'a str) -> &'a str;
}

impl IfEmpty for str {
    fn if_empty<'a>(&'a self, other: &'a str) -> &'a str {
        if self.is_empty() {
            other
        } else {
            self
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mcp_info_parses_transport() {
        let mut t = Table::new();
        t["command"] = Item::Value(TomlEditValue::from("npx"));
        t["enabled"] = Item::Value(TomlEditValue::from(true));
        let info = mcp_info_from_item("demo", &Item::Table(t));
        assert_eq!(info.transport, "stdio");
        assert!(info.enabled);
    }
}
