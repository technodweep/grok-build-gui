//! Read/write custom `[model.<id>]` sections and `[models].default` in config.toml.
//! Also MCP doctor probe for tool discovery (via CLI).

use std::fs;
use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};
use toml::Value as TomlValue;
use toml_edit::{value, DocumentMut, Item, Table};

use super::grok_config::config_toml_path;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CustomModelDef {
    /// Config table key: `[model.<id>]`
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_backend: Option<String>,
    /// Never return the raw key to the UI; only whether one is set.
    #[serde(default)]
    pub has_api_key: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_completion_tokens: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context_window: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomModelsCatalog {
    pub config_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
    pub models: Vec<CustomModelDef>,
    #[serde(default)]
    pub notes: Vec<String>,
}

/// Input for save; may include plaintext api_key (written once, not re-read as plaintext).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCustomModelArgs {
    pub id: String,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub api_backend: Option<String>,
    /// If Some and non-empty, update api_key. None leaves existing.
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub clear_api_key: bool,
    #[serde(default)]
    pub env_key: Option<String>,
    #[serde(default)]
    pub temperature: Option<f64>,
    #[serde(default)]
    pub top_p: Option<f64>,
    #[serde(default)]
    pub max_completion_tokens: Option<u64>,
    #[serde(default)]
    pub context_window: Option<u64>,
}

pub fn load_custom_models() -> CustomModelsCatalog {
    let path = config_toml_path();
    let mut out = CustomModelsCatalog {
        config_path: path.display().to_string(),
        default_model: None,
        models: Vec::new(),
        notes: Vec::new(),
    };
    let Ok(raw) = fs::read_to_string(&path) else {
        out.notes
            .push("config.toml not found — save a model to create it.".into());
        return out;
    };
    let Ok(doc) = raw.parse::<TomlValue>() else {
        out.notes.push("Failed to parse config.toml".into());
        return out;
    };

    if let Some(d) = doc
        .get("models")
        .and_then(|m| m.get("default"))
        .and_then(|v| v.as_str())
    {
        out.default_model = Some(d.to_string());
    }

    // toml crate: tables named model.xxx appear as nested table "model" -> { xxx: {...} }
    // or as dotted keys. Also support top-level "model" table.
    if let Some(model_table) = doc.get("model").and_then(|v| v.as_table()) {
        for (id, val) in model_table {
            if let Some(t) = val.as_table() {
                out.models.push(def_from_table(id, t));
            }
        }
    }

    out.models.sort_by(|a, b| a.id.cmp(&b.id));
    if out.models.is_empty() {
        out.notes.push(
            "No custom [model.*] sections yet. Built-in SpaceXAI models need no entry.".into(),
        );
    }
    out
}

