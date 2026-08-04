use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

pub mod settings;
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
}

pub fn environment_info(binary_override: Option<&str>) -> EnvironmentInfo {
    let home = grok_home();
    let auth_present = home.join("auth.json").is_file()
        || std::env::var("XAI_API_KEY").is_ok()
        || std::env::var("GROK_API_KEY").is_ok();

    let binary_path = detect_grok_binary(binary_override);
    let binary_version = binary_path.as_ref().and_then(|p| grok_version(p).ok());

    EnvironmentInfo {
        grok_home: home.display().to_string(),
        binary_path: binary_path.as_ref().map(|p| p.display().to_string()),
        binary_version,
        found: binary_path.is_some(),
        auth_present,
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
