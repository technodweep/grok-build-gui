//! Account, privacy, sandbox config, and `grok doctor` helpers (Phase H).
//! Login/logout shell out to the Grok CLI so auth stays agent-owned.

use std::fs;
use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use toml::Value as TomlValue;
use toml_edit::{value, DocumentMut, Item, Table};

use super::detect_grok_binary;
use super::grok_config::config_toml_path;
use super::grok_home;
use crate::error::{AppError, AppResult};

// ── Auth account (privacy-safe meta, no tokens) ────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AuthAccountInfo {
    pub present: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub principal_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub create_time: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub oidc_issuer: Option<String>,
    /// When true, user opted out of coding-data retention/training share.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub coding_data_retention_opt_out: Option<bool>,
    /// Best-effort ZDR / admin flags if present in auth.json (names vary).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub zero_data_retention: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub privacy_note: Option<String>,
    pub api_key_env: bool,
    #[serde(default)]
    pub auth_path: String,
}

pub fn load_auth_account() -> AuthAccountInfo {
    let home = grok_home();
    let path = home.join("auth.json");
    let api_key_env = std::env::var("XAI_API_KEY").is_ok() || std::env::var("GROK_API_KEY").is_ok();
    let mut info = AuthAccountInfo {
        present: false,
        api_key_env,
        auth_path: path.display().to_string(),
        privacy_note: Some(
            "Coding-data sharing is managed in the agent (/privacy). Telemetry is a separate config knob."
                .into(),
        ),
        ..Default::default()
    };

    let Ok(raw) = fs::read_to_string(&path) else {
        return info;
    };
    let Ok(v) = serde_json::from_str::<JsonValue>(&raw) else {
        info.present = !raw.trim().is_empty();
        return info;
    };

    let Some(e) = pick_auth_entry(&v) else {
        info.present = path.is_file() && !raw.trim().is_empty();
        return info;
    };
    info.present = true;
    info.email = str_field(e, &["email", "user_email"]);
    info.auth_mode = str_field(e, &["auth_mode", "authMode", "mode"]);
    info.first_name = str_field(e, &["first_name", "firstName", "name"]);
    info.user_id = str_field(e, &["user_id", "userId", "principal_id", "principalId"]);
    info.team_id = str_field(e, &["team_id", "teamId"]);
    info.principal_type = str_field(e, &["principal_type", "principalType"]);
    info.expires_at = str_field(e, &["expires_at", "expiresAt"]);
    info.create_time = str_field(e, &["create_time", "createTime"]);
    info.oidc_issuer = str_field(e, &["oidc_issuer", "oidcIssuer", "issuer"]);
    info.coding_data_retention_opt_out = bool_field(
        e,
        &[
            "coding_data_retention_opt_out",
            "codingDataRetentionOptOut",
            "coding_data_opt_out",
        ],
    );
    info.zero_data_retention = bool_field(
        e,
        &[
            "zero_data_retention",
            "zeroDataRetention",
            "zdr",
            "zdr_enabled",
        ],
    );
    if info.zero_data_retention == Some(true) {
        info.privacy_note = Some(
            "Zero Data Retention (ZDR) appears enabled for this account; coding-data sharing may be admin-managed."
                .into(),
        );
    }
    info
}

fn pick_auth_entry(v: &JsonValue) -> Option<&JsonValue> {
    if v.get("email").is_some() || v.get("key").is_some() || v.get("auth_mode").is_some() {
        return Some(v);
    }
    let obj = v.as_object()?;
    for (_k, val) in obj {
        if val.get("email").is_some() {
            return Some(val);
        }
    }
    obj.values().next()
}

fn str_field(v: &JsonValue, keys: &[&str]) -> Option<String> {
    for k in keys {
        if let Some(s) = v.get(*k).and_then(|x| x.as_str()) {
            if !s.is_empty() {
                return Some(s.to_string());
            }
        }
    }
    None
}

fn bool_field(v: &JsonValue, keys: &[&str]) -> Option<bool> {
    for k in keys {
        if let Some(b) = v.get(*k).and_then(|x| x.as_bool()) {
            return Some(b);
        }
    }
    None
}

// ── Login / logout CLI ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliActionResult {
    pub ok: bool,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    #[serde(default)]
    pub urls: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device_code: Option<String>,
    pub summary: String,
}

#[derive(Debug, Clone, Copy)]
pub enum LoginMode {
    Oauth,
    Device,
}

impl LoginMode {
    pub fn from_str_loose(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "device" | "device-auth" | "device_code" | "device-code" | "code" => LoginMode::Device,
            _ => LoginMode::Oauth,
        }
    }
}