fn def_from_table(id: &str, t: &toml::map::Map<String, TomlValue>) -> CustomModelDef {
    CustomModelDef {
        id: id.to_string(),
        model: t
            .get("model")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        name: t
            .get("name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        description: t
            .get("description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        base_url: t
            .get("base_url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        api_backend: t
            .get("api_backend")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        has_api_key: t
            .get("api_key")
            .and_then(|v| v.as_str())
            .map(|s| !s.is_empty())
            .unwrap_or(false),
        env_key: match t.get("env_key") {
            Some(TomlValue::String(s)) => Some(s.clone()),
            Some(TomlValue::Array(a)) => Some(
                a.iter()
                    .filter_map(|v| v.as_str())
                    .collect::<Vec<_>>()
                    .join(", "),
            ),
            _ => None,
        },
        temperature: t.get("temperature").and_then(|v| v.as_float()),
        top_p: t.get("top_p").and_then(|v| v.as_float()),
        max_completion_tokens: t
            .get("max_completion_tokens")
            .and_then(|v| v.as_integer())
            .map(|n| n as u64),
        context_window: t
            .get("context_window")
            .and_then(|v| v.as_integer())
            .map(|n| n as u64),
    }
}

fn read_config_doc() -> AppResult<DocumentMut> {
    let path = config_toml_path();
    if !path.is_file() {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| AppError::Message(format!("create home: {e}")))?;
        }
        fs::write(&path, "# Grok config — managed in part by KayG\n")
            .map_err(|e| AppError::Message(format!("create config: {e}")))?;
    }
    let raw =
        fs::read_to_string(&path).map_err(|e| AppError::Message(format!("read config: {e}")))?;
    raw.parse::<DocumentMut>()
        .map_err(|e| AppError::Message(format!("parse config: {e}")))
}

fn write_config_doc(doc: &DocumentMut) -> AppResult<()> {
    fs::write(config_toml_path(), doc.to_string())
        .map_err(|e| AppError::Message(format!("write config: {e}")))
}

fn validate_model_id(id: &str) -> AppResult<()> {
    let id = id.trim();
    if id.is_empty() {
        return Err(AppError::Message("model id is empty".into()));
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err(AppError::Message(
            "model id: use letters, digits, -, _, . only".into(),
        ));
    }
    Ok(())
}

pub fn save_custom_model(args: SaveCustomModelArgs) -> AppResult<CustomModelDef> {
    validate_model_id(&args.id)?;
    let id = args.id.trim().to_string();
    let mut doc = read_config_doc()?;
    {
        let model_root = doc["model"]
            .or_insert(Item::Table(Table::new()))
            .as_table_mut()
            .ok_or_else(|| AppError::Message("model is not a table".into()))?;
        let entry = model_root
            .entry(&id)
            .or_insert(Item::Table(Table::new()))
            .as_table_mut()
            .ok_or_else(|| AppError::Message("model entry is not a table".into()))?;

        set_opt_str(entry, "model", args.model.as_deref());
        set_opt_str(entry, "name", args.name.as_deref());
        set_opt_str(entry, "description", args.description.as_deref());
        set_opt_str(entry, "base_url", args.base_url.as_deref());
        set_opt_str(entry, "api_backend", args.api_backend.as_deref());
        set_opt_str(entry, "env_key", args.env_key.as_deref());

        if args.clear_api_key {
            entry.remove("api_key");
        } else if let Some(k) = args
            .api_key
            .as_ref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            entry["api_key"] = value(k);
        }

        if let Some(t) = args.temperature {
            entry["temperature"] = value(t);
        }
        if let Some(t) = args.top_p {
            entry["top_p"] = value(t);
        }
        if let Some(n) = args.max_completion_tokens {
            entry["max_completion_tokens"] = value(n as i64);
        }
        if let Some(n) = args.context_window {
            entry["context_window"] = value(n as i64);
        }
    }
    write_config_doc(&doc)?;
    let cat = load_custom_models();
    cat.models
        .into_iter()
        .find(|m| m.id == id)
        .ok_or_else(|| AppError::Message("saved model not found after write".into()))
}

fn set_opt_str(table: &mut Table, key: &str, val: Option<&str>) {
    match val.map(str::trim).filter(|s| !s.is_empty()) {
        Some(s) => table[key] = value(s),
        None => {
            table.remove(key);
        }
    }
}

pub fn delete_custom_model(id: &str) -> AppResult<()> {
    validate_model_id(id)?;
    let id = id.trim();
    let mut doc = read_config_doc()?;
    {
        let Some(model_root) = doc.get_mut("model").and_then(|i| i.as_table_mut()) else {
            return Err(AppError::Message("no [model.*] sections".into()));
        };
        if model_root.remove(id).is_none() {
            return Err(AppError::Message(format!("model not found: {id}")));
        }
    }
    write_config_doc(&doc)?;
    Ok(())
}

pub fn set_default_model(model_id: Option<&str>) -> AppResult<Option<String>> {
    let mut doc = read_config_doc()?;
    {
        let models = doc["models"]
            .or_insert(Item::Table(Table::new()))
            .as_table_mut()
            .ok_or_else(|| AppError::Message("models is not a table".into()))?;
        match model_id.map(str::trim).filter(|s| !s.is_empty()) {
            Some(id) => models["default"] = value(id),
            None => {
                models.remove("default");
            }
        }
    }
    write_config_doc(&doc)?;
    Ok(model_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string()))
}

