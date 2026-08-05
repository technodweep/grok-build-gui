import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { Composer } from "./features/composer/Composer";
import { Scrollback } from "./features/chat/Scrollback";
import { StatusBar } from "./features/chat/StatusBar";
import { Dashboard } from "./features/dashboard/Dashboard";
import { PermissionModal } from "./features/permissions/PermissionModal";
import { ElicitationModal } from "./features/plan/ElicitationModal";
import { PlanViewer } from "./features/plan/PlanViewer";
import { SubagentsPanel } from "./features/chat/SubagentsPanel";
import { TerminalPanel } from "./features/chat/TerminalPanel";
import { ReconnectBanner } from "./features/chat/ReconnectBanner";
import { FindBar } from "./features/chat/FindBar";
import { PlanStrip } from "./features/chat/PlanStrip";
import { ChatToolbar } from "./features/chat/ChatToolbar";
import { TimelinePanel } from "./features/chat/TimelinePanel";
import { ContextPanel } from "./features/context/ContextPanel";
import { SettingsModal } from "./features/settings/SettingsModal";
import { ModelPickerModal } from "./features/settings/ModelPickerModal";
import { ShortcutsModal } from "./features/settings/ShortcutsModal";
import { HistoryPanel } from "./features/composer/HistoryPanel";
import { ExtensionsModal } from "./features/extensions/ExtensionsModal";
import { AgentsModal } from "./features/agents/AgentsModal";
import { Welcome } from "./features/sessions/Welcome";
import {
  getEnvironment,
  getGuiSettings,
  getSessionModels,
  listLiveSessions,
} from "./shared/api";
import { appProbablyBackground, notify } from "./shared/notify";
import { scheduleStreamFlush } from "./shared/streamBatch";
import { formatJson, useAppStore } from "./shared/store";
import { asDisplayText } from "./shared/text";
import { applyTheme } from "./shared/theme";
import { toolOutputFromUpdate } from "./shared/toolContent";
import type {
  AgentStatus,
  ElicitationRequest,
  ElicitationSchema,
  LiveSession,
  PermissionRequest,
  PlanEntry,
  SessionModelsState,
  SessionUpdateParams,
  SubagentInfo,
  TerminalSnapshot,
  TurnUsage,
} from "./shared/types";

function looksLikeSubagentTool(update: NonNullable<SessionUpdateParams["update"]>): boolean {
  const title = String(update.title ?? "").toLowerCase();
  const kind = String(update.kind ?? "").toLowerCase();
  const blob = `${title} ${kind}`;
  return (
    blob.includes("subagent") ||
    blob.includes("spawn_subagent") ||
    blob.includes("spawn subagent") ||
    kind === "think" && title.includes("agent") ||
    /\bagent\b/.test(title) && (blob.includes("explore") || blob.includes("plan") || blob.includes("spawn"))
  );
}

function contentText(content: SessionUpdateParams["update"]): string {
  if (!content) return "";
  // ACP content may be a string, {type,text}, nested {type,content:{...}}, or an array.
  return asDisplayText(content.content);
}

function locationsOf(update: NonNullable<SessionUpdateParams["update"]>): string[] {
  const locs = update.locations;
  if (!Array.isArray(locs)) return [];
  return locs
    .map((l) => (typeof l === "string" ? l : l?.path))
    .filter((p): p is string => !!p);
}

function normalizePermission(payload: Record<string, unknown>): PermissionRequest {
  const requestId = payload.requestId ?? payload.request_id ?? payload.id;
  const sessionId = (payload.sessionId ?? payload.session_id) as string | undefined;
  const toolCall = (payload.toolCall ?? payload.tool_call) as PermissionRequest["toolCall"];
  const rawOptions = (payload.options as Array<Record<string, unknown>>) ?? [];
  const options = rawOptions
    .map((o) => ({
      optionId: String(o.optionId ?? o.option_id ?? ""),
      name: String(o.name ?? o.optionId ?? o.option_id ?? "option"),
      kind: (o.kind as string) ?? null,
    }))
    .filter((o) => o.optionId);

  return {
    requestId,
    sessionId,
    toolCall,
    options,
    raw: payload.raw ?? payload,
  };
}