fn enrich_path(cmd: &mut Command) {
    if let Some(home) = dirs::home_dir() {
        let grok_bin = home.join(".grok/bin");
        if let Ok(path) = std::env::var("PATH") {
            let prefix = grok_bin.display().to_string();
            if !path.split(':').any(|p| p == prefix) {
                cmd.env("PATH", format!("{prefix}:{path}"));
            }
        }
    }
}

fn extract_urls(text: &str) -> Vec<String> {
    let mut urls = Vec::new();
    for word in text.split_whitespace() {
        let w =
            word.trim_matches(|c: char| c == ')' || c == '(' || c == ',' || c == '"' || c == '\'');
        if (w.starts_with("https://") || w.starts_with("http://"))
            && !urls.iter().any(|u: &String| u == w)
        {
            urls.push(w.to_string());
        }
    }
    urls
}

fn extract_device_code(text: &str) -> Option<String> {
    for line in text.lines() {
        let lower = line.to_lowercase();
        if !lower.contains("code") {
            continue;
        }
        for tok in line.split_whitespace().rev() {
            let t = tok.trim_matches(|c: char| !c.is_ascii_alphanumeric() && c != '-');
            if t.len() >= 4
                && t.len() <= 20
                && t.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
            {
                if t.eq_ignore_ascii_case("code") || t.contains("http") {
                    continue;
                }
                if t.chars().any(|c| c.is_ascii_digit()) || t.contains('-') {
                    return Some(t.to_string());
                }
            }
        }
    }
    None
}

fn run_with_timeout(mut cmd: Command, timeout: Duration) -> AppResult<std::process::Output> {
    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::Agent(format!("spawn: {e}")))?;
    let mut stdout_pipe = child.stdout.take();
    let mut stderr_pipe = child.stderr.take();

    let stdout_handle = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut s) = stdout_pipe.take() {
            let _ = s.read_to_end(&mut buf);
        }
        buf
    });
    let stderr_handle = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut s) = stderr_pipe.take() {
            let _ = s.read_to_end(&mut buf);
        }
        buf
    });

    let start = std::time::Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(st)) => break st,
            Ok(None) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(AppError::Agent(format!(
                        "command timed out after {}s",
                        timeout.as_secs()
                    )));
                }
                std::thread::sleep(Duration::from_millis(150));
            }
            Err(e) => return Err(AppError::Agent(format!("wait: {e}"))),
        }
    };

    let stdout = stdout_handle.join().unwrap_or_default();
    let stderr = stderr_handle.join().unwrap_or_default();
    Ok(std::process::Output {
        status,
        stdout,
        stderr,
    })
}

/// Run `grok login` (browser OAuth or device code). Blocks until CLI exits.
pub fn run_login(mode: LoginMode, binary_override: Option<&str>) -> AppResult<CliActionResult> {
    let binary = detect_grok_binary(binary_override).ok_or(AppError::GrokNotFound)?;
    let mut cmd = Command::new(&binary);
    cmd.arg("login");
    match mode {
        LoginMode::Oauth => {
            cmd.arg("--oauth");
        }
        LoginMode::Device => {
            cmd.arg("--device-auth");
        }
    }
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    enrich_path(&mut cmd);
    let output = run_with_timeout(cmd, Duration::from_secs(300))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{stdout}\n{stderr}");
    let urls = extract_urls(&combined);
    let device_code = extract_device_code(&combined);
    let code = output.status.code();
    let ok = output.status.success();
    let summary = if ok {
        match mode {
            LoginMode::Oauth => "Login completed (browser OAuth).".into(),
            LoginMode::Device => "Login completed (device code).".into(),
        }
    } else {
        format!(
            "Login failed (exit {}). {}",
            code.map(|c| c.to_string()).unwrap_or_else(|| "?".into()),
            stderr.lines().next().unwrap_or("see output")
        )
    };
    Ok(CliActionResult {
        ok,
        exit_code: code,
        stdout: stdout.chars().take(8000).collect(),
        stderr: stderr.chars().take(8000).collect(),
        urls,
        device_code,
        summary,
    })
}

