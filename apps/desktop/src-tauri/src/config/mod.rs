use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

pub mod account;
pub mod agents;
pub mod custom_models;
pub mod extensions;
pub mod grok_config;
pub mod memory;
pub mod project_rules;
pub mod settings;
pub use account::{
    load_auth_account, load_privacy_config, load_sandbox_status, run_doctor, run_login, run_logout,
    set_sandbox_profile, set_telemetry_enabled, AuthAccountInfo, CliActionResult, DoctorReport,
    LoginMode, PrivacyConfig, SandboxStatus,
};
pub use custom_models::{
    delete_custom_model, load_custom_models, run_mcp_doctor, save_custom_model, set_default_model,
    CustomModelDef, CustomModelsCatalog, McpDoctorReport, SaveCustomModelArgs,
};
pub use project_rules::{
    ensure_agents_md, load_project_rules, read_project_rule, save_project_rule, ProjectRuleContent,
    ProjectRulesCatalog,
};
pub use agents::{
    delete_user_agent, delete_user_persona, load_agents_catalog, save_user_agent, save_user_persona,
    AgentDef, AgentsCatalog, PersonaDef,
};
pub use extensions::{
    add_mcp_server, load_extensions_hub, plugin_install, plugin_set_enabled, plugin_uninstall,
    remove_mcp_server, set_hook_enabled, set_mcp_enabled, set_project_trust, set_skill_disabled,
    AddMcpArgs, ExtensionsHub, HookInfo, TrustedFolder,
};
pub use grok_config::{load_grok_config_overview, GrokConfigOverview, McpServerInfo};
pub use memory::{
    delete_memory_file, list_recent_media, load_memory_catalog, read_local_media, read_memory_file,
    set_memory_config_enabled, LocalMediaData, MemoryCatalog, MemoryFileContent, MemoryFileEntry,
};
pub use settings::{load_settings, save_settings, GuiSettings};

/// Resolve Grok home directory (`GROK_HOME` or `~/.grok`).
pub fn grok_home() -> PathBuf {
    if let Ok(home) = std::env::var("GROK_HOME") {
        return PathBuf::from(home);
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".grok")
}

/// Detect the `grok` CLI binary.
///
/// Order: explicit override → `GROK_BINARY` env → `which grok` → common install paths.
pub fn detect_grok_binary(override_path: Option<&str>) -> Option<PathBuf> {
    if let Some(path) = override_path {
        let p = PathBuf::from(path);
        if p.is_file() {
            return Some(p);
        }
    }

    if let Ok(env_path) = std::env::var("GROK_BINARY") {
        let p = PathBuf::from(env_path);
        if p.is_file() {
            return Some(p);
        }
    }

    if let Ok(path) = which::which("grok") {
        return Some(path);
    }

    // Common install locations when PATH is incomplete (GUI apps often inherit a slim env).
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(home) = dirs::home_dir() {
        candidates.push(home.join(".grok/bin/grok"));
        candidates.push(home.join(".local/bin/grok"));
    }
    candidates.push(PathBuf::from("/usr/local/bin/grok"));
    candidates.push(PathBuf::from("/usr/bin/grok"));

    candidates.into_iter().find(|p| p.is_file())
}

/// Run `grok --version` and return stdout (trimmed).
pub fn grok_version(binary: &Path) -> AppResult<String> {
    let output = std::process::Command::new(binary)
        .arg("--version")
        .output()
        .map_err(|e| {
            AppError::Agent(format!(
                "failed to run `{} --version`: {e}",
                binary.display()
            ))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Agent(format!(
            "`{} --version` failed: {stderr}",
            binary.display()
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentInfo {
    pub grok_home: String,
    pub binary_path: Option<String>,
    pub binary_version: Option<String>,
    pub found: bool,
    pub auth_present: bool,
    /// Best-effort email from `~/.grok/auth.json` when present.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_email: Option<String>,
    /// `Oidc` / `ApiKey` / etc. when detectable.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_mode: Option<String>,
}

/// Peek local auth file for display (does not validate the token).
pub fn read_local_auth_meta() -> (bool, Option<String>, Option<String>) {
    let home = grok_home();
    let path = home.join("auth.json");
    if let Ok(raw) = std::fs::read_to_string(&path) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
            let email = v
                .get("email")
                .or_else(|| v.pointer("/user/email"))
                .or_else(|| v.pointer("/account/email"))
                .and_then(|x| x.as_str())
                .map(|s| s.to_string());
            let mode = v
                .get("auth_mode")
                .or_else(|| v.get("authMode"))
                .or_else(|| v.get("mode"))
                .and_then(|x| x.as_str())
                .map(|s| s.to_string());
            return (true, email, mode);
        }
        return (true, None, None);
    }
    let env_key = std::env::var("XAI_API_KEY").is_ok() || std::env::var("GROK_API_KEY").is_ok();
    if env_key {
        return (true, None, Some("ApiKey".into()));
    }
    (false, None, None)
}

pub fn environment_info(binary_override: Option<&str>) -> EnvironmentInfo {
    let home = grok_home();
    let (auth_present, auth_email, auth_mode) = read_local_auth_meta();

    let binary_path = detect_grok_binary(binary_override);
    let binary_version = binary_path.as_ref().and_then(|p| grok_version(p).ok());

    EnvironmentInfo {
        grok_home: home.display().to_string(),
        binary_path: binary_path.as_ref().map(|p| p.display().to_string()),
        binary_version,
        found: binary_path.is_some(),
        auth_present,
        auth_email,
        auth_mode,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grok_home_defaults_under_home() {
        // SAFETY: test process only
        unsafe {
            std::env::remove_var("GROK_HOME");
        }
        let home = grok_home();
        assert!(home.ends_with(".grok") || home.components().any(|c| c.as_os_str() == ".grok"));
    }
}
