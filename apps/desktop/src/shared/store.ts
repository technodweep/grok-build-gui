import { create } from "zustand";
import type {
  AgentStatus,
  AppView,
  AutomationJob,
  AutomationKind,
  ElicitationRequest,
  EnvironmentInfo,
  LiveSession,
  MediaGalleryItem,
  PermissionRequest,
  PlanEntry,
  PlanModeState,
  QueuedPrompt,
  ScrollItem,
  SessionMode,
  SessionModelsState,
  SessionSignals,
  SessionState,
  SlashCommand,
  SubagentInfo,
  TerminalSnapshot,
  ToolContentBlock,
  TurnUsage,
} from "./types";

interface AppState {
  env: EnvironmentInfo | null;
  status: AgentStatus;
  session: SessionState | null;
  /** Active scrollback (mirrors sessionScroll[sessionId]). */
  items: ScrollItem[];
  /** Per-session scroll histories for multi-agent dashboard. */
  sessionScroll: Record<string, ScrollItem[]>;
  liveSessions: LiveSession[];
  view: AppView;
  busy: boolean;
  error: string | null;
  draft: string;
  alwaysApprove: boolean;
  projectCwd: string;
  permissions: PermissionRequest[];
  slashCommands: SlashCommand[];
  attachments: string[];
  promptQueue: QueuedPrompt[];
  /** Local prompt history for ↑/↓ recall (newest last). */
  promptHistory: string[];
  /** Last known model id for the active session. */
  modelId: string | null;
  /** Reasoning effort (low/medium/high/…). */
  effort: string | null;
  /** Catalog from session/new + `_x.ai/models/update`. */
  models: SessionModelsState | null;
  /** Last totalTokens seen on a stream update (best-effort). */
  lastTokens: number | null;
  /** Latest turn usage snapshot from `turn_completed`. */
  lastUsage: TurnUsage | null;
  settingsOpen: boolean;
  shortcutsOpen: boolean;
  contextOpen: boolean;
  modelsOpen: boolean;
  extensionsOpen: boolean;
  /** Preferred tab when opening extensions hub. */
  extensionsTab: "mcp" | "skills" | "plugins" | "marketplace" | "hooks" | "trust";
  agentsOpen: boolean;
  agentsTab: "agents" | "personas" | "live";
  automationOpen: boolean;
  automationTab: "tasks" | "loops" | "goals" | "workflows" | "research";
  /** GUI-tracked automation jobs (loops/goals/workflows launched from UI). */
  automationJobs: AutomationJob[];
  memoryOpen: boolean;
  memoryTab: "remember" | "browse" | "actions" | "imagine";
  /** Paths collected from chat / disk for the media gallery. */
  mediaGallery: MediaGalleryItem[];
  accountOpen: boolean;
  accountTab: "account" | "privacy" | "sandbox" | "doctor" | "safety";
  helpOpen: boolean;
  projectConfigOpen: boolean;
  projectConfigTab: "rules" | "models";
  signals: SessionSignals | null;
  /** Subagents for the active (or last loaded) parent session. */
  subagents: SubagentInfo[];
  /** When true, ignore session/update history-like chunks (resume grace). */
  suppressHistoryUpdates: boolean;
  /** Live ACP terminal snapshots. */
  terminals: TerminalSnapshot[];
  terminalsOpen: boolean;
  selectedTerminalId: string | null;
  /** Enter inserts newline; Ctrl+Enter sends. */
  multilineMode: boolean;
  findOpen: boolean;
  findQuery: string;
  findIndex: number;
  historyOpen: boolean;
  /** Session mode cycle: ask · auto · plan · yolo (status bar). */
  sessionMode: SessionMode;
  /** Plan.md viewer/editor open. */
  planOpen: boolean;
  /** Cached plan.md text (viewer). */
  planMarkdown: string | null;
  /** Disk plan_mode.json snapshot. */
  planModeState: PlanModeState | null;
  /** ACP elicitation/create queue. */
  elicitations: ElicitationRequest[];
  /** Compact chat density. */
  compactMode: boolean;
  /** Show timestamps on scroll items. */
  showTimestamps: boolean;
  /** Show agent messages as raw markdown source. */
  rawMarkdown: boolean;
  /**
   * Fold policy for tool/thought details:
   * default = open while running; all-open / all-closed force.
   */
  foldPolicy: "default" | "all-open" | "all-closed";
  /** Timeline / jump outline open. */
  timelineOpen: boolean;
  /** Scroll target index (set by turn jump / timeline); Scrollback consumes and clears. */
  scrollToIndex: number | null;
  /** Last focused item index for turn navigation (persists after scrollToIndex clears). */
  turnFocusIndex: number | null;

