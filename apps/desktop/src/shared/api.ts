import { invoke } from "@tauri-apps/api/core";
import type {
  AgentSessionInfo,
  AgentStatus,
  DiskSession,
  EnvironmentInfo,
  GrokConfigOverview,
  GuiSettings,
  HistoryItem,
  LiveSession,
  SessionModelsState,
  SessionSignals,
  SessionState,
  SubagentInfo,
  TerminalSnapshot,
} from "./types";

export function getEnvironment(binaryOverride?: string | null) {
  return invoke<EnvironmentInfo>("get_environment", {
    binaryOverride: binaryOverride ?? null,
  });
}

export function getAgentStatus() {
  return invoke<AgentStatus>("get_agent_status");
}

export function getSession() {
  return invoke<SessionState | null>("get_session");
}

export function connectAgent(args: {
  cwd: string;
  binaryOverride?: string | null;
  alwaysApprove?: boolean;
  resumeSessionId?: string | null;
}) {
  return invoke<SessionState>("connect_agent", {
    args: {
      cwd: args.cwd,
      binaryOverride: args.binaryOverride ?? null,
      alwaysApprove: args.alwaysApprove ?? false,
      resumeSessionId: args.resumeSessionId ?? null,
    },
  });
}

export function disconnectAgent() {
  return invoke<void>("disconnect_agent");
}

export function newSession() {
  return invoke<SessionState>("new_session");
}

export function sendPrompt(text: string, attachments: string[] = []) {
  return invoke<void>("send_prompt", {
    args: { text, attachments },
  });
}

export function fuzzyProjectFiles(cwd: string, query: string, limit = 40) {
  return invoke<import("./types").FileEntry[]>("fuzzy_project_files", {
    args: { cwd, query, limit },
  });
}

export function cancelTurn() {
  return invoke<void>("cancel_turn");
}

export function respondPermission(decision: {
  requestId: unknown;
  optionId: string;
}) {
  return invoke<void>("respond_permission", {
    decision: {
      requestId: decision.requestId,
      optionId: decision.optionId,
    },
  });
}

export function listDiskSessions(cwd?: string | null) {
  return invoke<DiskSession[]>("list_disk_sessions", {
    args: { cwd: cwd ?? null },
  });
}

export function listAgentSessions(cwd?: string | null, binaryOverride?: string | null) {
  return invoke<AgentSessionInfo[]>("list_agent_sessions", {
    args: {
      cwd: cwd ?? null,
      binaryOverride: binaryOverride ?? null,
    },
  });
}

export function authenticateAgent(binaryOverride?: string | null) {
  return invoke<Record<string, unknown>>("authenticate_agent", {
    binaryOverride: binaryOverride ?? null,
  });
}

export function getAuthAccount() {
  return invoke<import("./types").AuthAccountInfo>("get_auth_account");
}

export function grokLogin(
  mode: "oauth" | "device" = "oauth",
  binaryOverride?: string | null,
) {
  return invoke<import("./types").CliActionResult>("grok_login_cmd", {
    args: { mode, binaryOverride: binaryOverride ?? null },
  });
}

export function grokLogout(binaryOverride?: string | null) {
  return invoke<import("./types").CliActionResult>("grok_logout_cmd", {
    args: { binaryOverride: binaryOverride ?? null },
  });
}

export function grokDoctor(binaryOverride?: string | null) {
  return invoke<import("./types").DoctorReport>("grok_doctor_cmd", {
    args: { binaryOverride: binaryOverride ?? null },
  });
}

export function getSandboxStatus() {
  return invoke<import("./types").SandboxStatus>("get_sandbox_status");
}

export function setSandboxProfile(profile: string) {
  return invoke<import("./types").SandboxStatus>("set_sandbox_profile_cmd", {
    args: { profile },
  });
}

export function getPrivacyConfig() {
  return invoke<import("./types").PrivacyConfig>("get_privacy_config");
}

export function setTelemetryEnabled(enabled: boolean) {
  return invoke<import("./types").PrivacyConfig>("set_telemetry_enabled_cmd", {
    args: { enabled },
  });
}

