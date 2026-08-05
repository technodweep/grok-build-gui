import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  cancelTurn,
  closeLiveSession,
  disconnectAgent,
  fuzzyProjectFiles,
  getPlanModeState,
  getSessionPlan,
  getSessionSignals,
  newSession,
  renameLiveSession,
  sendPrompt,
  setSessionEffort,
  setSessionModel,
} from "../../shared/api";
import {
  conversationText,
  exportConversationToFile,
  writeTextFile,
} from "../../shared/export";
import { asDisplayText } from "../../shared/text";
import { nextId, useAppStore } from "../../shared/store";
import type { FileEntry, SlashCommand } from "../../shared/types";

type PaletteMode = "slash" | "at" | null;

export function Composer() {
  const status = useAppStore((s) => s.status);
  const busy = useAppStore((s) => s.busy);
  const draft = useAppStore((s) => s.draft);
  const setDraft = useAppStore((s) => s.setDraft);
  const setBusy = useAppStore((s) => s.setBusy);
  const setError = useAppStore((s) => s.setError);
  const pushItem = useAppStore((s) => s.pushItem);
  const session = useAppStore((s) => s.session);
  const slashCommands = useAppStore((s) => s.slashCommands);
  const attachments = useAppStore((s) => s.attachments);
  const addAttachment = useAppStore((s) => s.addAttachment);
  const removeAttachment = useAppStore((s) => s.removeAttachment);
  const clearAttachments = useAppStore((s) => s.clearAttachments);
  const enqueuePrompt = useAppStore((s) => s.enqueuePrompt);
  const dequeuePrompt = useAppStore((s) => s.dequeuePrompt);
  const promptQueue = useAppStore((s) => s.promptQueue);
  const clearScroll = useAppStore((s) => s.clearScroll);
  const clearPermissions = useAppStore((s) => s.clearPermissions);
  const setSession = useAppStore((s) => s.setSession);
  const setStatus = useAppStore((s) => s.setStatus);
  const setView = useAppStore((s) => s.setView);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen);
  const setContextOpen = useAppStore((s) => s.setContextOpen);
  const setSignals = useAppStore((s) => s.setSignals);
  const terminalsOpen = useAppStore((s) => s.terminalsOpen);
  const setTerminalsOpen = useAppStore((s) => s.setTerminalsOpen);
  const setModelsOpen = useAppStore((s) => s.setModelsOpen);
  const setModels = useAppStore((s) => s.setModels);
  const items = useAppStore((s) => s.items);
  const projectCwd = useAppStore((s) => s.projectCwd);
  const loadScrollForSession = useAppStore((s) => s.loadScrollForSession);
  const promptHistory = useAppStore((s) => s.promptHistory);
  const pushPromptHistory = useAppStore((s) => s.pushPromptHistory);
  const multilineMode = useAppStore((s) => s.multilineMode);
  const setMultilineMode = useAppStore((s) => s.setMultilineMode);
  const setFindOpen = useAppStore((s) => s.setFindOpen);
  const setHistoryOpen = useAppStore((s) => s.setHistoryOpen);
  const rewindTurns = useAppStore((s) => s.rewindTurns);
  const setSessionMode = useAppStore((s) => s.setSessionMode);
  const setPlanOpen = useAppStore((s) => s.setPlanOpen);
  const setPlanMarkdown = useAppStore((s) => s.setPlanMarkdown);
  const setPlanModeState = useAppStore((s) => s.setPlanModeState);
  const setAlwaysApprove = useAppStore((s) => s.setAlwaysApprove);
  const sessionMode = useAppStore((s) => s.sessionMode);

  const [sending, setSending] = useState(false);
  const [palette, setPalette] = useState<PaletteMode>(null);
  const [filter, setFilter] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  /** -1 = not browsing history; 0 = oldest, length-1 = newest. */
  const [histIdx, setHistIdx] = useState(-1);
  const histDraftBackup = useRef("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const draining = useRef(false);

  const ready = status === "ready";
  const turnActive = busy || sending;

  // Tauri file drag-drop → path attachments (relative to project when possible).
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        const un = await getCurrentWebview().onDragDropEvent((event) => {
          if (cancelled) return;
          const payload = event.payload;
          if (payload.type === "enter" || payload.type === "over") {
            setDragOver(true);
            return;
          }
          if (payload.type === "leave") {
            setDragOver(false);
            return;
          }
          if (payload.type === "drop") {
            setDragOver(false);
            const cwd = (useAppStore.getState().projectCwd ||
              useAppStore.getState().session?.cwd ||
              "").replace(/\/+$/, "");
            for (const abs of payload.paths ?? []) {
              let rel = abs;
              if (cwd && (abs === cwd || abs.startsWith(cwd + "/"))) {
                rel = abs === cwd ? "." : abs.slice(cwd.length + 1);
              }
              useAppStore.getState().addAttachment(rel);
            }
          }
        });
        if (cancelled) un();
        else unlisten = un;
      } catch {
        /* web / no tauri */
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Detect `/` or `@` trigger at end of draft
  useEffect(() => {
    const m = draft.match(/(?:^|\s)([/@])([^\s]*)$/);
    if (!m || !ready) {
      setPalette(null);
      return;
    }
    const mode = m[1] === "/" ? "slash" : "at";
    setPalette(mode);
    setFilter(m[2] ?? "");
    setSelectedIdx(0);
  }, [draft, ready]);

  // Load files for @ palette
  useEffect(() => {
    if (palette !== "at" || !session?.cwd) {
      setFiles([]);
      return;
    }
    let cancelled = false;
    setFilesLoading(true);
    const t = window.setTimeout(() => {
      void fuzzyProjectFiles(session.cwd, filter, 40)
        .then((list) => {
          if (!cancelled) setFiles(list.filter((f) => !f.isDir));
        })
        .catch(() => {
          if (!cancelled) setFiles([]);
        })
        .finally(() => {
          if (!cancelled) setFilesLoading(false);
        });
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [palette, filter, session?.cwd]);

  const slashMatches = useMemo(() => {
    const q = filter.toLowerCase();
    return slashCommands.filter(
      (c) => !q || c.name.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q),
    );
  }, [slashCommands, filter]);

  const paletteItems: Array<{ key: string; label: string; sub?: string; data: SlashCommand | FileEntry }> =
    palette === "slash"
      ? slashMatches.map((c) => ({
          key: c.name,
          label: `/${c.name}`,
          sub: c.description,
          data: c,
        }))
      : palette === "at"
        ? files.map((f) => ({
            key: f.path,
            label: f.path,
            sub: f.isDir ? "dir" : undefined,
            data: f,
          }))
        : [];

  const applySlash = async (cmd: SlashCommand) => {
    setPalette(null);
    // Remove the /query from draft
    const last = draft.lastIndexOf("/");
    const before = last >= 0 ? draft.slice(0, last).trimEnd() : draft;
    setDraft(before);

    if (cmd.source === "client") {
      await runClientCommand(cmd.name);
      return;
    }
    // Agent commands: insert `/name ` for user to add args, or send immediately if no hint needed
    if (cmd.inputHint) {
      setDraft(`/${cmd.name} `);
      taRef.current?.focus();
    } else {
      setDraft("");
      await dispatchSend(`/${cmd.name}`, []);
    }
  };

  const applyAt = (file: FileEntry) => {
    setPalette(null);
    addAttachment(file.path);
    // Remove @query from draft
    const last = draft.lastIndexOf("@");
    if (last >= 0) {
      setDraft(draft.slice(0, last).trimEnd() + (draft.slice(0, last).trimEnd() ? " " : ""));
    }
    taRef.current?.focus();
  };

  const runClientCommand = async (name: string, arg = "") => {
    const argTrim = arg.trim();
    switch (name) {
      case "new": {
        try {
          clearScroll();
          clearPermissions();
          clearAttachments();
          const s = await newSession();
          setSession(s);
          setStatus("ready");
          pushItem({
            id: nextId(),
            kind: "system",
            text: `New session · ${s.sessionId.slice(0, 8)}…`,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
        break;
      }
      case "home": {
        await disconnectAgent();
        setSession(null);
        setStatus("disconnected");
        clearPermissions();
        clearScroll();
        clearAttachments();
        useAppStore.getState().clearPromptQueue();
        setView("welcome");
        break;
      }
      case "dashboard": {
        setView("dashboard");
        break;
      }
      case "settings": {
        setSettingsOpen(true);
        break;
      }
      case "shortcuts": {
        setShortcutsOpen(true);
        break;
      }
      case "context":
      case "session-info":
      case "status":
      case "info": {
        setContextOpen(true);
        if (session?.sessionId) {
          void getSessionSignals(session.sessionId)
            .then(setSignals)
            .catch(() => undefined);
        }
        break;
      }
      case "terminal": {
        setTerminalsOpen(!terminalsOpen);
        break;
      }
      case "model":
      case "m": {
        if (!argTrim) {
          setModelsOpen(true);
          break;
        }
        try {
          const next = await setSessionModel(argTrim);
          setModels(next);
          pushItem({
            id: nextId(),
            kind: "system",
            text: `Model → ${next.currentModelId ?? argTrim}${
              next.currentEffort ? ` · effort ${next.currentEffort}` : ""
            }`,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
        break;
      }
      case "effort": {
        if (!argTrim) {
          setModelsOpen(true);
          break;
        }
        try {
          const next = await setSessionEffort(argTrim.toLowerCase());
          setModels(next);
          pushItem({
            id: nextId(),
            kind: "system",
            text: `Effort → ${next.currentEffort ?? argTrim}`,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
        break;
      }
      case "copy": {
        const agentMsgs = items.filter((it) => it.kind === "agent");
        if (agentMsgs.length === 0) {
          setError("No agent reply to copy");
          break;
        }
        // /copy | /copy 2 | /copy out.txt | /copy 2 ~/export.md
        const parts = argTrim.split(/\s+/).filter(Boolean);
        let n = 1;
        let filePath: string | null = null;
        if (parts.length === 1) {
          if (/^\d+$/.test(parts[0])) n = parseInt(parts[0], 10);
          else filePath = parts[0];
        } else if (parts.length >= 2) {
          if (/^\d+$/.test(parts[0])) {
            n = parseInt(parts[0], 10);
            filePath = parts.slice(1).join(" ");
          } else {
            filePath = parts.join(" ");
          }
        }
        n = Math.max(1, n);
        const idx = agentMsgs.length - n;
        if (idx < 0) {
          setError(`Only ${agentMsgs.length} agent reply(ies); cannot copy #${n}`);
          break;
        }
        const msg = agentMsgs[idx];
        const text =
          msg && msg.kind === "agent" ? asDisplayText(msg.text) : "";
        if (!text) {
          setError("Empty agent reply");
          break;
        }
        try {
          if (filePath) {
            let path = filePath;
            if (path.startsWith("~/") || path === "~") {
              const grokHome = useAppStore.getState().env?.grokHome ?? "";
              // grokHome is typically /home/user/.grok → parent is $HOME
              const home = grokHome.replace(/\/\.grok\/?$/, "") || grokHome;
              path = path === "~" ? home : `${home}${path.slice(1)}`;
            } else if (!path.startsWith("/")) {
              const cwd = projectCwd || session?.cwd || "";
              path = cwd ? `${cwd.replace(/\/$/, "")}/${path}` : path;
            }
            await writeTextFile(path, text);
            pushItem({
              id: nextId(),
              kind: "system",
              text: `Copied agent reply #${n} → ${path}`,
            });
          } else {
            await navigator.clipboard.writeText(text);
            pushItem({
              id: nextId(),
              kind: "system",
              text:
                n === 1
                  ? "Last agent reply copied."
                  : `Agent reply #${n} (from end) copied.`,
            });
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
        break;
      }
      case "compact": {
        if (!ready) {
          setError("Connect a session first");
          break;
        }
        if (turnActive) {
          setError("Wait for the current turn to finish (or Stop) before compacting");
          break;
        }
        const note = argTrim;
        const cmd = note ? `/compact ${note}` : "/compact";
        pushItem({
          id: nextId(),
          kind: "system",
          text: note
            ? `Compacting context (keep: ${note})…`
            : "Compacting context…",
        });
        try {
          await dispatchSend(cmd, []);
          if (session?.sessionId) {
            void getSessionSignals(session.sessionId)
              .then(setSignals)
              .catch(() => undefined);
            setContextOpen(true);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
        break;
      }
      case "rewind":
      case "undo": {
        if (!ready) {
          setError("Connect a session first");
          break;
        }
        if (turnActive) {
          setError("Stop the current turn before rewind");
          break;
        }
        const turns = /^\d+$/.test(argTrim) ? parseInt(argTrim, 10) : 1;
        const removed = rewindTurns(turns);
        if (removed === 0) {
          setError("Nothing to rewind");
          break;
        }
        pushItem({
          id: nextId(),
          kind: "system",
          text: `Local scroll rewound (${removed} items, ${turns} turn${turns > 1 ? "s" : ""}). Asking agent to /rewind…`,
        });
        try {
          // Agent-side rewind (slash). Local view already truncated.
          await sendPrompt(turns > 1 ? `/rewind ${turns}` : "/rewind", []);
        } catch (e) {
          // Local rewind kept even if agent command fails
          setError(e instanceof Error ? e.message : String(e));
        }
        break;
      }
      case "fork": {
        if (!ready) {
          setError("Connect a session first");
          break;
        }
        if (turnActive) {
          setError("Stop the current turn before fork");
          break;
        }
        pushItem({
          id: nextId(),
          kind: "system",
          text: "Forking session via agent /fork… (new session appears in dashboard when ready)",
        });
        try {
          await dispatchSend("/fork", []);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
        break;
      }
      case "plan": {
        if (!ready) {
          setError("Connect a session first");
          break;
        }
        setSessionMode("plan");
        if (argTrim) {
          // /plan <description> — enter plan mode and start turn in one step
          pushItem({
            id: nextId(),
            kind: "system",
            text: "Entering plan mode with description…",
          });
          try {
            await dispatchSend(`/plan ${argTrim}`, []);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        } else {
          pushItem({
            id: nextId(),
            kind: "system",
            text: "Plan mode pending — send your next prompt to activate (or /view-plan to open plan.md).",
          });
          try {
            await dispatchSend("/plan", []);
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }
        break;
      }
      case "view-plan":
      case "show-plan":
      case "plan-view": {
        if (!session?.sessionId) {
          setError("No active session");
          break;
        }
        setPlanOpen(true);
        try {
          const [md, mode] = await Promise.all([
            getSessionPlan(session.sessionId),
            getPlanModeState(session.sessionId),
          ]);
          setPlanMarkdown(md);
          setPlanModeState(mode);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
        break;
      }
      case "auto": {
        if (!ready) {
          setError("Connect a session first");
          break;
        }
        const next = sessionMode === "auto" ? "ask" : "auto";
        setSessionMode(next);
        pushItem({
          id: nextId(),
          kind: "system",
          text: next === "auto" ? "Auto permission mode on…" : "Auto mode off (ask)…",
        });
        try {
          await dispatchSend("/auto", []);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
        break;
      }
      case "always-approve":
      case "yolo": {
        if (!ready) {
          setError("Connect a session first");
          break;
        }
        const next = sessionMode === "yolo" ? "ask" : "yolo";
        setSessionMode(next);
        setAlwaysApprove(next === "yolo");
        pushItem({
          id: nextId(),
          kind: "system",
          text:
            next === "yolo"
              ? "Always-approve (yolo) on — tools auto-run (deny rules still apply)."
              : "Always-approve off (ask mode).",
        });
        try {
          await dispatchSend("/always-approve", []);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
        break;
      }
      case "rename":
      case "title": {
        if (!argTrim) {
          setError("Usage: /rename <title>");
          break;
        }
        if (!session?.sessionId) {
          setError("No active session");
          break;
        }
        try {
          await renameLiveSession(session.sessionId, argTrim);
          pushItem({
            id: nextId(),
            kind: "system",
            text: `Renamed session → ${argTrim}`,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
        break;
      }
      case "delete": {
        if (!session?.sessionId) {
          setError("No active session");
          break;
        }
        const ok = window.confirm(
          "Delete this session from disk and leave chat? This cannot be undone.",
        );
        if (!ok) break;
        try {
          const next = await closeLiveSession(session.sessionId, true);
          clearPermissions();
          clearScroll();
          clearAttachments();
          useAppStore.getState().clearPromptQueue();
          if (next) {
            loadScrollForSession(next.sessionId);
            setSession(next);
            setStatus("ready");
            setView("chat");
            pushItem({
              id: nextId(),
              kind: "system",
              text: `Deleted session · switched to ${next.sessionId.slice(0, 8)}…`,
            });
          } else {
            await disconnectAgent();
            setSession(null);
            setStatus("disconnected");
            setView("welcome");
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
        break;
      }
      case "clear": {
        clearScroll();
        pushItem({ id: nextId(), kind: "system", text: "Scrollback cleared (local view only)." });
        break;
      }
      case "cancel": {
        try {
          await cancelTurn();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
        break;
      }
      case "export": {
        const wantsFile =
          !argTrim ||
          argTrim === "file" ||
          argTrim === "save" ||
          argTrim.endsWith(".md") ||
          argTrim.endsWith(".txt");
        if (wantsFile && argTrim !== "clipboard") {
          try {
            const result = await exportConversationToFile(
              items,
              argTrim.endsWith(".md") || argTrim.endsWith(".txt")
                ? argTrim
                : "grok-conversation.md",
            );
            if (result === "saved") {
              pushItem({
                id: nextId(),
                kind: "system",
                text: "Conversation exported to file.",
              });
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
          break;
        }
        try {
          await navigator.clipboard.writeText(conversationText(items));
          pushItem({ id: nextId(), kind: "system", text: "Conversation copied to clipboard." });
        } catch {
          setError("Clipboard write failed");
        }
        break;
      }
      case "history": {
        if (promptHistory.length === 0) {
          setError("No prompt history yet");
          break;
        }
        setHistoryOpen(true);
        break;
      }
      case "find": {
        setFindOpen(true);
        break;
      }
      case "multiline":
      case "ml": {
        const next = !multilineMode;
        setMultilineMode(next);
        try {
          const { getGuiSettings, setGuiSettings } = await import("../../shared/api");
          const s = await getGuiSettings();
          await setGuiSettings({ ...s, multilineMode: next });
        } catch {
          /* persist best-effort */
        }
        pushItem({
          id: nextId(),
          kind: "system",
          text: next
            ? "Multiline on · Enter = newline, Ctrl+Enter = send"
            : "Multiline off · Enter = send, Shift+Enter = newline",
        });
        break;
      }
      default:
        setError(`Unknown client command: /${name}`);
    }
  };

  const dispatchSend = useCallback(
    async (text: string, atts: string[]) => {
      const display =
        atts.length > 0
          ? `${text}${text ? "\n" : ""}${atts.map((a) => `@${a}`).join(" ")}`
          : text;
      pushItem({ id: nextId(), kind: "user", text: display || atts.map((a) => `@${a}`).join(" ") });
      if (text.trim()) {
        pushPromptHistory(text.trim());
        setHistIdx(-1);
        histDraftBackup.current = "";
      }
      setSending(true);
      setBusy(true);
      setError(null);
      try {
        await sendPrompt(text, atts);
        // Refresh disk signals after a completed turn.
        const sid = useAppStore.getState().session?.sessionId;
        if (sid) {
          void getSessionSignals(sid)
            .then((s) => {
              useAppStore.getState().setSignals(s);
              if (s.primaryModelId) {
                useAppStore.getState().setModelId(s.primaryModelId);
              }
            })
            .catch(() => undefined);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        pushItem({ id: nextId(), kind: "system", text: msg, level: "error" });
      } finally {
        setSending(false);
        setBusy(false);
      }
    },
    [pushItem, setBusy, setError, pushPromptHistory],
  );

  // Drain queue when free. Depend on length only so empty dequeues cannot loop.
  useEffect(() => {
    if (turnActive || draining.current || !ready) return;
    if (promptQueue.length === 0) return;
    const next = dequeuePrompt();
    if (!next) return;
    draining.current = true;
    void dispatchSend(next.text, next.attachments).finally(() => {
      draining.current = false;
    });
  }, [turnActive, ready, promptQueue.length, dequeuePrompt, dispatchSend]);

  const onSend = useCallback(async () => {
    const text = draft.trim();
    const atts = [...attachments];
    if ((!text && atts.length === 0) || !ready) return;

    // Client slash (with optional args) executed without queue / agent turn.
    if (text.startsWith("/") && atts.length === 0) {
      const m = text.match(/^\/([^\s]+)(?:\s+(.*))?$/);
      if (m) {
        const name = m[1].toLowerCase();
        const arg = (m[2] ?? "").trim();
        const cmd = slashCommands.find((c) => c.name === name);
        if (cmd?.source === "client") {
          setDraft("");
          await runClientCommand(name, arg);
          return;
        }
      }
    }

    setDraft("");
    clearAttachments();

    if (turnActive) {
      enqueuePrompt({ id: nextId(), text, attachments: atts });
      pushItem({
        id: nextId(),
        kind: "system",
        text: `Queued (${useAppStore.getState().promptQueue.length}): ${text.slice(0, 80)}${text.length > 80 ? "…" : ""}`,
      });
      return;
    }

    await dispatchSend(text, atts);
  }, [
    draft,
    attachments,
    ready,
    turnActive,
    slashCommands,
    setDraft,
    clearAttachments,
    enqueuePrompt,
    pushItem,
    dispatchSend,
  ]);

  const onCancel = useCallback(async () => {
    // Unlock UI immediately — do not wait for the in-flight session/prompt RPC.
    setSending(false);
    setBusy(false);
    useAppStore.getState().clearPromptQueue();
    pushItem({
      id: nextId(),
      kind: "system",
      text: "Cancelling turn…",
    });
    try {
      await cancelTurn();
      pushItem({
        id: nextId(),
        kind: "system",
        text: "Turn cancelled.",
      });
    } catch (e) {
      // Even if the agent ignores cancel, local waiters should already be released.
      setError(e instanceof Error ? e.message : String(e));
      pushItem({
        id: nextId(),
        kind: "system",
        text: "Cancel requested (agent may still wind down).",
        level: "error",
      });
    }
  }, [setError, setBusy, pushItem]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (palette && paletteItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, paletteItems.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const item = paletteItems[selectedIdx];
        if (!item) return;
        if (palette === "slash") void applySlash(item.data as SlashCommand);
        else applyAt(item.data as FileEntry);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPalette(null);
        return;
      }
    }

    // Prompt history: ↑/↓ when draft empty or already browsing history
    // (and cursor at start for up / end for down to avoid fighting multiline edit).
    const ta = taRef.current;
    const cursor = ta?.selectionStart ?? 0;
    const atStart = cursor === 0;
    const atEnd = cursor === draft.length;
    const browsing = histIdx >= 0;
    if (
      e.key === "ArrowUp" &&
      !e.shiftKey &&
      !e.altKey &&
      !e.metaKey &&
      !e.ctrlKey &&
      promptHistory.length > 0 &&
      (browsing || (draft.trim() === "" && atStart) || (atStart && draft === promptHistory[histIdx]))
    ) {
      e.preventDefault();
      if (histIdx < 0) {
        histDraftBackup.current = draft;
        const next = promptHistory.length - 1;
        setHistIdx(next);
        setDraft(promptHistory[next] ?? "");
      } else if (histIdx > 0) {
        const next = histIdx - 1;
        setHistIdx(next);
        setDraft(promptHistory[next] ?? "");
      }
      return;
    }
    if (
      e.key === "ArrowDown" &&
      !e.shiftKey &&
      !e.altKey &&
      !e.metaKey &&
      !e.ctrlKey &&
      histIdx >= 0 &&
      atEnd
    ) {
      e.preventDefault();
      if (histIdx < promptHistory.length - 1) {
        const next = histIdx + 1;
        setHistIdx(next);
        setDraft(promptHistory[next] ?? "");
      } else {
        // Past newest → restore pre-browse draft and exit history mode.
        setHistIdx(-1);
        setDraft(histDraftBackup.current);
        histDraftBackup.current = "";
      }
      return;
    }

    if (e.key === "Enter") {
      if (multilineMode) {
        // Enter = newline; Ctrl/Cmd+Enter = send
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          void onSend();
        }
        return;
      }
      // Default: Enter = send; Shift+Enter = newline
      if (!e.shiftKey) {
        e.preventDefault();
        void onSend();
      }
    }
  };

  return (
    <div
      style={{
        borderTop: "1px solid #2a3140",
        background: dragOver ? "#1a2438" : "#141820",
        padding: "12px 16px",
        position: "relative",
        outline: dragOver ? "1px dashed var(--gb-accent)" : "none",
        outlineOffset: -4,
      }}
      onDragOver={(e) => {
        // Browser-side drop (e.g. text); Tauri file drops use onDragDropEvent.
        if (e.dataTransfer?.types?.includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const cwd = (projectCwd || session?.cwd || "").replace(/\/+$/, "");
        const filesList = Array.from(e.dataTransfer?.files ?? []);
        for (const f of filesList) {
          // In browsers File has no path; Tauri may expose path on the object.
          const path =
            (f as File & { path?: string }).path ||
            (f as File & { webkitRelativePath?: string }).webkitRelativePath ||
            f.name;
          if (!path) continue;
          let rel = path;
          if (cwd && (path === cwd || path.startsWith(cwd + "/"))) {
            rel = path === cwd ? "." : path.slice(cwd.length + 1);
          }
          addAttachment(rel);
        }
      }}
    >
      {dragOver ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            color: "var(--gb-accent)",
            fontSize: 13,
            fontWeight: 600,
            background: "color-mix(in srgb, var(--gb-accent) 8%, transparent)",
            zIndex: 2,
          }}
        >
          Drop files to attach
        </div>
      ) : null}
      <div style={{ maxWidth: 896, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {attachments.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {attachments.map((a) => (
              <span
                key={a}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  borderRadius: 999,
                  border: "1px solid #2a3140",
                  background: "#0c0e12",
                  color: "#7c9cff",
                  fontSize: 12,
                  padding: "3px 8px",
                  fontFamily: "ui-monospace, Menlo, monospace",
                }}
              >
                @{a}
                <button
                  type="button"
                  onClick={() => removeAttachment(a)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#8b95a8",
                    cursor: "pointer",
                    padding: 0,
                    lineHeight: 1,
                  }}
                  aria-label={`Remove ${a}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {palette && (
          <div
            style={{
              position: "absolute",
              left: 16,
              right: 16,
              bottom: "100%",
              marginBottom: 4,
              maxWidth: 896,
              marginLeft: "auto",
              marginRight: "auto",
              maxHeight: 240,
              overflowY: "auto",
              borderRadius: 10,
              border: "1px solid #2a3140",
              background: "#0c0e12",
              boxShadow: "0 -8px 32px rgba(0,0,0,0.4)",
              zIndex: 20,
            }}
          >
            <div
              style={{
                padding: "6px 10px",
                fontSize: 11,
                color: "#8b95a8",
                borderBottom: "1px solid #2a3140",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {palette === "slash" ? "Commands" : filesLoading ? "Files…" : "Files"}
            </div>
            {paletteItems.length === 0 ? (
              <div style={{ padding: 12, fontSize: 13, color: "#8b95a8" }}>No matches</div>
            ) : (
              paletteItems.map((item, i) => (
                <button
                  key={item.key}
                  type="button"
                  onMouseEnter={() => setSelectedIdx(i)}
                  onClick={() => {
                    if (palette === "slash") void applySlash(item.data as SlashCommand);
                    else applyAt(item.data as FileEntry);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    borderBottom: "1px solid #1a1f2a",
                    background: i === selectedIdx ? "#1a1f2a" : "transparent",
                    color: "#e8ecf4",
                    padding: "8px 12px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</div>
                  {item.sub ? (
                    <div style={{ fontSize: 11, color: "#8b95a8", marginTop: 2 }}>{item.sub}</div>
                  ) : null}
                </button>
              ))
            )}
          </div>
        )}

        <textarea
          ref={taRef}
          style={
            {
              minHeight: 88,
              width: "100%",
              resize: "vertical",
              borderRadius: 12,
              border: "1px solid #2a3140",
              background: "#0c0e12",
              color: "#e8ecf4",
              padding: "10px 12px",
              fontSize: 15,
              outline: "none",
              opacity: ready ? 1 : 0.5,
            } as CSSProperties
          }
          placeholder={
            ready
              ? multilineMode
                ? "Message Grok…  / · @ · ↑ history · Enter newline · Ctrl+Enter send"
                : "Message Grok…  / · @ · ↑ history · Enter send · Shift+Enter newline"
              : "Connect to a project to start chatting"
          }
          value={draft}
          disabled={!ready}
          onChange={(e) => {
            setDraft(e.target.value);
            // Leave history browse mode when user edits freely.
            if (histIdx >= 0 && e.target.value !== promptHistory[histIdx]) {
              setHistIdx(-1);
              histDraftBackup.current = "";
            }
          }}
          onKeyDown={onKeyDown}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <p style={{ margin: 0, fontSize: 12, color: "#8b95a8" }}>
            {turnActive
              ? `Turn in progress…${promptQueue.length ? ` · ${promptQueue.length} queued` : ""}`
              : ready
                ? histIdx >= 0
                  ? `History ${histIdx + 1}/${promptHistory.length}`
                  : multilineMode
                    ? "Ready · multiline"
                    : "Ready"
                : "Not connected"}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            {turnActive ? (
              <button
                type="button"
                onClick={() => void onCancel()}
                style={{
                  ...secondaryBtn,
                  borderColor: "var(--gb-danger)",
                  color: "var(--gb-danger)",
                  fontWeight: 600,
                }}
                title="Stop the current turn (Esc)"
              >
                Stop
              </button>
            ) : null}
            <button
              type="button"
              disabled={!ready || (!draft.trim() && attachments.length === 0)}
              onClick={() => void onSend()}
              style={{
                ...primaryBtn,
                opacity: !ready || (!draft.trim() && attachments.length === 0) ? 0.4 : 1,
                cursor:
                  !ready || (!draft.trim() && attachments.length === 0) ? "not-allowed" : "pointer",
              }}
            >
              {turnActive ? "Queue" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const secondaryBtn: CSSProperties = {
  borderRadius: 8,
  border: "1px solid #2a3140",
  background: "transparent",
  color: "#8b95a8",
  padding: "6px 12px",
  fontSize: 13,
  cursor: "pointer",
};

const primaryBtn: CSSProperties = {
  borderRadius: 8,
  border: "none",
  background: "#7c9cff",
  color: "#0c0e12",
  padding: "6px 16px",
  fontSize: 13,
  fontWeight: 600,
};
