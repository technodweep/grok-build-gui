export type AgentStatus = "disconnected" | "connecting" | "ready" | "error";

export interface EnvironmentInfo {
  grokHome: string;
  binaryPath: string | null;
  binaryVersion: string | null;
  found: boolean;
  authPresent: boolean;
  authEmail?: string | null;
  authMode?: string | null;
}

/** ACP `session/list` entry (may lack disk path). */
export interface AgentSessionInfo {
  sessionId: string;
  cwd: string;
  title?: string | null;
  updatedAt?: string | null;
  fromAgent?: boolean;
}

/** Live usage from `turn_completed` session updates. */
export interface TurnUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedReadTokens?: number;
  reasoningTokens?: number;
  modelCalls?: number;
  apiDurationMs?: number;
}

export interface ToolContentBlock {
  type?: string;
  path?: string;
  oldText?: string;
  newText?: string;
  text?: string;
  content?: string;
  [key: string]: unknown;
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
  /**
   * When true: Enter inserts newline, Ctrl/Cmd+Enter sends.
   * When false (default): Enter sends, Shift+Enter newline.
   */
  multilineMode?: boolean;
  /** Tighter chat density. */
  compactMode?: boolean;
  /** Show timestamps on scroll items. */
  showTimestamps?: boolean;
}

export interface McpServerInfo {
  name: string;
  command?: string | null;
  url?: string | null;
  enabled: boolean;
  transport: string;
}

export interface SkillInfo {
  name: string;
  path: string;
  source: string;
  description?: string | null;
  disabled: boolean;
}

export interface GrokConfigOverview {
  configPath: string;
  configExists: boolean;
  defaultModel?: string | null;
  permissionMode?: string | null;
  autoCompactPercent?: number | null;
  mcpServers: McpServerInfo[];
  skills: SkillInfo[];
  skillPaths: string[];
  skillDisabled: string[];
  marketplaceSources: string[];
  parseError?: string | null;
}

export interface HookInfo {
  name: string;
  path: string;
  scope: string;
  events: string[];
  trusted: boolean;
  enabled: boolean;
}

export interface PluginInfo {
  name: string;
  description?: string | null;
  version?: string | null;
  installed: boolean;
  enabled: boolean;
  source?: string | null;
  category?: string | null;
  trusted: boolean;
}

export interface MarketplacePlugin {
  name: string;
  description?: string | null;
  category?: string | null;
  homepage?: string | null;
  marketplace?: string | null;
  installed: boolean;
}

export interface TrustedFolder {
  path: string;
  trusted: boolean;
}

export interface ExtensionsHub {
  overview: GrokConfigOverview;
  hooks: HookInfo[];
  plugins: PluginInfo[];
  marketplacePlugins: MarketplacePlugin[];
  trustedFolders: TrustedFolder[];
  projectCwd?: string | null;
  projectTrusted: boolean;
  notes: string[];
}

export interface SubagentInfo {
  id: string;
  parentSessionId: string;
  name?: string | null;
  agentType?: string | null;
  status?: string | null;
  title?: string | null;
  childSessionId?: string | null;
  /** Isolation mode: none | worktree | … */
  isolation?: string | null;
  worktreePath?: string | null;
  persona?: string | null;
  modelId?: string | null;
  /** true when observed from live tool stream rather than disk */
  live?: boolean;
}

export interface AgentDef {
  name: string;
  path: string;
  source: string;
  description?: string | null;
  model?: string | null;
  permissionMode?: string | null;
  promptMode?: string | null;
  body?: string | null;
  readonly: boolean;
}

export interface PersonaDef {
  name: string;
  path: string;
  source: string;
  description?: string | null;
  instructions?: string | null;
  model?: string | null;
  reasoningEffort?: string | null;
  defaultIsolation?: string | null;
  body?: string | null;
  readonly: boolean;
}

export interface AgentsCatalog {
  agents: AgentDef[];
  personas: PersonaDef[];
  userAgentsDir: string;
  userPersonasDir: string;
  notes: string[];
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

/** Unix ms when the item was first created (optional; may be missing on hydrate). */
export type ScrollItem =
  | { id: string; kind: "user"; text: string; ts?: number }
  | { id: string; kind: "agent"; text: string; ts?: number }
  | { id: string; kind: "thought"; text: string; ts?: number }
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
      /** Structured ACP tool content (diffs, text blocks). */
      contentBlocks?: ToolContentBlock[];
      ts?: number;
    }
  | {
      id: string;
      kind: "plan";
      entries: PlanEntry[];
      ts?: number;
    }
  | { id: string; kind: "system"; text: string; level?: "info" | "error"; ts?: number };

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

/** Session interaction mode cycle (status bar Shift+Tab parity). */
export type SessionMode = "ask" | "auto" | "plan" | "yolo";

/** Disk `plan_mode.json` snapshot. */
export interface PlanModeState {
  state: string;
  wasPreviouslyActive?: boolean;
  awaitingPlanApproval?: boolean;
}

/** ACP `elicitation/create` request (form or url mode). */
export interface ElicitationRequest {
  requestId: unknown;
  sessionId?: string | null;
  mode?: string | null;
  message?: string | null;
  requestedSchema?: ElicitationSchema | null;
  url?: string | null;
  elicitationId?: string | null;
  raw?: unknown;
}

export interface ElicitationSchema {
  type?: string;
  properties?: Record<string, ElicitationProperty>;
  required?: string[];
  [key: string]: unknown;
}

export interface ElicitationProperty {
  type?: string;
  title?: string;
  description?: string;
  enum?: Array<string | number | boolean>;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  format?: string;
  items?: { type?: string; enum?: Array<string | number | boolean> };
  [key: string]: unknown;
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

/** Local automation job tracked by the GUI (agent-backed via slash). */
export type AutomationKind = "loop" | "goal" | "workflow" | "research" | "task";

export type AutomationStatus =
  | "active"
  | "paused"
  | "done"
  | "failed"
  | "cancelled"
  | "unknown";

export interface AutomationJob {
  id: string;
  kind: AutomationKind;
  title: string;
  status: AutomationStatus;
  createdAt: number;
  updatedAt: number;
  /** Extra detail (interval, objective, workflow name, …). */
  detail?: string;
  /** Linked ACP terminal when kind is task. */
  terminalId?: string;
  /** Last agent-facing command we issued. */
  lastCommand?: string;
  /** Free-form note / result snippet. */
  note?: string;
}

/** ACP session/update envelope (subset we render). */
export interface SessionUpdateParams {
  sessionId?: string;
  update?: {
    sessionUpdate?: string;
    content?:
      | { type?: string; text?: string }
      | string
      | ToolContentBlock[];
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
    usage?: TurnUsage;
    stopReason?: string;
    stop_reason?: string;
    [key: string]: unknown;
  };
}