  setEnv: (env: EnvironmentInfo | null) => void;
  setStatus: (status: AgentStatus) => void;
  setSession: (session: SessionState | null) => void;
  setView: (view: AppView) => void;
  setLiveSessions: (sessions: LiveSession[]) => void;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  setDraft: (draft: string) => void;
  setAlwaysApprove: (v: boolean) => void;
  setProjectCwd: (cwd: string) => void;
  clearScroll: () => void;
  /** Route updates into a specific session's scroll (defaults to active). */
  pushItem: (item: ScrollItem, sessionId?: string) => void;
  appendAgentText: (text: string, sessionId?: string) => void;
  appendThoughtText: (text: string, sessionId?: string) => void;
  upsertTool: (
    tool: {
      toolCallId: string;
      title: string;
      status: string;
      toolKind?: string;
      input?: string;
      output?: string;
      locations?: string[];
      contentBlocks?: ToolContentBlock[];
      terminalId?: string;
    },
    sessionId?: string,
  ) => void;
  setLastUsage: (u: TurnUsage | null) => void;
  setPlan: (entries: PlanEntry[], sessionId?: string) => void;
  loadScrollForSession: (sessionId: string) => void;
  enqueuePermission: (req: PermissionRequest) => void;
  dequeuePermission: () => void;
  clearPermissions: () => void;
  setSlashCommands: (cmds: SlashCommand[]) => void;
  addAttachment: (path: string) => void;
  removeAttachment: (path: string) => void;
  clearAttachments: () => void;
  enqueuePrompt: (prompt: QueuedPrompt) => void;
  dequeuePrompt: () => QueuedPrompt | undefined;
  clearPromptQueue: () => void;
  pushPromptHistory: (text: string) => void;
  setModelId: (id: string | null) => void;
  setEffort: (effort: string | null) => void;
  setModels: (m: SessionModelsState | null) => void;
  setLastTokens: (n: number | null) => void;
  setSettingsOpen: (v: boolean) => void;
  setShortcutsOpen: (v: boolean) => void;
  setContextOpen: (v: boolean) => void;
  setModelsOpen: (v: boolean) => void;
  setExtensionsOpen: (v: boolean) => void;
  setExtensionsTab: (
    t: "mcp" | "skills" | "plugins" | "marketplace" | "hooks" | "trust",
  ) => void;
  setAgentsOpen: (v: boolean) => void;
  setAgentsTab: (t: "agents" | "personas" | "live") => void;
  setAutomationOpen: (v: boolean) => void;
  setAutomationTab: (
    t: "tasks" | "loops" | "goals" | "workflows" | "research",
  ) => void;
  setMemoryOpen: (v: boolean) => void;
  setMemoryTab: (t: "remember" | "browse" | "actions" | "imagine") => void;
  setAccountOpen: (v: boolean) => void;
  setAccountTab: (
    t: "account" | "privacy" | "sandbox" | "doctor" | "safety",
  ) => void;
  setHelpOpen: (v: boolean) => void;
  setProjectConfigOpen: (v: boolean) => void;
  setProjectConfigTab: (t: "rules" | "models") => void;
  addMediaGalleryItem: (item: Omit<MediaGalleryItem, "addedAt"> & { addedAt?: number }) => void;
  clearMediaGallery: () => void;
  upsertAutomationJob: (job: AutomationJob) => void;
  updateAutomationJob: (
    id: string,
    patch: Partial<Pick<AutomationJob, "status" | "detail" | "note" | "lastCommand" | "title">>,
  ) => void;
  removeAutomationJob: (id: string) => void;
  clearAutomationJobs: (kind?: AutomationKind) => void;
  setSignals: (s: SessionSignals | null) => void;
  setSubagents: (list: SubagentInfo[]) => void;
  upsertSubagent: (info: SubagentInfo) => void;
  setSuppressHistoryUpdates: (v: boolean) => void;
  setTerminals: (list: TerminalSnapshot[]) => void;
  upsertTerminal: (snap: TerminalSnapshot) => void;
  removeTerminal: (terminalId: string) => void;
  clearTerminals: () => void;
  setTerminalsOpen: (v: boolean) => void;
  setSelectedTerminalId: (id: string | null) => void;
  setMultilineMode: (v: boolean) => void;
  setFindOpen: (v: boolean) => void;
  setFindQuery: (q: string) => void;
  setFindIndex: (i: number) => void;
  setHistoryOpen: (v: boolean) => void;
  setSessionMode: (m: SessionMode) => void;
  setPlanOpen: (v: boolean) => void;
  setPlanMarkdown: (md: string | null) => void;
  setPlanModeState: (s: PlanModeState | null) => void;
  enqueueElicitation: (req: ElicitationRequest) => void;
  dequeueElicitation: () => void;
  clearElicitations: () => void;
  setCompactMode: (v: boolean) => void;
  setShowTimestamps: (v: boolean) => void;
  setRawMarkdown: (v: boolean) => void;
  removePromptHistoryAt: (idx: number) => void;
  clearPromptHistory: () => void;
  setPromptHistory: (list: string[]) => void;
  setFoldPolicy: (p: "default" | "all-open" | "all-closed") => void;
  setTimelineOpen: (v: boolean) => void;
  setScrollToIndex: (i: number | null) => void;
  /** Jump to prev/next user turn relative to current scroll focus. */
  jumpUserTurn: (dir: -1 | 1) => number | null;
  /**
   * Drop the last `turns` user turns (and everything after the cut point).
   * Returns number of items removed.
   */
  rewindTurns: (turns?: number) => number;
}