export function deleteDiskSession(sessionId: string) {
  return invoke<void>("delete_disk_session", {
    args: { sessionId },
  });
}

export function renameDiskSession(sessionId: string, title: string) {
  return invoke<void>("rename_disk_session", {
    args: { sessionId, title },
  });
}

export function getSessionHistory(sessionId: string, limit = 200) {
  return invoke<HistoryItem[]>("get_session_history", {
    args: { sessionId, limit },
  });
}

export function getSessionSignals(sessionId: string) {
  return invoke<SessionSignals>("get_session_signals", {
    args: { sessionId },
  });
}

export function listSessionSubagents(sessionId: string) {
  return invoke<SubagentInfo[]>("list_session_subagents", {
    args: { sessionId },
  });
}

export function getAgentsCatalog(projectCwd?: string | null, includeBodies = false) {
  return invoke<import("./types").AgentsCatalog>("get_agents_catalog", {
    args: { projectCwd: projectCwd ?? null, includeBodies },
  });
}

export function saveAgentDef(name: string, body: string) {
  return invoke<import("./types").AgentDef>("save_agent_def", {
    args: { name, body },
  });
}

export function deleteAgentDef(name: string) {
  return invoke<void>("delete_agent_def", {
    args: { name },
  });
}

export function savePersonaDef(name: string, body: string) {
  return invoke<import("./types").PersonaDef>("save_persona_def", {
    args: { name, body },
  });
}

export function deletePersonaDef(name: string) {
  return invoke<void>("delete_persona_def", {
    args: { name },
  });
}

export function getGuiSettings() {
  return invoke<GuiSettings>("get_gui_settings");
}

export function setGuiSettings(settings: GuiSettings) {
  return invoke<void>("set_gui_settings", { settings });
}

export function getGrokConfigOverview(projectCwd?: string | null) {
  return invoke<GrokConfigOverview>("get_grok_config_overview", {
    args: { projectCwd: projectCwd ?? null },
  });
}

export function getGrokConfigPath() {
  return invoke<string>("get_grok_config_path");
}

export function getExtensionsHub(projectCwd?: string | null) {
  return invoke<import("./types").ExtensionsHub>("get_extensions_hub", {
    args: { projectCwd: projectCwd ?? null },
  });
}

export function setMcpServerEnabled(name: string, enabled: boolean) {
  return invoke<import("./types").McpServerInfo>("set_mcp_server_enabled", {
    args: { name, enabled },
  });
}

export function addMcpServer(args: {
  name: string;
  command?: string | null;
  args?: string[] | null;
  url?: string | null;
  enabled?: boolean;
}) {
  return invoke<import("./types").McpServerInfo>("add_mcp_server_cmd", {
    args: {
      name: args.name,
      command: args.command ?? null,
      args: args.args ?? null,
      url: args.url ?? null,
      enabled: args.enabled ?? true,
    },
  });
}

export function removeMcpServer(name: string) {
  return invoke<void>("remove_mcp_server_cmd", {
    args: { name },
  });
}

export function setSkillDisabled(name: string, disabled: boolean) {
  return invoke<string[]>("set_skill_disabled_state", {
    args: { name, disabled },
  });
}

export function setHookEnabled(path: string, enabled: boolean) {
  return invoke<import("./types").HookInfo>("set_hook_enabled_cmd", {
    args: { path, enabled },
  });
}

export function setProjectTrust(path: string, trusted: boolean) {
  return invoke<import("./types").TrustedFolder[]>("set_project_trust_cmd", {
    args: { path, trusted },
  });
}

export function pluginInstall(source: string, trust = true) {
  return invoke<string>("plugin_install_cmd", {
    args: { source, trust },
  });
}

export function pluginUninstall(name: string) {
  return invoke<string>("plugin_uninstall_cmd", {
    args: { name },
  });
}

export function pluginSetEnabled(name: string, enabled: boolean) {
  return invoke<string>("plugin_set_enabled_cmd", {
    args: { name, enabled },
  });
}

