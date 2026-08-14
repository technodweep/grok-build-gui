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

/** Privacy-safe account meta from ~/.grok/auth.json (no tokens). */
export interface AuthAccountInfo {
  present: boolean;
  email?: string | null;
  authMode?: string | null;
  firstName?: string | null;
  userId?: string | null;
  teamId?: string | null;
  principalType?: string | null;
  expiresAt?: string | null;
  createTime?: string | null;
  oidcIssuer?: string | null;
  codingDataRetentionOptOut?: boolean | null;
  zeroDataRetention?: boolean | null;
  privacyNote?: string | null;
  apiKeyEnv: boolean;
  authPath: string;
}

export interface CliActionResult {
  ok: boolean;
  exitCode?: number | null;
  stdout: string;
  stderr: string;
  urls: string[];
  deviceCode?: string | null;
  summary: string;
}

export interface DoctorFinding {
  id: string;
  disposition: string;
  message: string;
  note?: string | null;
  remediation?: string | null;
}

export interface DoctorReport {
  ok: boolean;
  raw: unknown;
  findings: DoctorFinding[];
  issues: number;
  recommendations: number;
  summary: string;
  stderr: string;
}

export interface SandboxStatus {
  effectiveProfile: string;
  configProfile?: string | null;
  envProfile?: string | null;
  configPath: string;
  sandboxTomlPath: string;
  sandboxTomlExists: boolean;
  customProfiles: string[];
  builtinProfiles: string[];
  clientFsSandbox: boolean;
  notes: string[];
}

export interface PrivacyConfig {
  telemetryEnabled?: boolean | null;
  traceUpload?: boolean | null;
  configPath: string;
}

/** Permission policy for tool prompts (excludes plan mode). */
export type PermissionPolicy = "ask" | "auto" | "always";

export interface ProjectRuleFile {
  path: string;
  relPath: string;
  scope: string;
  name: string;
  sizeBytes: number;
  writable: boolean;
}

export interface ProjectRulesCatalog {
  projectCwd?: string | null;
  files: ProjectRuleFile[];
  notes: string[];
  suggestedAgentsPath?: string | null;
  homeRulesDir: string;
}

export interface ProjectRuleContent {
  path: string;
  content: string;
  truncated: boolean;
}

export interface CustomModelDef {
  id: string;
  model?: string | null;
  name?: string | null;
  description?: string | null;
  baseUrl?: string | null;
  apiBackend?: string | null;
  hasApiKey: boolean;
  envKey?: string | null;
  temperature?: number | null;
  topP?: number | null;
  maxCompletionTokens?: number | null;
  contextWindow?: number | null;
}

export interface CustomModelsCatalog {
  configPath: string;
  defaultModel?: string | null;
  models: CustomModelDef[];
  notes: string[];
}

export interface SaveCustomModelArgs {
  id: string;
  model?: string | null;
  name?: string | null;
  description?: string | null;
  baseUrl?: string | null;
  apiBackend?: string | null;
  apiKey?: string | null;
  clearApiKey?: boolean;
  envKey?: string | null;
  temperature?: number | null;
  topP?: number | null;
  maxCompletionTokens?: number | null;
  contextWindow?: number | null;
}

export interface McpToolInfo {
  name: string;
  description?: string | null;
}

export interface McpDoctorServer {
  name: string;
  status?: string | null;
  error?: string | null;
  tools: McpToolInfo[];
  toolCount: number;
}

export interface McpDoctorReport {
  ok: boolean;
  raw: unknown;
  servers: McpDoctorServer[];
  summary: string;
  stderr: string;
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
  /** Original event time (epoch ms) from disk when present — never invented. */
  ts?: number | null;
}

/** Paginated session history from disk (`updates.jsonl`). */
export interface HistoryPage {
  items: HistoryItem[];
  total: number;
  hasMore: boolean;
  /** Pass as next `before` to load older messages. */
  loadedFromEnd: number;
  /** Absolute index of items[0] in the full history (0 = oldest). */
  startIndex: number;
}

/** Tracks how much disk history is loaded into the scrollback. */
export interface HistoryPager {
  sessionId: string;
  total: number;
  loadedFromEnd: number;
  hasMore: boolean;
  loading: boolean;
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
  /** Show agent replies as raw markdown source. */
  rawMarkdown?: boolean;
  /** Persisted composer prompt history (newest last). */
  promptHistory?: string[];
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

/** Full-screen boot progress while opening / resuming a session. */
export type SessionBootState = {
  kind: "resume" | "new" | "reconnect" | "switch";
  title: string;
  detail: string;
  /** Optional secondary line (session id, path). */
  meta?: string;
};

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
      /** Linked ACP terminal when the tool spawned/owns a terminal. */
      terminalId?: string;
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

/** Grok `_x.ai/exit_plan_mode` (plan approval card). */
export interface PlanApprovalRequest {
  requestId: unknown;
  sessionId?: string | null;
  toolCallId?: string | null;
  /** Plan markdown embedded in the request (preferred). */
  planContent?: string | null;
  raw?: unknown;
}

/** Grok `_x.ai/ask_user_question` (TUI question card). */
export interface UserQuestionOption {
  label: string;
  description?: string | null;
  preview?: string | null;
}

export interface UserQuestionItem {
  question: string;
  options: UserQuestionOption[];
  /** When true, user may select multiple labels (joined with ", "). */
  multiSelect?: boolean | null;
  header?: string | null;
}

export interface UserQuestionRequest {
  requestId: unknown;
  sessionId?: string | null;
  toolCallId?: string | null;
  questions: UserQuestionItem[];
  mode?: string | null;
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

/** Cross-session memory file under ~/.grok/memory (Phase G). */
export interface MemoryFileEntry {
  path: string;
  relPath: string;
  scope: string;
  workspace?: string | null;
  name: string;
  sizeBytes?: number | null;
  modifiedMs?: number | null;
  deletable: boolean;
}

export interface MemoryCatalog {
  memoryRoot: string;
  configEnabled: boolean;
  envEnabled?: boolean | null;
  files: MemoryFileEntry[];
  notes: string[];
}

export interface MemoryFileContent {
  path: string;
  content: string;
  truncated: boolean;
}

export interface LocalMediaData {
  path: string;
  mime: string;
  dataUrl: string;
  sizeBytes: number;
  kind: string;
}

/** Media item tracked for the imagine gallery (from chat paths or disk scan). */
export interface MediaGalleryItem {
  path: string;
  kind: "image" | "video" | "other";
  source: "chat" | "disk" | "prompt";
  label?: string;
  addedAt: number;
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