function normalizeElicitation(payload: Record<string, unknown>): ElicitationRequest {
  const requestId = payload.requestId ?? payload.request_id ?? payload.id;
  const params = (payload.params as Record<string, unknown>) ?? payload;
  const sessionId = (params.sessionId ?? params.session_id) as string | undefined;
  const mode = (params.mode as string) ?? null;
  const message = (params.message as string) ?? null;
  const requestedSchema = (params.requestedSchema ?? params.requested_schema) as
    | ElicitationSchema
    | null
    | undefined;
  const url = (params.url as string) ?? null;
  const elicitationId = (params.elicitationId ?? params.elicitation_id) as
    | string
    | null
    | undefined;

  return {
    requestId,
    sessionId,
    mode,
    message,
    requestedSchema: requestedSchema ?? null,
    url,
    elicitationId: elicitationId ?? null,
    raw: payload,
  };
}

export default function App() {
  const env = useAppStore((s) => s.env);
  const session = useAppStore((s) => s.session);
  const view = useAppStore((s) => s.view);
  const setEnv = useAppStore((s) => s.setEnv);
  const setStatus = useAppStore((s) => s.setStatus);
  const setError = useAppStore((s) => s.setError);
  const appendAgentText = useAppStore((s) => s.appendAgentText);
  const appendThoughtText = useAppStore((s) => s.appendThoughtText);
  const upsertTool = useAppStore((s) => s.upsertTool);
  const setPlan = useAppStore((s) => s.setPlan);
  const setBusy = useAppStore((s) => s.setBusy);
  const enqueuePermission = useAppStore((s) => s.enqueuePermission);
  const clearPermissions = useAppStore((s) => s.clearPermissions);
  const enqueueElicitation = useAppStore((s) => s.enqueueElicitation);
  const clearElicitations = useAppStore((s) => s.clearElicitations);
  const setSlashCommands = useAppStore((s) => s.setSlashCommands);
  const setSessionMode = useAppStore((s) => s.setSessionMode);
  const setLiveSessions = useAppStore((s) => s.setLiveSessions);
  const setSession = useAppStore((s) => s.setSession);
  const setView = useAppStore((s) => s.setView);
  const setModelId = useAppStore((s) => s.setModelId);
  const setModels = useAppStore((s) => s.setModels);
  const setLastTokens = useAppStore((s) => s.setLastTokens);
  const setLastUsage = useAppStore((s) => s.setLastUsage);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen);
  const setFindOpen = useAppStore((s) => s.setFindOpen);
  const setMultilineMode = useAppStore((s) => s.setMultilineMode);
  const setCompactMode = useAppStore((s) => s.setCompactMode);
  const setShowTimestamps = useAppStore((s) => s.setShowTimestamps);
  const setAlwaysApprove = useAppStore((s) => s.setAlwaysApprove);
  const jumpUserTurn = useAppStore((s) => s.jumpUserTurn);
  const setTimelineOpen = useAppStore((s) => s.setTimelineOpen);
  const upsertSubagent = useAppStore((s) => s.upsertSubagent);
  const upsertTerminal = useAppStore((s) => s.upsertTerminal);
  const removeTerminal = useAppStore((s) => s.removeTerminal);
  const clearTerminals = useAppStore((s) => s.clearTerminals);

  useEffect(() => {
    void (async () => {
      try {
        const settings = await getGuiSettings();
        applyTheme(
          settings.theme ?? "dark",
          settings.fontSize ?? 14,
          !!settings.compactMode,
        );
        if (typeof settings.alwaysApprove === "boolean") {
          setAlwaysApprove(settings.alwaysApprove);
        }
        if (typeof settings.multilineMode === "boolean") {
          setMultilineMode(settings.multilineMode);
        }
        if (typeof settings.compactMode === "boolean") {
          setCompactMode(settings.compactMode);
        }
        if (typeof settings.showTimestamps === "boolean") {
          setShowTimestamps(settings.showTimestamps);
        }
        const info = await getEnvironment(settings.binaryOverride ?? null);
        setEnv(info);
        setError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setEnv({
          grokHome: "~/.grok",
          binaryPath: null,
          binaryVersion: null,
          found: false,
          authPresent: false,
          authEmail: null,
          authMode: null,
        });
      }
    })();
  }, [
    setEnv,
    setError,
    setAlwaysApprove,
    setMultilineMode,
    setCompactMode,
    setShowTimestamps,
  ]);

  // Global shortcuts (when not focused in a field that consumes them)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const inField =
        tag === "input" || tag === "textarea" || target?.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
        // Find in chat when a session is open.
        if (useAppStore.getState().view === "chat") {
          e.preventDefault();
          setFindOpen(true);
          return;
        }
      }
      // Turn jump: Alt+↑ / Alt+↓ (or Ctrl+Alt when needed)
      if (
        e.altKey &&
        !e.metaKey &&
        (e.key === "ArrowUp" || e.key === "ArrowDown") &&
        useAppStore.getState().view === "chat"
      ) {
        e.preventDefault();
        jumpUserTurn(e.key === "ArrowUp" ? -1 : 1);
        return;
      }
      // Timeline: Ctrl+G when in chat (tasks pane remapped for GUI)
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "g" || e.key === "G") &&
        useAppStore.getState().view === "chat" &&
        !inField
      ) {
        e.preventDefault();
        const st = useAppStore.getState();
        st.setTimelineOpen(!st.timelineOpen);
        return;
      }
      // Esc cancels an in-flight turn when not typing in a field / modal.
      if (e.key === "Escape" && !inField) {
        const st = useAppStore.getState();
        if (st.view === "chat" && (st.busy || st.findOpen)) {
          if (st.findOpen) {
            e.preventDefault();
            st.setFindOpen(false);
            return;
          }
          if (st.busy) {
            e.preventDefault();
            st.setBusy(false);
            st.clearPromptQueue();
            void import("./shared/api").then(({ cancelTurn }) =>
              cancelTurn().catch(() => undefined),
            );
            return;
          }
        }
      }
      if (!inField && e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSettingsOpen, setShortcutsOpen, setFindOpen, jumpUserTurn, setTimelineOpen]);

  useEffect(() => {
    // Tauri listen() is async. Under React StrictMode the effect mounts,
    // unmounts, remounts before .then runs — if we only push unsubs in .then,
    // the first cleanup is a no-op and both listeners stay active → every
    // stream chunk is applied twice ("Hi Hi again again").
    let cancelled = false;
    const unsubs: Array<() => void> = [];

    const track = (p: Promise<() => void>) => {
      void p.then((unlisten) => {
        if (cancelled) {
          unlisten();
          return;
        }
        unsubs.push(unlisten);
      });
    };

    track(
      listen<AgentStatus>("agent://status", (ev) => {
        setStatus(ev.payload);
        if (ev.payload === "disconnected" || ev.payload === "error") {
          clearPermissions();
          clearElicitations();
          setLiveSessions([]);
          clearTerminals();
          setModels(null);
          setBusy(false);
          // Keep session + scrollback so the user can Resume from the banner.
          // Only force welcome when we never had a session open.
          const hadSession = !!useAppStore.getState().session;
          if (!hadSession && ev.payload === "disconnected") {
            setView("welcome");
          } else if (hadSession) {
            setView("chat");
            if (appProbablyBackground()) {
              void notify(
                "Grok Build · Agent disconnected",
                "Session kept — open the app to Resume or start a new session.",
              );
            }
          }
        }
        if (ev.payload === "ready") {
          void getSessionModels()
            .then(setModels)
            .catch(() => undefined);
        }
      }),
    );

    track(
      listen<string>("agent://error", (ev) => {
        setError(ev.payload);
        setBusy(false);
      }),
    );

    track(
      listen<LiveSession[]>("agent://roster", (ev) => {
        setLiveSessions(ev.payload ?? []);
      }),
    );

    track(
      listen<SessionUpdateParams>("session://update", (ev) => {
        // Coalesce high-frequency chunks onto rAF so React paints once per frame.
        scheduleStreamFlush(() => {
          const sid = ev.payload?.sessionId;
          const update = ev.payload?.update;
          if (!update) return;
          const kind = update.sessionUpdate;

          const t = (update as { _meta?: { totalTokens?: number } })._meta
            ?.totalTokens;
          if (typeof t === "number") setLastTokens(t);

          const suppress = useAppStore.getState().suppressHistoryUpdates;
          if (
            suppress &&
            (kind === "agent_message_chunk" ||
              kind === "agent_thought_chunk" ||
              kind === "user_message_chunk")
          ) {
            return;
          }

          if (kind === "agent_message_chunk") {
            const text = contentText(update);
            if (text) appendAgentText(text, sid);
          } else if (kind === "agent_thought_chunk") {
            const text = contentText(update);
            if (text) appendThoughtText(text, sid);
          } else if (kind === "tool_call" || kind === "tool_call_update") {
            const toolCallId = String(update.toolCallId ?? "unknown");
            const fromBlocks = toolOutputFromUpdate(update);
            upsertTool(
              {
                toolCallId,
                title: (update.title as string) || "tool",
                status: (update.status as string) || "pending",
                toolKind: update.kind as string | undefined,
                input: formatJson(update.rawInput),
                output:
                  fromBlocks.output ??
                  formatJson(update.rawOutput) ??
                  (contentText(update) || undefined),
                locations: locationsOf(update),
                contentBlocks: fromBlocks.contentBlocks,
              },
              sid,
            );

            if (looksLikeSubagentTool(update)) {
              const parent =
                sid || useAppStore.getState().session?.sessionId || "unknown";
              const raw = update.rawInput as Record<string, unknown> | undefined;
              const rawOut = update.rawOutput as Record<string, unknown> | undefined;
              const agentType =
                (raw?.subagent_type as string) ||
                (raw?.subagentType as string) ||
                (raw?.agent_type as string) ||
                (update.kind ? String(update.kind) : "agent");
              const isolation =
                (raw?.isolation as string) ||
                (rawOut?.isolation as string) ||
                undefined;
              const worktreePath =
                (raw?.worktree as string) ||
                (rawOut?.worktree as string) ||
                (rawOut?.worktreePath as string) ||
                undefined;
              const childSessionId =
                (rawOut?.sessionId as string) ||
                (rawOut?.childSessionId as string) ||
                (rawOut?.session_id as string) ||
                undefined;
              const info: SubagentInfo = {
                id: toolCallId,
                parentSessionId: parent,
                name: String(update.title ?? "subagent"),
                agentType,
                status: update.status ? String(update.status) : "running",
                title: String(update.title ?? ""),
                isolation: isolation || (worktreePath ? "worktree" : undefined),
                worktreePath,
                childSessionId,
                live: true,
              };
              const active = useAppStore.getState().session?.sessionId;
              if (!active || active === parent || !sid) {
                upsertSubagent(info);
              }
            }
          } else if (kind === "plan") {
            const entries = (update.entries as PlanEntry[]) ?? [];
            if (Array.isArray(entries)) setPlan(entries, sid);
          } else if (kind === "turn_completed") {
            setBusy(false);
            const usage = update.usage as TurnUsage | undefined;
            if (usage && typeof usage === "object") {
              setLastUsage({
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                totalTokens: usage.totalTokens,
                cachedReadTokens: usage.cachedReadTokens,
                reasoningTokens: usage.reasoningTokens,
                modelCalls: usage.modelCalls,
                apiDurationMs: usage.apiDurationMs,
              });
            }
          } else if (
            kind === "auto_compact_started" ||
            kind === "auto_compact_completed" ||
            kind === "compaction_checkpoint"
          ) {
            const label =
              kind === "auto_compact_started"
                ? "Auto-compact started…"
                : kind === "auto_compact_completed"
                  ? "Auto-compact completed."
                  : "Compaction checkpoint.";
            useAppStore.getState().pushItem(
              {
                id: `sys-compact-${Date.now()}`,
                kind: "system",
                text: label,
              },
              sid,
            );
            const active = useAppStore.getState().session?.sessionId;
            if (active) {
              void import("./shared/api").then(({ getSessionSignals }) =>
                getSessionSignals(active)
                  .then((s) => useAppStore.getState().setSignals(s))
                  .catch(() => undefined),
              );
            }
          } else if (kind === "available_commands_update") {
            const cmds =
              (update.availableCommands as Array<{
                name?: string;
                description?: string;
                input?: { hint?: string };
              }>) ?? [];
            setSlashCommands(
              cmds
                .filter((c) => c.name)
                .map((c) => ({
                  name: String(c.name),
                  description: c.description,
                  inputHint: c.input?.hint,
                  source: "agent" as const,
                })),
            );
          } else if (kind === "current_mode_update" || kind === "model_update") {
            const mid =
              (update as { modelId?: string }).modelId ||
              (update as { currentModelId?: string }).currentModelId;
            if (mid) setModelId(String(mid));
            // Some agents surface permission/plan mode here.
            const modeId =
              (update as { modeId?: string }).modeId ||
              (update as { currentModeId?: string }).currentModeId ||
              (update as { mode?: string }).mode;
            if (modeId) {
              const m = String(modeId).toLowerCase();
              if (m.includes("plan")) setSessionMode("plan");
              else if (m.includes("auto")) setSessionMode("auto");
              else if (
                m.includes("yolo") ||
                m.includes("always") ||
                m.includes("bypass")
              ) {
                setSessionMode("yolo");
              } else if (m.includes("ask") || m === "default") {
                setSessionMode("ask");
              }
            }
          }
        });
      }),
    );

    track(
      listen<SessionModelsState>("session://models", (ev) => {
        if (ev.payload) setModels(ev.payload);
      }),
    );

    track(
      listen<Record<string, unknown>>("session://permission", (ev) => {
        const req = normalizePermission(ev.payload ?? {});
        enqueuePermission(req);
        const title =
          (req.toolCall?.title as string | undefined) || "Permission required";
        const body = "Grok is waiting for you to approve a tool action.";
        // Always notify when backgrounded; also notify if user is on dashboard.
        if (appProbablyBackground() || useAppStore.getState().view === "dashboard") {
          void notify(`Grok Build · ${title}`, body);
        } else {
          // Soft notify even when focused if more than one pending.
          if (useAppStore.getState().permissions.length >= 1) {
            void notify(`Grok Build · ${title}`, body);
          }
        }
      }),
    );

    track(
      listen<Record<string, unknown>>("session://elicitation", (ev) => {
        const req = normalizeElicitation(ev.payload ?? {});
        enqueueElicitation(req);
        const title = req.message?.slice(0, 80) || "Input required";
        if (appProbablyBackground() || useAppStore.getState().view === "dashboard") {
          void notify(`Grok Build · ${title}`, "Answer the form to continue.");
        }
      }),
    );

    track(
      listen<TerminalSnapshot>("terminal://update", (ev) => {
        if (ev.payload?.terminalId) upsertTerminal(ev.payload);
      }),
    );

    track(
      listen<{ terminalId?: string }>("terminal://closed", (ev) => {
        const id = ev.payload?.terminalId;
        if (id) removeTerminal(id);
      }),
    );

    void listLiveSessions()
      .then((list) => {
        if (!cancelled) setLiveSessions(list);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [
    setStatus,
    setError,
    appendAgentText,
    appendThoughtText,
    upsertTool,
    setPlan,
    setBusy,
    enqueuePermission,
    clearPermissions,
    enqueueElicitation,
    clearElicitations,
    setSessionMode,
    setSlashCommands,
    setLiveSessions,
    setSession,
    setView,
    setLastTokens,
    setLastUsage,
    setModelId,
    setModels,
    upsertSubagent,
    upsertTerminal,
    removeTerminal,
    clearTerminals,
  ]);

  const showWelcome = view === "welcome" || !env?.found || (!session && view !== "dashboard");
  const showDashboard = view === "dashboard" && !!env?.found;
  const showChat = view === "chat" && !!session && !!env?.found;

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ height: "100%", minHeight: "100vh", background: "#0c0e12", color: "#e8ecf4" }}
    >
      <StatusBar />
      {!env ? (
        <div
          className="flex flex-1 items-center justify-center"
          style={{ color: "#8b95a8" }}
        >
          Loading environment…
        </div>
      ) : showDashboard ? (
        <Dashboard />
      ) : showChat ? (
        <>
          <ReconnectBanner />
          <FindBar />
          <PlanStrip />
          <ChatToolbar />
          <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
              <Scrollback />
              <SubagentsPanel />
              <TerminalPanel />
              <Composer />
            </div>
            <TimelinePanel />
          </div>
        </>
      ) : showWelcome ? (
        <Welcome env={env} />
      ) : (
        <Welcome env={env} />
      )}
      <PermissionModal />
      <ElicitationModal />
      <PlanViewer />
      <SettingsModal />
      <ModelPickerModal />
      <ExtensionsModal />
      <AgentsModal />
      <HistoryPanel />
      <ShortcutsModal />
      <ContextPanel />
    </div>
  );
}