pub fn run_logout(binary_override: Option<&str>) -> AppResult<CliActionResult> {
    let binary = detect_grok_binary(binary_override).ok_or(AppError::GrokNotFound)?;
    let mut cmd = Command::new(&binary);
    cmd.arg("logout")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    enrich_path(&mut cmd);
    let output = run_with_timeout(cmd, Duration::from_secs(60))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let ok = output.status.success();
    Ok(CliActionResult {
        ok,
        exit_code: output.status.code(),
        stdout: stdout.chars().take(4000).collect(),
        stderr: stderr.chars().take(4000).collect(),
        urls: Vec::new(),
        device_code: None,
        summary: if ok {
            "Signed out — cached credentials cleared.".into()
        } else {
            format!(
                "Logout failed: {}",
                stderr.lines().next().unwrap_or("unknown error")
            )
        },
    })
}

// ── Doctor ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DoctorReport {
    pub ok: bool,
    pub raw: JsonValue,
    #[serde(default)]
    pub findings: Vec<DoctorFinding>,
    #[serde(default)]
    pub issues: u32,
    #[serde(default)]
    pub recommendations: u32,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub stderr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DoctorFinding {
    pub id: String,
    pub disposition: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub remediation: Option<String>,
}

pub fn run_doctor(binary_override: Option<&str>) -> AppResult<DoctorReport> {
    let binary = detect_grok_binary(binary_override).ok_or(AppError::GrokNotFound)?;
    let mut cmd = Command::new(&binary);
    cmd.arg("doctor")
        .arg("--json")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    enrich_path(&mut cmd);
    let output = run_with_timeout(cmd, Duration::from_secs(90))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let raw: JsonValue = serde_json::from_str(stdout.trim()).unwrap_or_else(|_| {
        JsonValue::Object(serde_json::Map::from_iter([(
            "parseError".into(),
            JsonValue::String(stdout.chars().take(2000).collect()),
        )]))
    });

    let mut findings = Vec::new();
    if let Some(arr) = raw.get("findings").and_then(|f| f.as_array()) {
        for f in arr {
            findings.push(DoctorFinding {
                id: f
                    .get("id")
                    .and_then(|x| x.as_str())
                    .unwrap_or("unknown")
                    .to_string(),
                disposition: f
                    .get("disposition")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string(),
                message: f
                    .get("message")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string(),
                note: f
                    .get("note")
                    .and_then(|x| x.as_str())
                    .map(|s| s.to_string()),
                remediation: f
                    .get("remediation")
                    .and_then(|x| x.as_str())
                    .or_else(|| f.get("automaticRemediation").and_then(|x| x.as_str()))
                    .map(|s| s.to_string()),
            });
        }
    }

    let issues = raw
        .pointer("/counts/issues")
        .and_then(|x| x.as_u64())
        .unwrap_or(findings.iter().filter(|f| f.disposition == "issue").count() as u64)
        as u32;
    let recommendations = raw
        .pointer("/counts/recommendations")
        .and_then(|x| x.as_u64())
        .unwrap_or(
            findings
                .iter()
                .filter(|f| f.disposition == "recommendation")
                .count() as u64,
        ) as u32;

    let ok = output.status.success() || !stdout.trim().is_empty();
    let summary = format!(
        "{} issue(s), {} recommendation(s), {} finding(s)",
        issues,
        recommendations,
        findings.len()
    );

    Ok(DoctorReport {
        ok,
        raw,
        findings,
        issues,
        recommendations,
        summary,
        stderr: stderr.chars().take(2000).collect(),
    })
}

// ── Sandbox ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxStatus {
    pub effective_profile: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub config_profile: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env_profile: Option<String>,
    pub config_path: String,
    pub sandbox_toml_path: String,
    pub sandbox_toml_exists: bool,
    #[serde(default)]
    pub custom_profiles: Vec<String>,
    #[serde(default)]
    pub builtin_profiles: Vec<String>,
    pub client_fs_sandbox: bool,
    #[serde(default)]
    pub notes: Vec<String>,
}

const BUILTIN_PROFILES: &[&str] = &["off", "workspace", "devbox", "read-only", "strict"];

pub fn load_sandbox_status() -> SandboxStatus {
    let config_path = config_toml_path();
    let sandbox_toml = grok_home().join("sandbox.toml");
    let notes = vec![
        "Agent process sandbox applies at session start (CLI/env/config). Changing config requires a new session."
            .to_string(),
        "GUI client fs/* handlers always stay project-sandboxed (independent of agent profile)."
            .to_string(),
    ];

    let config_profile = read_sandbox_profile_from_config();
    let env_profile = std::env::var("GROK_SANDBOX")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let effective = env_profile
        .clone()
        .or_else(|| config_profile.clone())
        .unwrap_or_else(|| "off".into());

    let custom_profiles = list_custom_sandbox_profiles(&sandbox_toml);

    SandboxStatus {
        effective_profile: effective,
        config_profile,
        env_profile,
        config_path: config_path.display().to_string(),
        sandbox_toml_path: sandbox_toml.display().to_string(),
        sandbox_toml_exists: sandbox_toml.is_file(),
        custom_profiles,
        builtin_profiles: BUILTIN_PROFILES.iter().map(|s| (*s).to_string()).collect(),
        client_fs_sandbox: true,
        notes,
    }
}