// ── MCP doctor (tools / health) ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpDoctorReport {
    pub ok: bool,
    pub raw: serde_json::Value,
    #[serde(default)]
    pub servers: Vec<McpDoctorServer>,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub stderr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpDoctorServer {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default)]
    pub tools: Vec<McpToolInfo>,
    #[serde(default)]
    pub tool_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolInfo {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// Run `grok mcp doctor --json` (optional server name filter).
pub fn run_mcp_doctor(
    server_name: Option<&str>,
    binary_override: Option<&str>,
) -> AppResult<McpDoctorReport> {
    use super::detect_grok_binary;
    let binary = detect_grok_binary(binary_override).ok_or(AppError::GrokNotFound)?;
    let mut cmd = Command::new(&binary);
    cmd.arg("mcp").arg("doctor").arg("--json");
    if let Some(name) = server_name.map(str::trim).filter(|s| !s.is_empty()) {
        cmd.arg(name);
    }
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    if let Some(home) = dirs::home_dir() {
        let grok_bin = home.join(".grok/bin");
        if let Ok(path) = std::env::var("PATH") {
            let prefix = grok_bin.display().to_string();
            if !path.split(':').any(|p| p == prefix) {
                cmd.env("PATH", format!("{prefix}:{path}"));
            }
        }
    }
    let output = cmd
        .output()
        .map_err(|e| AppError::Agent(format!("spawn grok mcp doctor: {e}")))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let raw: serde_json::Value = serde_json::from_str(stdout.trim()).unwrap_or_else(
        |_| serde_json::json!({ "parseError": stdout.chars().take(2000).collect::<String>() }),
    );

    let mut servers = Vec::new();
    // Shape varies: { servers: [ { name, tools, status, error } ] } or map
    if let Some(arr) = raw.get("servers").and_then(|s| s.as_array()) {
        for s in arr {
            servers.push(parse_mcp_server_entry(s));
        }
    } else if let Some(obj) = raw.get("servers").and_then(|s| s.as_object()) {
        for (name, s) in obj {
            let mut entry = parse_mcp_server_entry(s);
            if entry.name.is_empty() {
                entry.name = name.clone();
            }
            servers.push(entry);
        }
    } else if raw.get("name").is_some() || raw.get("tools").is_some() {
        // Single-server doctor response
        servers.push(parse_mcp_server_entry(&raw));
    }

    let healthy = raw
        .get("healthy_count")
        .and_then(|v| v.as_u64())
        .unwrap_or(servers.iter().filter(|s| s.error.is_none()).count() as u64);
    let failing = raw
        .get("failing_count")
        .and_then(|v| v.as_u64())
        .unwrap_or(servers.iter().filter(|s| s.error.is_some()).count() as u64);
    let tool_total: usize = servers.iter().map(|s| s.tool_count).sum();
    let server_count = servers.len();

    Ok(McpDoctorReport {
        ok: output.status.success() || !stdout.trim().is_empty(),
        raw,
        servers,
        summary: format!(
            "{healthy} healthy, {failing} failing, {tool_total} tool(s) across {server_count} server(s)"
        ),
        stderr: stderr.chars().take(2000).collect(),
    })
}

fn parse_mcp_server_entry(s: &serde_json::Value) -> McpDoctorServer {
    let name = s
        .get("name")
        .or_else(|| s.get("server"))
        .or_else(|| s.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let status = s.get("status").and_then(|v| {
        if let Some(st) = v.as_str() {
            Some(st.to_string())
        } else if let Some(obj) = v.as_object() {
            obj.get("status")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string())
        } else {
            None
        }
    });
    let error = s
        .get("error")
        .and_then(|v| v.as_str())
        .or_else(|| s.get("message").and_then(|v| v.as_str()))
        .map(|s| s.to_string());

    let mut tools = Vec::new();
    if let Some(arr) = s.get("tools").and_then(|t| t.as_array()) {
        for t in arr {
            let n = t
                .get("name")
                .or_else(|| t.get("tool"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if n.is_empty() {
                continue;
            }
            tools.push(McpToolInfo {
                name: n,
                description: t
                    .get("description")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            });
        }
    } else if let Some(arr) = s.pointer("/result/tools").and_then(|t| t.as_array()) {
        for t in arr {
            let n = t
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if n.is_empty() {
                continue;
            }
            tools.push(McpToolInfo {
                name: n,
                description: t
                    .get("description")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            });
        }
    }

    let tool_count = if tools.is_empty() {
        s.get("tool_count")
            .or_else(|| s.get("tools_count"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as usize
    } else {
        tools.len()
    };

    McpDoctorServer {
        name,
        status,
        error,
        tools,
        tool_count,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_id() {
        assert!(validate_model_id("my-model").is_ok());
        assert!(validate_model_id("bad id").is_err());
    }

    #[test]
    fn parse_server_with_tools() {
        let v = serde_json::json!({
            "name": "github",
            "status": "ok",
            "tools": [
                { "name": "create_issue", "description": "Create an issue" },
                { "name": "list_prs" }
            ]
        });
        let s = parse_mcp_server_entry(&v);
        assert_eq!(s.name, "github");
        assert_eq!(s.tools.len(), 2);
        assert_eq!(s.tool_count, 2);
    }
}