let seq = 0;
const nextId = () => `item-${++seq}-${Date.now()}`;

function formatJson(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2).slice(0, 4000);
  } catch {
    return String(value);
  }
}

const CLIENT_COMMANDS: SlashCommand[] = [
  { name: "new", description: "Start a new session in this project", source: "client" },
  { name: "home", description: "Return to welcome / session list", source: "client" },
  { name: "dashboard", description: "Open the multi-agent dashboard", source: "client" },
  { name: "clear", description: "Clear the scrollback view (local)", source: "client" },
  { name: "cancel", description: "Cancel the current turn", source: "client" },
  {
    name: "export",
    description: "Export conversation (clipboard, or /export file)",
    inputHint: "file?",
    source: "client",
  },
  {
    name: "history",
    description: "Search past prompts (also ↑ on empty input)",
    source: "client",
  },
  {
    name: "compact",
    description: "Compress context (agent /compact)",
    inputHint: "keep note?",
    source: "client",
  },
  {
    name: "rewind",
    description: "Undo last turn(s). Alias: /undo",
    inputHint: "count?",
    source: "client",
  },
  { name: "undo", description: "Alias for /rewind", source: "client" },
  {
    name: "fork",
    description: "Branch session via agent /fork",
    source: "client",
  },
  { name: "find", description: "Search scrollback (Ctrl+F)", source: "client" },
  {
    name: "multiline",
    description: "Toggle Enter=newline mode (alias: /ml)",
    source: "client",
  },
  { name: "ml", description: "Alias for /multiline", source: "client" },
  { name: "settings", description: "Open settings", source: "client" },
  { name: "shortcuts", description: "Keyboard shortcuts cheatsheet", source: "client" },
  { name: "context", description: "Show context window usage", source: "client" },
  { name: "terminal", description: "Toggle agent terminal panel", source: "client" },
  {
    name: "model",
    description: "Switch model (or open picker). Alias: /m",
    inputHint: "model id",
    source: "client",
  },
  { name: "m", description: "Alias for /model", source: "client" },
  {
    name: "effort",
    description: "Set reasoning effort (low|medium|high)",
    inputHint: "level",
    source: "client",
  },
  {
    name: "copy",
    description: "Copy Nth agent reply (default 1 = latest) or write to path",
    inputHint: "n | path",
    source: "client",
  },
  {
    name: "tasks",
    description: "Background tasks & automation hub",
    source: "client",
  },
  {
    name: "loop",
    description: "Create recurring /loop job (interval + prompt)",
    inputHint: "interval prompt",
    source: "client",
  },
  {
    name: "goal",
    description: "Goal: set objective or status|pause|resume|clear",
    inputHint: "objective | status | pause | resume | clear",
    source: "client",
  },
  {
    name: "workflow",
    description: "Launch/control workflow (name + optional JSON args)",
    inputHint: "name|pause|resume|stop …",
    source: "client",
  },
  {
    name: "workflows",
    description: "Open workflows automation tab",
    source: "client",
  },
  {
    name: "deep-research",
    description: "Start deep research workflow",
    inputHint: "query",
    source: "client",
  },
  {
    name: "memory",
    description: "Memory browser (or /memory on|off)",
    inputHint: "on|off?",
    source: "client",
  },
  { name: "mem", description: "Alias for /memory", source: "client" },
  {
    name: "remember",
    description: "Save a note to memory",
    inputHint: "note",
    source: "client",
  },
  {
    name: "flush",
    description: "Flush session knowledge to memory (agent)",
    source: "client",
  },
  {
    name: "dream",
    description: "Consolidate memory topics (agent)",
    source: "client",
  },
  {
    name: "imagine",
    description: "Generate an image (agent /imagine)",
    inputHint: "description",
    source: "client",
  },
  {
    name: "imagine-video",
    description: "Generate a video (agent /imagine-video)",
    inputHint: "description",
    source: "client",
  },
  {
    name: "account",
    description: "Account, privacy, sandbox & doctor",
    source: "client",
  },
  {
    name: "login",
    description: "Sign in (browser OAuth or /login device)",
    inputHint: "device?",
    source: "client",
  },
  {
    name: "logout",
    description: "Sign out and clear credentials",
    source: "client",
  },
  {
    name: "privacy",
    description: "Privacy panel (or agent /privacy)",
    source: "client",
  },
  {
    name: "sandbox",
    description: "Sandbox profile status & config",
    source: "client",
  },
  {
    name: "doctor",
    description: "Run grok doctor diagnostics",
    inputHint: "fix?",
    source: "client",
  },
  {
    name: "docs",
    description: "In-app help & docs (alias: /help, /howto)",
    source: "client",
  },
  { name: "help", description: "Alias for /docs", source: "client" },
  { name: "howto", description: "Alias for /docs", source: "client" },
  { name: "guides", description: "Alias for /docs", source: "client" },
  {
    name: "rules",
    description: "Project rules / AGENTS.md editor",
    source: "client",
  },
  {
    name: "agents-md",
    description: "Alias for /rules",
    source: "client",
  },
  {
    name: "custom-models",
    description: "Custom model endpoints in config.toml",
    source: "client",
  },
  {
    name: "config-models",
    description: "Alias for /custom-models",
    source: "client",
  },
  {
    name: "agents",
    description: "Agents & personas manager (alias: /config-agents)",
    source: "client",
  },
  {
    name: "config-agents",
    description: "Alias for /agents",
    source: "client",
  },
  {
    name: "personas",
    description: "Open personas tab in agents manager",
    source: "client",
  },
  {
    name: "subagents",
    description: "Live subagents for this session",
    source: "client",
  },
  {
    name: "plugins",
    description: "Open extensions hub (MCP, skills, plugins, hooks)",
    source: "client",
  },
  { name: "extensions", description: "Alias for /plugins", source: "client" },
  { name: "mcp", description: "Extensions hub · MCP tab", source: "client" },
  { name: "mcps", description: "Alias for /mcp", source: "client" },
  { name: "skills", description: "Extensions hub · Skills tab", source: "client" },
  { name: "hooks", description: "Extensions hub · Hooks tab", source: "client" },
  {
    name: "marketplace",
    description: "Extensions hub · Marketplace tab",
    source: "client",
  },
  {
    name: "timestamps",
    description: "Toggle message timestamps",
    source: "client",
  },
  {
    name: "compact-mode",
    description: "Toggle compact chat density",
    source: "client",
  },
  {
    name: "raw",
    description: "Toggle raw markdown source for agent messages",
    source: "client",
  },
  {
    name: "raw-markdown",
    description: "Alias for /raw",
    source: "client",
  },
  {
    name: "timeline",
    description: "Open turn outline / jump list",
    source: "client",
  },
  {
    name: "usage",
    description: "Show usage panel (and run agent /usage)",
    source: "client",
  },
  {
    name: "fold",
    description: "Collapse all tools/thinking (alias: /collapse)",
    source: "client",
  },
  {
    name: "collapse",
    description: "Alias for /fold",
    source: "client",
  },
  {
    name: "expand",
    description: "Expand all tools/thinking",
    source: "client",
  },
  {
    name: "plan",
    description: "Enter plan mode (optional description starts the turn)",
    inputHint: "description?",
    source: "client",
  },
  {
    name: "view-plan",
    description: "View / edit session plan.md",
    source: "client",
  },
  { name: "show-plan", description: "Alias for /view-plan", source: "client" },
  { name: "plan-view", description: "Alias for /view-plan", source: "client" },
  {
    name: "auto",
    description: "Toggle auto permission mode (agent)",
    source: "client",
  },
  {
    name: "always-approve",
    description: "Toggle always-approve / yolo (agent)",
    source: "client",
  },
  { name: "yolo", description: "Alias for /always-approve", source: "client" },
  {
    name: "rename",
    description: "Rename the current session",
    inputHint: "title",
    source: "client",
  },
  { name: "title", description: "Alias for /rename", inputHint: "title", source: "client" },
  {
    name: "delete",
    description: "Delete current session from disk and leave chat",
    source: "client",
  },
  {
    name: "session-info",
    description: "Session details and stats (alias: /status, /info)",
    source: "client",
  },
  { name: "status", description: "Alias for /session-info", source: "client" },
  { name: "info", description: "Alias for /session-info", source: "client" },
];