export function getMemoryCatalog() {
  return invoke<import("./types").MemoryCatalog>("get_memory_catalog");
}

export function getMemoryFile(path: string, maxChars?: number) {
  return invoke<import("./types").MemoryFileContent>("get_memory_file", {
    args: { path, maxChars: maxChars ?? null },
  });
}

export function deleteMemoryFile(path: string) {
  return invoke<void>("delete_memory_file_cmd", {
    args: { path },
  });
}

export function setMemoryEnabled(enabled: boolean) {
  return invoke<boolean>("set_memory_enabled_cmd", {
    args: { enabled },
  });
}

export function getLocalMedia(
  path: string,
  projectCwd?: string | null,
  maxBytes?: number,
) {
  return invoke<import("./types").LocalMediaData>("get_local_media", {
    args: {
      path,
      projectCwd: projectCwd ?? null,
      maxBytes: maxBytes ?? null,
    },
  });
}

export function listRecentMedia(projectCwd?: string | null, limit = 24) {
  return invoke<import("./types").MemoryFileEntry[]>("list_recent_media_cmd", {
    args: { projectCwd: projectCwd ?? null, limit },
  });
}

export function listLiveSessions() {
  return invoke<LiveSession[]>("list_live_sessions");
}

export function listTerminals() {
  return invoke<TerminalSnapshot[]>("list_terminals");
}

export function killTerminal(terminalId: string) {
  return invoke<void>("kill_terminal", {
    args: { terminalId },
  });
}

export function releaseTerminal(terminalId: string) {
  return invoke<void>("release_terminal", {
    args: { terminalId },
  });
}

export function getSessionModels() {
  return invoke<SessionModelsState>("get_session_models");
}

export function setSessionModel(modelId: string) {
  return invoke<SessionModelsState>("set_session_model", {
    args: { modelId },
  });
}

export function setSessionEffort(effort: string) {
  return invoke<SessionModelsState>("set_session_effort", {
    args: { effort },
  });
}

/** ACP `session/set_mode` — effort levels or permission/plan mode ids when supported. */
export function setSessionMode(modeId: string) {
  return invoke<SessionModelsState>("set_session_mode", {
    args: { modeId },
  });
}

export function getSessionPlan(sessionId: string) {
  return invoke<string | null>("get_session_plan", {
    args: { sessionId },
  });
}

export function saveSessionPlan(sessionId: string, content: string) {
  return invoke<void>("save_session_plan", {
    args: { sessionId, content },
  });
}

export function getPlanModeState(sessionId: string) {
  return invoke<import("./types").PlanModeState | null>("get_plan_mode_state", {
    args: { sessionId },
  });
}

/** Resolve ACP `elicitation/create` with action accept|decline|cancel (+ content). */
export function respondElicitation(decision: {
  requestId: unknown;
  outcome: Record<string, unknown>;
}) {
  return invoke<void>("respond_elicitation", {
    decision: {
      requestId: decision.requestId,
      outcome: decision.outcome,
    },
  });
}

export function dispatchSession(args: {
  cwd?: string | null;
  prompt?: string | null;
  title?: string | null;
}) {
  return invoke<SessionState>("dispatch_session", {
    args: {
      cwd: args.cwd ?? null,
      prompt: args.prompt ?? null,
      title: args.title ?? null,
    },
  });
}

export function switchSession(sessionId: string) {
  return invoke<SessionState>("switch_session", {
    args: { sessionId },
  });
}

export function pinLiveSession(sessionId: string, pinned: boolean) {
  return invoke<void>("pin_live_session", {
    args: { sessionId, pinned },
  });
}

export function renameLiveSession(sessionId: string, title: string) {
  return invoke<void>("rename_live_session", {
    args: { sessionId, title },
  });
}

export function cancelLiveSession(sessionId: string) {
  return invoke<void>("cancel_live_session", {
    args: { sessionId },
  });
}

export function closeLiveSession(sessionId: string, deleteDisk = false) {
  return invoke<SessionState | null>("close_live_session", {
    args: { sessionId, deleteDisk },
  });
}
