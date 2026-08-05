//! GUI-local settings (last project path, theme, binary override, etc.).

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::grok_home;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuiSettings {
    #[serde(default)]
    pub last_project_cwd: Option<String>,
    #[serde(default)]
    pub always_approve: bool,
    /// Optional absolute path to the `grok` binary.
    #[serde(default)]
    pub binary_override: Option<String>,
    /// `dark` | `light` | `dim`
    #[serde(default = "default_theme")]
    pub theme: String,
    /// Base UI font size in px (12–20).
    #[serde(default = "default_font_size")]
    pub font_size: u32,
    /// Enter = newline when true; Enter = send when false (default).
    #[serde(default)]
    pub multiline_mode: bool,
    /// Tighter spacing in chat scrollback.
    #[serde(default)]
    pub compact_mode: bool,
    /// Show per-message timestamps in scrollback.
    #[serde(default)]
    pub show_timestamps: bool,
}

fn default_theme() -> String {
    "dark".into()
}

fn default_font_size() -> u32 {
    14
}

fn settings_path() -> PathBuf {
    grok_home().join("gui").join("settings.json")
}

pub fn load_settings() -> GuiSettings {
    let path = settings_path();
    let Ok(raw) = fs::read_to_string(path) else {
        return GuiSettings::default();
    };
    let mut s: GuiSettings = serde_json::from_str(&raw).unwrap_or_default();
    if s.theme.is_empty() {
        s.theme = default_theme();
    }
    if s.font_size < 12 || s.font_size > 20 {
        s.font_size = default_font_size();
    }
    s
}

pub fn save_settings(settings: &GuiSettings) -> AppResult<()> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| AppError::Message(format!("create settings dir: {e}")))?;
    }
    let raw = serde_json::to_string_pretty(settings)
        .map_err(|e| AppError::Message(format!("serialize settings: {e}")))?;
    fs::write(&path, raw).map_err(|e| AppError::Message(format!("write settings: {e}")))?;
    Ok(())
}
