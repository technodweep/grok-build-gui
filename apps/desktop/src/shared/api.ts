import { invoke } from "@tauri-apps/api/core";
import type {
  AgentStatus,
  DiskSession,
  EnvironmentInfo,
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

export function getGuiSettings() {
  return invoke<GuiSettings>("get_gui_settings");
}

export function setGuiSettings(settings: GuiSettings) {
  return invoke<void>("set_gui_settings", { settings });
}

export function listLiveSessions() {
  return invoke<LiveSession[]>("list_live_sessions");
}

export function listTerminals() {
  return invoke<TerminalSnapshot[]>("list_terminals");
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