fn read_sandbox_profile_from_config() -> Option<String> {
    let path = config_toml_path();
    let raw = fs::read_to_string(path).ok()?;
    let doc = raw.parse::<TomlValue>().ok()?;
    doc.get("sandbox")
        .and_then(|s| s.get("profile"))
        .and_then(|p| p.as_str())
        .map(|s| s.to_string())
}

fn list_custom_sandbox_profiles(path: &Path) -> Vec<String> {
    let Ok(raw) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let Ok(doc) = raw.parse::<TomlValue>() else {
        return Vec::new();
    };
    let mut names = Vec::new();
    if let Some(profiles) = doc.get("profiles").and_then(|p| p.as_table()) {
        for k in profiles.keys() {
            if !BUILTIN_PROFILES.contains(&k.as_str()) {
                names.push(k.clone());
            }
        }
    }
    names.sort();
    names
}

pub fn set_sandbox_profile(profile: &str) -> AppResult<SandboxStatus> {
    let profile = profile.trim();
    if profile.is_empty() {
        return Err(AppError::Message("profile is empty".into()));
    }
    if !profile
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(AppError::Message(
            "invalid profile name (use letters, digits, -, _)".into(),
        ));
    }

    let path = config_toml_path();
    let mut doc = if path.is_file() {
        let raw = fs::read_to_string(&path)
            .map_err(|e| AppError::Message(format!("read config: {e}")))?;
        raw.parse::<DocumentMut>()
            .map_err(|e| AppError::Message(format!("parse config: {e}")))?
    } else {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| AppError::Message(format!("create home: {e}")))?;
        }
        DocumentMut::new()
    };

    {
        let table = doc["sandbox"]
            .or_insert(Item::Table(Table::new()))
            .as_table_mut()
            .ok_or_else(|| AppError::Message("sandbox is not a table".into()))?;
        table["profile"] = value(profile);
    }

    fs::write(&path, doc.to_string())
        .map_err(|e| AppError::Message(format!("write config: {e}")))?;
    Ok(load_sandbox_status())
}

// ── Telemetry / features (privacy panel) ───────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivacyConfig {
    pub telemetry_enabled: Option<bool>,
    pub trace_upload: Option<bool>,
    pub config_path: String,
}

pub fn load_privacy_config() -> PrivacyConfig {
    let path = config_toml_path();
    let mut out = PrivacyConfig {
        telemetry_enabled: None,
        trace_upload: None,
        config_path: path.display().to_string(),
    };
    let Ok(raw) = fs::read_to_string(&path) else {
        return out;
    };
    let Ok(doc) = raw.parse::<TomlValue>() else {
        return out;
    };
    out.telemetry_enabled = doc
        .get("features")
        .and_then(|f| f.get("telemetry"))
        .and_then(|v| v.as_bool());
    out.trace_upload = doc
        .get("telemetry")
        .and_then(|t| t.get("trace_upload"))
        .and_then(|v| v.as_bool());
    out
}

pub fn set_telemetry_enabled(enabled: bool) -> AppResult<PrivacyConfig> {
    let path = config_toml_path();
    let mut doc = if path.is_file() {
        let raw = fs::read_to_string(&path)
            .map_err(|e| AppError::Message(format!("read config: {e}")))?;
        raw.parse::<DocumentMut>()
            .map_err(|e| AppError::Message(format!("parse config: {e}")))?
    } else {
        DocumentMut::new()
    };
    {
        let features = doc["features"]
            .or_insert(Item::Table(Table::new()))
            .as_table_mut()
            .ok_or_else(|| AppError::Message("features is not a table".into()))?;
        features["telemetry"] = value(enabled);
    }
    fs::write(&path, doc.to_string())
        .map_err(|e| AppError::Message(format!("write config: {e}")))?;
    Ok(load_privacy_config())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_urls_https() {
        let u = extract_urls("Open https://auth.x.ai/device then continue");
        assert_eq!(u.len(), 1);
        assert!(u[0].contains("auth.x.ai"));
    }

    #[test]
    fn builtins_include_workspace() {
        assert!(BUILTIN_PROFILES.contains(&"workspace"));
    }
}
