import { create } from "zustand";
import type {
  AgentStatus,
  AppView,
  EnvironmentInfo,
  LiveSession,
  PermissionRequest,
  PlanEntry,
  QueuedPrompt,
  ScrollItem,
  SessionModelsState,
  SessionSignals,
  SessionState,
  SlashCommand,
  SubagentInfo,
  TerminalSnapshot,
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
  settingsOpen: boolean;
  shortcutsOpen: boolean;
  contextOpen: boolean;
  modelsOpen: boolean;
  signals: SessionSignals | null;
  /** Subagents for the active (or last loaded) parent session. */
  subagents: SubagentInfo[];
  /** When true, ignore session/update history-like chunks (resume grace). */
  suppressHistoryUpdates: boolean;
  /** Live ACP terminal snapshots. */
  terminals: TerminalSnapshot[];
  terminalsOpen: boolean;
  selectedTerminalId: string | null;

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
    },
    sessionId?: string,
  ) => void;
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
    description: "Recall last prompt into composer (also ↑ on empty input)",
    source: "client",
  },
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
  { name: "copy", description: "Copy last agent reply to clipboard", source: "client" },
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
  settingsOpen: false,
  shortcutsOpen: false,
  contextOpen: false,
  modelsOpen: false,
  signals: null,
  subagents: [],
  suppressHistoryUpdates: false,
  terminals: [],
  terminalsOpen: false,
  selectedTerminalId: null,

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
    withSessionItems(get, set, sessionId, (items) => [...items, item]),

  appendAgentText: (text, sessionId) =>
    withSessionItems(get, set, sessionId, (items) => {
      const last = items[items.length - 1];
      if (last?.kind === "agent") {
        const updated = [...items];
        updated[updated.length - 1] = { ...last, text: last.text + text };
        return updated;
      }
      return [...items, { id: nextId(), kind: "agent", text }];
    }),

  appendThoughtText: (text, sessionId) =>
    withSessionItems(get, set, sessionId, (items) => {
      const last = items[items.length - 1];
      if (last?.kind === "thought") {
        const updated = [...items];
        updated[updated.length - 1] = { ...last, text: last.text + text };
        return updated;
      }
      return [...items, { id: nextId(), kind: "thought", text }];
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
        },
      ];
    }),

  setPlan: (entries, sessionId) =>
    withSessionItems(get, set, sessionId, (items) => {
      const idx = items.findIndex((i) => i.kind === "plan");
      if (idx >= 0) {
        const updated = [...items];
        updated[idx] = { id: items[idx].id, kind: "plan", entries };
        return updated;
      }
      return [...items, { id: nextId(), kind: "plan", entries }];
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
    for (const c of CLIENT_COMMANDS) byName.set(c.name, c);
    for (const c of agentCmds) byName.set(c.name, c);
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
    // Dedup consecutive identical prompts.
    if (prev[prev.length - 1] === t) return;
    const next = [...prev, t];
    // Cap at 100 entries.
    set({ promptHistory: next.length > 100 ? next.slice(-100) : next });
  },
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
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setContextOpen: (contextOpen) => set({ contextOpen }),
  setModelsOpen: (modelsOpen) => set({ modelsOpen }),
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
}));

export { nextId, formatJson, CLIENT_COMMANDS };
