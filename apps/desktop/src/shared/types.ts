export type AgentStatus = "disconnected" | "connecting" | "ready" | "error";

export interface EnvironmentInfo {
  grokHome: string;
  binaryPath: string | null;
  binaryVersion: string | null;
  found: boolean;
  authPresent: boolean;
}

export interface SessionState {
  sessionId: string;
  cwd: string;
  modelId?: string | null;
  effort?: string | null;
}

export interface ReasoningEffortOption {
  id: string;
  label: string;
  description?: string | null;
  default?: boolean;
}

export interface AvailableModel {
  modelId: string;
  name: string;
  description?: string | null;
  supportsReasoningEffort: boolean;
  reasoningEffort?: string | null;
  reasoningEfforts: ReasoningEffortOption[];
}

export interface SessionModelsState {
  currentModelId?: string | null;
  currentEffort?: string | null;
  availableModels: AvailableModel[];
}

export type LiveSessionState = "idle" | "working" | "needsInput" | "failed";

export interface LiveSession {
  sessionId: string;
  cwd: string;
  title: string;
  pinned: boolean;
  state: LiveSessionState;
  activity: string;
  updatedAt: string;
  modelId?: string | null;
}

export type AppView = "welcome" | "chat" | "dashboard";

export interface DiskSession {
  id: string;
  title: string;
  cwd: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  modelId?: string | null;
  numMessages?: number | null;
  path: string;
}

export interface HistoryItem {
  kind: string;
  text: string;
  title?: string | null;
  status?: string | null;
  toolCallId?: string | null;
  toolKind?: string | null;
}

export interface GuiSettings {
  lastProjectCwd?: string | null;
  alwaysApprove?: boolean;
  binaryOverride?: string | null;
  theme?: string;
  fontSize?: number;
}

export interface SubagentInfo {
  id: string;
  parentSessionId: string;
  name?: string | null;
  agentType?: string | null;
  status?: string | null;
  title?: string | null;
  childSessionId?: string | null;
  /** true when observed from live tool stream rather than disk */
  live?: boolean;
}

/** From session signals.json — context window + session stats. */
export interface SessionSignals {
  sessionId: string;
  contextTokensUsed: number;
  contextWindowTokens: number;
  contextWindowUsage: number;
  turnCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  toolCallCount: number;
  errorCount: number;
  compactionCount: number;
  primaryModelId?: string | null;
  modelsUsed: string[];
  toolsUsed: string[];
  sessionDurationSeconds: number;
  avgTimeToFirstTokenMs: number;
  avgResponseTimeMs: number;
  agentLinesAdded: number;
  agentLinesRemoved: number;
  agentFilesTouched: number;
  humanFilesTouched: number;
  totalFilesTouched: number;
  freeTokens: number;
  usagePercent: number;
}

export interface PlanEntry {
  content: string;
  status: string;
  priority?: string;
}

export type ScrollItem =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "agent"; text: string }
  | { id: string; kind: "thought"; text: string }
  | {
      id: string;
      kind: "tool";
      toolCallId: string;
      title: string;
      status: string;
      toolKind?: string;
      input?: string;
      output?: string;
      locations?: string[];
    }
  | {
      id: string;
      kind: "plan";
      entries: PlanEntry[];
    }
  | { id: string; kind: "system"; text: string; level?: "info" | "error" };

export interface PermissionOption {
  optionId: string;
  name: string;
  kind?: string | null;
}

export interface PermissionRequest {
  requestId: unknown;
  sessionId?: string | null;
  toolCall?: {
    toolCallId?: string;
    title?: string;
    kind?: string;
    status?: string;
    rawInput?: unknown;
    locations?: Array<{ path?: string } | string>;
    [key: string]: unknown;
  } | null;
  options: PermissionOption[];
  raw?: unknown;
}

/** Agent-advertised slash command. */
export interface SlashCommand {
  name: string;
  description?: string;
  inputHint?: string;
  source: "agent" | "client";
}

export interface FileEntry {
  path: string;
  isDir: boolean;
}

export interface QueuedPrompt {
  id: string;
  text: string;
  attachments: string[];
}

/** ACP terminal host snapshot (from list_terminals / terminal://update). */
export interface TerminalSnapshot {
  terminalId: string;
  sessionId?: string | null;
  command: string;
  cwd?: string | null;
  output: string;
  truncated: boolean;
  exitCode?: number | null;
  signal?: string | null;
  running: boolean;
}

/** ACP session/update envelope (subset we render). */
export interface SessionUpdateParams {
  sessionId?: string;
  update?: {
    sessionUpdate?: string;
    content?: { type?: string; text?: string } | string;
    title?: string;
    status?: string;
    toolCallId?: string;
    kind?: string;
    rawInput?: unknown;
    rawOutput?: unknown;
    locations?: Array<{ path?: string } | string>;
    entries?: PlanEntry[];
    availableCommands?: Array<{
      name?: string;
      description?: string;
      input?: { hint?: string };
    }>;
    [key: string]: unknown;
  };
}