function activeId(get: () => AppState): string | undefined {
  return get().session?.sessionId;
}

function withSessionItems(
  get: () => AppState,
  set: (partial: Partial<AppState>) => void,
  sessionId: string | undefined,
  mut: (items: ScrollItem[]) => ScrollItem[],
) {
  const sid = sessionId ?? activeId(get);
  if (!sid) {
    // Fallback: only active items
    set({ items: mut(get().items) });
    return;
  }
  const map = { ...get().sessionScroll };
  const prev = map[sid] ?? (get().session?.sessionId === sid ? get().items : []);
  const next = mut(prev);
  map[sid] = next;
  if (get().session?.sessionId === sid) {
    set({ sessionScroll: map, items: next });
  } else {
    set({ sessionScroll: map });
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  env: null,
  status: "disconnected",
  session: null,
  items: [],
  sessionScroll: {},
  liveSessions: [],
  view: "welcome",
  busy: false,
  error: null,
  draft: "",
  alwaysApprove: false,
  projectCwd: "",
  permissions: [],
  slashCommands: [...CLIENT_COMMANDS],
  attachments: [],
  promptQueue: [],
  promptHistory: [],
  modelId: null,
  effort: null,
  models: null,
  lastTokens: null,
  lastUsage: null,
  settingsOpen: false,
  shortcutsOpen: false,
  contextOpen: false,
  modelsOpen: false,
  extensionsOpen: false,
  extensionsTab: "mcp",
  agentsOpen: false,
  agentsTab: "agents",
  automationOpen: false,
  automationTab: "tasks",
  automationJobs: [],
  memoryOpen: false,
  memoryTab: "remember",
  mediaGallery: [],
  accountOpen: false,
  accountTab: "account",
  helpOpen: false,
  projectConfigOpen: false,
  projectConfigTab: "rules",
  signals: null,
  subagents: [],
  suppressHistoryUpdates: false,
  terminals: [],
  terminalsOpen: false,
  selectedTerminalId: null,
  multilineMode: false,
  findOpen: false,
  findQuery: "",
  findIndex: 0,
  historyOpen: false,
  sessionMode: "ask",
  planOpen: false,
  planMarkdown: null,
  planModeState: null,
  elicitations: [],
  compactMode: false,
  showTimestamps: false,
  rawMarkdown: false,
  foldPolicy: "default",
  timelineOpen: false,
  scrollToIndex: null,
  turnFocusIndex: null,

  setEnv: (env) => set({ env }),
  setStatus: (status) => set({ status }),
  setSession: (session) => {
    if (!session) {
      set({
        session: null,
        items: [],
        view: "welcome",
        modelId: null,
        effort: null,
        models: null,
        sessionMode: "ask",
        planOpen: false,
        planMarkdown: null,
        planModeState: null,
        elicitations: [],
      });
      return;
    }
    const items = get().sessionScroll[session.sessionId] ?? [];
    set({
      session,
      items,
      view: "chat",
      modelId: session.modelId ?? get().modelId,
      effort: session.effort ?? get().effort,
    });
  },
  setView: (view) => set({ view }),
  setLiveSessions: (liveSessions) => set({ liveSessions }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
  setDraft: (draft) => set({ draft }),
  setAlwaysApprove: (alwaysApprove) => set({ alwaysApprove }),
  setProjectCwd: (projectCwd) => set({ projectCwd }),
  clearScroll: () => {
    const sid = activeId(get);
    if (sid) {
      const map = { ...get().sessionScroll, [sid]: [] };
      set({ sessionScroll: map, items: [] });
    } else {
      set({ items: [] });
    }
  },

  pushItem: (item, sessionId) =>
    withSessionItems(get, set, sessionId, (items) => [
      ...items,
      item.ts != null ? item : { ...item, ts: Date.now() },
    ]),

  appendAgentText: (text, sessionId) =>
    withSessionItems(get, set, sessionId, (items) => {
      // Always coerce — ACP sometimes streams structured {type,text} objects.
      const chunk = typeof text === "string" ? text : String(text ?? "");
      if (!chunk) return items;
      const last = items[items.length - 1];
      if (last?.kind === "agent") {
        const updated = [...items];
        const prev =
          typeof last.text === "string" ? last.text : String(last.text ?? "");
        updated[updated.length - 1] = { ...last, text: prev + chunk };
        return updated;
      }
      return [
        ...items,
        { id: nextId(), kind: "agent", text: chunk, ts: Date.now() },
      ];
    }),

  appendThoughtText: (text, sessionId) =>
    withSessionItems(get, set, sessionId, (items) => {
      const chunk = typeof text === "string" ? text : String(text ?? "");
      if (!chunk) return items;
      const last = items[items.length - 1];
      if (last?.kind === "thought") {
        const updated = [...items];
        const prev =
          typeof last.text === "string" ? last.text : String(last.text ?? "");
        updated[updated.length - 1] = { ...last, text: prev + chunk };
        return updated;
      }
      return [
        ...items,
        { id: nextId(), kind: "thought", text: chunk, ts: Date.now() },
      ];
    }),

  upsertTool: (tool, sessionId) =>
    withSessionItems(get, set, sessionId, (items) => {
      const idx = items.findIndex(
        (i) => i.kind === "tool" && i.toolCallId === tool.toolCallId,
      );
      if (idx >= 0) {
        const updated = [...items];
        const prev = updated[idx];
        if (prev.kind === "tool") {
          updated[idx] = {
            ...prev,
            title: tool.title || prev.title,
            status: tool.status || prev.status,
            toolKind: tool.toolKind ?? prev.toolKind,
            input: tool.input ?? prev.input,
            output: tool.output ?? prev.output,
            locations: tool.locations ?? prev.locations,
            contentBlocks: tool.contentBlocks ?? prev.contentBlocks,
            terminalId: tool.terminalId ?? prev.terminalId,
          };
        }
        return updated;
      }
      return [
        ...items,
        {
          id: nextId(),
          kind: "tool",
          toolCallId: tool.toolCallId,
          title: tool.title || "tool",
          status: tool.status || "pending",
          toolKind: tool.toolKind,
          input: tool.input,
          output: tool.output,
          locations: tool.locations,
          contentBlocks: tool.contentBlocks,
          terminalId: tool.terminalId,
          ts: Date.now(),
        },
      ];
    }),

  setPlan: (entries, sessionId) =>
    withSessionItems(get, set, sessionId, (items) => {
      const idx = items.findIndex((i) => i.kind === "plan");
      if (idx >= 0) {
        const updated = [...items];
        const prev = items[idx];
        updated[idx] = {
          id: prev.id,
          kind: "plan",
          entries,
          ts: prev.kind === "plan" ? prev.ts : Date.now(),
        };
        return updated;
      }
      return [...items, { id: nextId(), kind: "plan", entries, ts: Date.now() }];
    }),

  loadScrollForSession: (sessionId) => {
    const items = get().sessionScroll[sessionId] ?? [];
    set({ items });
  },

  enqueuePermission: (req) =>
    set({ permissions: [...get().permissions, req] }),

  dequeuePermission: () =>
    set({ permissions: get().permissions.slice(1) }),

  clearPermissions: () => set({ permissions: [] }),

  setSlashCommands: (agentCmds) => {
    const byName = new Map<string, SlashCommand>();
    // Agent first, then client — client wins on name collisions so GUI owns UX.
    for (const c of agentCmds) byName.set(c.name, c);
    for (const c of CLIENT_COMMANDS) byName.set(c.name, c);
    set({
      slashCommands: Array.from(byName.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    });
  },

  addAttachment: (path) => {
    const p = path.trim();
    if (!p) return;
    const cur = get().attachments;
    if (cur.includes(p)) return;
    set({ attachments: [...cur, p] });
  },

  removeAttachment: (path) =>
    set({ attachments: get().attachments.filter((p) => p !== path) }),

  clearAttachments: () => set({ attachments: [] }),

  enqueuePrompt: (prompt) =>
    set({ promptQueue: [...get().promptQueue, prompt] }),

  dequeuePrompt: () => {
    const queue = get().promptQueue;
    // Important: do not call set() when empty — that re-renders forever
    // (Composer drains the queue in a useEffect that depends on promptQueue).
    if (queue.length === 0) return undefined;
    const [head, ...rest] = queue;
    set({ promptQueue: rest });
    return head;
  },

  clearPromptQueue: () => set({ promptQueue: [] }),
  pushPromptHistory: (text) => {
    const t = text.trim();
    if (!t) return;
    const prev = get().promptHistory;
    // Dedup consecutive identical prompts; drop older duplicate.
    if (prev[prev.length - 1] === t) return;
    const next = [...prev.filter((x) => x !== t), t];
    set({ promptHistory: next.length > 200 ? next.slice(-200) : next });
  },
  removePromptHistoryAt: (idx) => {
    const prev = get().promptHistory;
    if (idx < 0 || idx >= prev.length) return;
    set({ promptHistory: prev.filter((_, i) => i !== idx) });
  },
  clearPromptHistory: () => set({ promptHistory: [] }),
  setPromptHistory: (list) =>
    set({
      promptHistory: list
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(-200),
    }),
  setModelId: (modelId) => set({ modelId }),
  setEffort: (effort) => set({ effort }),
  setModels: (models) => {
    if (!models) {
      set({ models: null });
      return;
    }
    set({
      models,
      modelId: models.currentModelId ?? get().modelId,
      effort: models.currentEffort ?? get().effort,
    });
  },
  setLastTokens: (lastTokens) => set({ lastTokens }),
  setLastUsage: (lastUsage) => {
    if (!lastUsage) {
      set({ lastUsage: null });
      return;
    }
    set({
      lastUsage,
      lastTokens:
        typeof lastUsage.totalTokens === "number"
          ? lastUsage.totalTokens
          : get().lastTokens,
    });
  },
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setContextOpen: (contextOpen) => set({ contextOpen }),
  setModelsOpen: (modelsOpen) => set({ modelsOpen }),
  setExtensionsOpen: (extensionsOpen) => set({ extensionsOpen }),
  setExtensionsTab: (extensionsTab) => set({ extensionsTab }),
  setAgentsOpen: (agentsOpen) => set({ agentsOpen }),
  setAgentsTab: (agentsTab) => set({ agentsTab }),
  setAutomationOpen: (automationOpen) => set({ automationOpen }),
  setAutomationTab: (automationTab) => set({ automationTab }),
  setMemoryOpen: (memoryOpen) => set({ memoryOpen }),
  setMemoryTab: (memoryTab) => set({ memoryTab }),
  setAccountOpen: (accountOpen) => set({ accountOpen }),
  setAccountTab: (accountTab) => set({ accountTab }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setProjectConfigOpen: (projectConfigOpen) => set({ projectConfigOpen }),
  setProjectConfigTab: (projectConfigTab) => set({ projectConfigTab }),
  addMediaGalleryItem: (item) => {
    const path = item.path.trim();
    if (!path) return;
    const list = get().mediaGallery;
    if (list.some((m) => m.path === path)) return;
    const entry: MediaGalleryItem = {
      path,
      kind: item.kind,
      source: item.source,
      label: item.label,
      addedAt: item.addedAt ?? Date.now(),
    };
    set({ mediaGallery: [entry, ...list].slice(0, 80) });
  },
  clearMediaGallery: () => set({ mediaGallery: [] }),
  upsertAutomationJob: (job) => {
    const list = get().automationJobs;
    const idx = list.findIndex((j) => j.id === job.id);
    if (idx >= 0) {
      const next = [...list];
      next[idx] = { ...next[idx], ...job, updatedAt: Date.now() };
      set({ automationJobs: next });
    } else {
      set({ automationJobs: [job, ...list] });
    }
  },
  updateAutomationJob: (id, patch) => {
    const list = get().automationJobs;
    const idx = list.findIndex((j) => j.id === id);
    if (idx < 0) return;
    const next = [...list];
    next[idx] = { ...next[idx], ...patch, updatedAt: Date.now() };
    set({ automationJobs: next });
  },
  removeAutomationJob: (id) =>
    set({ automationJobs: get().automationJobs.filter((j) => j.id !== id) }),
  clearAutomationJobs: (kind) => {
    if (!kind) {
      set({ automationJobs: [] });
      return;
    }
    set({ automationJobs: get().automationJobs.filter((j) => j.kind !== kind) });
  },
  setSignals: (signals) => set({ signals }),
  setSubagents: (subagents) => set({ subagents }),
  upsertSubagent: (info) => {
    const list = get().subagents;
    const idx = list.findIndex((s) => s.id === info.id);
    if (idx >= 0) {
      const next = [...list];
      next[idx] = { ...next[idx], ...info };
      set({ subagents: next });
    } else {
      set({ subagents: [...list, info] });
    }
  },
  setSuppressHistoryUpdates: (suppressHistoryUpdates) =>
    set({ suppressHistoryUpdates }),

  setTerminals: (terminals) => set({ terminals }),
  upsertTerminal: (snap) => {
    const list = get().terminals;
    const idx = list.findIndex((t) => t.terminalId === snap.terminalId);
    if (idx >= 0) {
      const next = [...list];
      next[idx] = snap;
      set({ terminals: next });
    } else {
      set({
        terminals: [...list, snap],
        // Auto-show panel when agent creates a new terminal.
        terminalsOpen: true,
        selectedTerminalId: get().selectedTerminalId ?? snap.terminalId,
      });
    }
  },
  removeTerminal: (terminalId) => {
    const terminals = get().terminals.filter((t) => t.terminalId !== terminalId);
    const selected =
      get().selectedTerminalId === terminalId
        ? (terminals[terminals.length - 1]?.terminalId ?? null)
        : get().selectedTerminalId;
    set({
      terminals,
      selectedTerminalId: selected,
      terminalsOpen: terminals.length === 0 ? false : get().terminalsOpen,
    });
  },
  clearTerminals: () =>
    set({ terminals: [], selectedTerminalId: null, terminalsOpen: false }),
  setTerminalsOpen: (terminalsOpen) => set({ terminalsOpen }),
  setSelectedTerminalId: (selectedTerminalId) => set({ selectedTerminalId }),
  setMultilineMode: (multilineMode) => set({ multilineMode }),
  setFindOpen: (findOpen) => set({ findOpen }),
  setFindQuery: (findQuery) => set({ findQuery }),
  setFindIndex: (findIndex) => set({ findIndex }),
  setHistoryOpen: (historyOpen) => set({ historyOpen }),
  setSessionMode: (sessionMode) => set({ sessionMode }),
  setPlanOpen: (planOpen) => set({ planOpen }),
  setPlanMarkdown: (planMarkdown) => set({ planMarkdown }),
  setPlanModeState: (planModeState) => set({ planModeState }),
  enqueueElicitation: (req) =>
    set((s) => ({ elicitations: [...s.elicitations, req] })),
  dequeueElicitation: () =>
    set((s) => ({ elicitations: s.elicitations.slice(1) })),
  clearElicitations: () => set({ elicitations: [] }),
  setCompactMode: (compactMode) => {
    set({ compactMode });
    document.documentElement.setAttribute(
      "data-density",
      compactMode ? "compact" : "comfortable",
    );
  },
  setShowTimestamps: (showTimestamps) => set({ showTimestamps }),
  setRawMarkdown: (rawMarkdown) => set({ rawMarkdown }),
  setFoldPolicy: (foldPolicy) => set({ foldPolicy }),
  setTimelineOpen: (timelineOpen) => set({ timelineOpen }),
  setScrollToIndex: (scrollToIndex) =>
    set(
      scrollToIndex != null
        ? { scrollToIndex, turnFocusIndex: scrollToIndex }
        : { scrollToIndex: null },
    ),
  jumpUserTurn: (dir) => {
    const items = get().items;
    const userIdxs: number[] = [];
    items.forEach((it, i) => {
      if (it.kind === "user") userIdxs.push(i);
    });
    if (userIdxs.length === 0) return null;
    const cur = get().turnFocusIndex ?? get().scrollToIndex;
    // Find nearest user turn at or before current focus; default last.
    let pos = userIdxs.length - 1;
    if (cur != null) {
      const exact = userIdxs.indexOf(cur);
      if (exact >= 0) pos = exact;
      else {
        for (let i = userIdxs.length - 1; i >= 0; i--) {
          if (userIdxs[i] <= cur) {
            pos = i;
            break;
          }
        }
      }
    }
    const next = Math.max(0, Math.min(userIdxs.length - 1, pos + dir));
    const target = userIdxs[next];
    set({ scrollToIndex: target, turnFocusIndex: target });
    return target;
  },

  rewindTurns: (turns = 1) => {
    const n = Math.max(1, Math.floor(turns));
    const sid = activeId(get);
    const items = get().items;
    let userHits = 0;
    let cut = 0;
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].kind === "user") {
        userHits += 1;
        if (userHits === n) {
          cut = i;
          break;
        }
      }
    }
    if (userHits === 0) return 0;
    const next = items.slice(0, cut);
    const removed = items.length - next.length;
    if (sid) {
      const map = { ...get().sessionScroll, [sid]: next };
      set({ sessionScroll: map, items: next });
    } else {
      set({ items: next });
    }
    return removed;
  },
}));

export { nextId, formatJson, CLIENT_COMMANDS };
