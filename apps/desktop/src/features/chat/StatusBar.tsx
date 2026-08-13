import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  disconnectAgent,
  getPlanModeState,
  getSessionPlan,
  getSessionSignals,
  newSession,
  sendPrompt,
} from "../../shared/api";
import { nextId, useAppStore } from "../../shared/store";
import type { SessionMode } from "../../shared/types";

const MODE_CYCLE: SessionMode[] = ["ask", "auto", "plan", "yolo"];

function modeLabel(m: SessionMode): string {
  switch (m) {
    case "ask":
      return "Ask";
    case "auto":
      return "Auto";
    case "plan":
      return "Plan";
    case "yolo":
      return "Yolo";
  }
}

function modeColor(m: SessionMode): string {
  switch (m) {
    case "ask":
      return "var(--gb-ink-muted)";
    case "auto":
      return "var(--gb-accent)";
    case "plan":
      return "var(--gb-warning)";
    case "yolo":
      return "var(--gb-danger)";
  }
}

type BarBtn = {
  key: string;
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  warn?: boolean;
  accent?: boolean;
  /** Keep visible even when the bar is compact. */
  keep?: boolean;
};

export function StatusBar() {
  const status = useAppStore((s) => s.status);
  const session = useAppStore((s) => s.session);
  const env = useAppStore((s) => s.env);
  const error = useAppStore((s) => s.error);
  const busy = useAppStore((s) => s.busy);
  const setStatus = useAppStore((s) => s.setStatus);
  const setSession = useAppStore((s) => s.setSession);
  const clearPermissions = useAppStore((s) => s.clearPermissions);
  const clearScroll = useAppStore((s) => s.clearScroll);
  const pushItem = useAppStore((s) => s.pushItem);
  const setError = useAppStore((s) => s.setError);
  const setView = useAppStore((s) => s.setView);
  const view = useAppStore((s) => s.view);
  const liveSessions = useAppStore((s) => s.liveSessions);
  const modelId = useAppStore((s) => s.modelId);
  const effort = useAppStore((s) => s.effort);
  const lastTokens = useAppStore((s) => s.lastTokens);
  const lastUsage = useAppStore((s) => s.lastUsage);
  const signals = useAppStore((s) => s.signals);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen);
  const setContextOpen = useAppStore((s) => s.setContextOpen);
  const setModelsOpen = useAppStore((s) => s.setModelsOpen);
  const setSignals = useAppStore((s) => s.setSignals);
  const terminalsOpen = useAppStore((s) => s.terminalsOpen);
  const setTerminalsOpen = useAppStore((s) => s.setTerminalsOpen);
  const setHistoryOpen = useAppStore((s) => s.setHistoryOpen);
  const setExtensionsOpen = useAppStore((s) => s.setExtensionsOpen);
  const setAgentsOpen = useAppStore((s) => s.setAgentsOpen);
  const setAutomationOpen = useAppStore((s) => s.setAutomationOpen);
  const setMemoryOpen = useAppStore((s) => s.setMemoryOpen);
  const setAccountOpen = useAppStore((s) => s.setAccountOpen);
  const setAccountTab = useAppStore((s) => s.setAccountTab);
  const setHelpOpen = useAppStore((s) => s.setHelpOpen);
  const setProjectConfigOpen = useAppStore((s) => s.setProjectConfigOpen);
  const terminals = useAppStore((s) => s.terminals);
  const automationJobs = useAppStore((s) => s.automationJobs);
  const rewindTurns = useAppStore((s) => s.rewindTurns);
  const setBusy = useAppStore((s) => s.setBusy);
  const sessionMode = useAppStore((s) => s.sessionMode);
  const setSessionMode = useAppStore((s) => s.setSessionMode);
  const setPlanOpen = useAppStore((s) => s.setPlanOpen);
  const setPlanMarkdown = useAppStore((s) => s.setPlanMarkdown);
  const setPlanModeState = useAppStore((s) => s.setPlanModeState);
  const setAlwaysApprove = useAppStore((s) => s.setAlwaysApprove);

  const headerRef = useRef<HTMLElement>(null);
  const [compact, setCompact] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth;
      setCompact(w < 1100);
      setNarrow(w < 720);
    });
    ro.observe(el);
    setCompact(el.clientWidth < 1100);
    setNarrow(el.clientWidth < 720);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  const goHome = async () => {
    await disconnectAgent();
    setSession(null);
    setStatus("disconnected");
    clearPermissions();
    clearScroll();
    setView("welcome");
  };

  const onNew = async () => {
    try {
      clearScroll();
      clearPermissions();
      const s = await newSession();
      setSession(s);
      setStatus("ready");
      setView("chat");
      pushItem({
        id: nextId(),
        kind: "system",
        text: `New session · ${s.sessionId.slice(0, 8)}…`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const statusColor =
    status === "ready"
      ? "var(--gb-success)"
      : status === "connecting"
        ? "var(--gb-warning)"
        : status === "error"
          ? "var(--gb-danger)"
          : "var(--gb-ink-muted)";

  const used =
    signals?.contextTokensUsed ?? lastUsage?.totalTokens ?? lastTokens;
  const windowTok = signals?.contextWindowTokens ?? 0;
  const usagePct =
    signals?.usagePercent ??
    (windowTok > 0 && used != null ? (used / windowTok) * 100 : null);
  const turnHint =
    lastUsage &&
    (lastUsage.inputTokens != null || lastUsage.outputTokens != null)
      ? `Last turn · in ${lastUsage.inputTokens?.toLocaleString() ?? "—"} · out ${lastUsage.outputTokens?.toLocaleString() ?? "—"}${
          lastUsage.apiDurationMs != null
            ? ` · ${(lastUsage.apiDurationMs / 1000).toFixed(1)}s`
            : ""
        }`
      : null;

  const openContext = () => {
    setContextOpen(true);
    if (session?.sessionId) {
      void getSessionSignals(session.sessionId)
        .then(setSignals)
        .catch(() => undefined);
    }
  };

  const onCompact = async () => {
    if (!session || busy || status !== "ready") return;
    pushItem({
      id: nextId(),
      kind: "system",
      text: "Compacting context…",
    });
    try {
      setBusy(true);
      await sendPrompt("/compact");
      void getSessionSignals(session.sessionId)
        .then(setSignals)
        .catch(() => undefined);
      setContextOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onRewind = async () => {
    if (!session || busy || status !== "ready") return;
    const removed = rewindTurns(1);
    if (removed === 0) {
      setError("Nothing to rewind");
      return;
    }
    pushItem({
      id: nextId(),
      kind: "system",
      text: `Local scroll rewound (${removed} items). Asking agent to /rewind…`,
    });
    try {
      setBusy(true);
      await sendPrompt("/rewind");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const applyMode = async (next: SessionMode) => {
    if (!session || status !== "ready") return;
    const prev = sessionMode;
    setSessionMode(next);
    if (next === "yolo") setAlwaysApprove(true);
    else if (prev === "yolo") setAlwaysApprove(false);

    const slash =
      next === "plan"
        ? "/plan"
        : next === "auto"
          ? "/auto"
          : next === "yolo"
            ? "/always-approve"
            : prev === "plan"
              ? "/plan"
              : prev === "auto"
                ? "/auto"
                : prev === "yolo"
                  ? "/always-approve"
                  : null;

    pushItem({
      id: nextId(),
      kind: "system",
      text: `Mode → ${modeLabel(next)}${slash ? ` (${slash})` : ""}`,
    });

    if (!slash) return;
    try {
      if (!busy) setBusy(true);
      await sendPrompt(slash);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSessionMode(prev);
    } finally {
      setBusy(false);
    }
  };

  const cycleMode = () => {
    const idx = MODE_CYCLE.indexOf(sessionMode);
    const next = MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
    void applyMode(next);
  };

  const openPlan = async () => {
    if (!session) return;
    setPlanOpen(true);
    try {
      const [md, mode] = await Promise.all([
        getSessionPlan(session.sessionId),
        getPlanModeState(session.sessionId),
      ]);
      setPlanMarkdown(md);
      setPlanModeState(mode);
      if (mode?.state && /active|pending/i.test(mode.state)) {
        setSessionMode("plan");
      }
    } catch {
      /* best-effort */
    }
  };

  const runningTerms = terminals.filter((t) => t.running).length;
  const activeJobs = automationJobs.filter((j) => j.status === "active").length;
  const liveTasks = runningTerms + activeJobs;

  const actionBtns: BarBtn[] = [];
  if (session || terminals.length > 0 || automationJobs.length > 0) {
    actionBtns.push({
      key: "tasks",
      label: liveTasks > 0 ? `Tasks (${liveTasks})` : "Tasks",
      title: "Automation hub — tasks, loops, goals, workflows (/tasks)",
      onClick: () => setAutomationOpen(true),
      warn: liveTasks > 0,
      keep: true,
    });
  }
  if (session || terminals.length > 0) {
    actionBtns.push({
      key: "term",
      label: terminals.length ? `Term (${terminals.length})` : "Term",
      title: "Agent terminals (/terminal)",
      onClick: () => setTerminalsOpen(!terminalsOpen),
      accent: terminalsOpen,
      warn: runningTerms > 0,
      keep: true,
    });
  }
  actionBtns.push(
    {
      key: "rules",
      label: "Rules",
      title: "Project rules (AGENTS.md) & custom models",
      onClick: () => setProjectConfigOpen(true),
    },
    {
      key: "help",
      label: "Help",
      title: "Help & docs (/docs, /help)",
      onClick: () => setHelpOpen(true),
    },
    {
      key: "shortcuts",
      label: "?",
      title: "Shortcuts (Ctrl+/)",
      onClick: () => setShortcutsOpen(true),
    },
    {
      key: "extensions",
      label: "Extensions",
      title: "Extensions hub — MCP, skills, plugins, hooks",
      onClick: () => setExtensionsOpen(true),
    },
    {
      key: "agents",
      label: "Agents",
      title: "Agents & personas (/agents, /personas)",
      onClick: () => setAgentsOpen(true),
    },
    {
      key: "memory",
      label: "Memory",
      title: "Memory & media (/memory)",
      onClick: () => setMemoryOpen(true),
    },
    {
      key: "account",
      label: "Account",
      title: "Account & safety — login, privacy, sandbox, doctor",
      onClick: () => setAccountOpen(true),
    },
    {
      key: "settings",
      label: "Settings",
      title: "Settings (Ctrl+,)",
      onClick: () => setSettingsOpen(true),
      keep: true,
    },
  );
  if ((session || liveSessions.length > 0) && view !== "welcome") {
    actionBtns.push({
      key: "dashboard",
      label: liveSessions.length ? `Dashboard (${liveSessions.length})` : "Dashboard",
      title: "Multi-agent dashboard",
      onClick: () => setView("dashboard"),
      keep: true,
    });
  }
  if (session) {
    actionBtns.push(
      {
        key: "plan",
        label: "Plan",
        title: "View / edit plan.md (/view-plan)",
        onClick: () => void openPlan(),
        warn: sessionMode === "plan",
        keep: true,
      },
      {
        key: "compact",
        label: "Compact",
        title: "Compress context (/compact)",
        onClick: () => void onCompact(),
        disabled: busy || status !== "ready",
      },
      {
        key: "rewind",
        label: "Rewind",
        title: "Undo last turn (/rewind)",
        onClick: () => void onRewind(),
        disabled: busy || status !== "ready",
      },
      {
        key: "history",
        label: "History",
        title: "Prompt history (/history)",
        onClick: () => setHistoryOpen(true),
      },
      {
        key: "new",
        label: "New",
        title: "New session",
        onClick: () => void onNew(),
        keep: true,
      },
      {
        key: "home",
        label: "Home",
        title: "Home",
        onClick: () => void goHome(),
        keep: true,
      },
    );
  }

  const visibleBtns = compact
    ? actionBtns.filter((b) => b.keep)
    : actionBtns;
  const overflowBtns = compact
    ? actionBtns.filter((b) => !b.keep)
    : [];

  const chip: CSSProperties = {
    fontSize: 11,
    border: "1px solid var(--gb-border)",
    borderRadius: 6,
    background: "var(--gb-surface)",
    color: "var(--gb-ink-muted)",
    padding: "2px 8px",
    cursor: "pointer",
    fontFamily: "ui-monospace, Menlo, monospace",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
    maxWidth: "100%",
    minWidth: 0,
  };

  return (
    <header
      ref={headerRef}
      className="gb-statusbar"
      data-compact={compact ? "1" : "0"}
      data-narrow={narrow ? "1" : "0"}
    >
      {/* Brand — never shrink or get painted over */}
      <div className="gb-statusbar-brand" title={env?.binaryVersion ? `Grok CLI ${env.binaryVersion}` : "KayG"}>
        <img
          className="gb-statusbar-mark"
          src="/kayg-logo.svg"
          alt=""
          width={30}
          height={30}
          draggable={false}
        />
        <span className="gb-statusbar-brand-copy">
          <span className="gb-statusbar-logo">KayG</span>
          {env?.binaryVersion && !narrow ? (
            <span className="gb-statusbar-version" title="Grok CLI version">
              {env.binaryVersion}
            </span>
          ) : null}
        </span>
      </div>

      {/* Session meta chips */}
      <div className="gb-statusbar-meta">
        <span className="gb-statusbar-status" title={status + (busy ? " · working" : "")}>
          <span className="gb-statusbar-dot" style={{ background: statusColor }} />
          <span className="gb-statusbar-status-text">
            {status}
            {busy ? " · working" : ""}
          </span>
        </span>

        {session || modelId ? (
          <button
            type="button"
            onClick={() => setModelsOpen(true)}
            title="Model & effort — click to change (/model, /effort)"
            style={{ ...chip, color: "var(--gb-accent)" }}
          >
            <span className="gb-statusbar-ellipsis">{modelId || "model"}</span>
            {effort ? (
              <span style={{ color: "var(--gb-ink-muted)", textTransform: "capitalize" }}>
                · {effort}
              </span>
            ) : null}
          </button>
        ) : null}

        {session ? (
          <button
            type="button"
            onClick={cycleMode}
            onContextMenu={(e) => {
              e.preventDefault();
              setAccountTab("safety");
              setAccountOpen(true);
            }}
            disabled={status !== "ready"}
            title="Cycle mode: Ask · Auto · Plan · Yolo. Right-click → permission settings."
            style={{
              ...chip,
              fontWeight: 600,
              color: modeColor(sessionMode),
              borderColor: modeColor(sessionMode),
              opacity: status !== "ready" ? 0.5 : 1,
              cursor: status !== "ready" ? "not-allowed" : "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {modeLabel(sessionMode)}
          </button>
        ) : null}

        {used != null || usagePct != null ? (
          <button
            type="button"
            onClick={openContext}
            title={
              turnHint
                ? `${turnHint}\nClick for context panel (/context)`
                : "Context usage — click for details (/context)"
            }
            style={chip}
          >
            {usagePct != null ? (
              <span
                style={{
                  width: 28,
                  height: 6,
                  borderRadius: 999,
                  flexShrink: 0,
                  background: `linear-gradient(90deg, ${
                    usagePct >= 85
                      ? "var(--gb-danger)"
                      : usagePct >= 60
                        ? "var(--gb-warning)"
                        : "var(--gb-success)"
                  } ${Math.min(100, usagePct)}%, var(--gb-surface-overlay) ${Math.min(100, usagePct)}%)`,
                  display: "inline-block",
                }}
              />
            ) : null}
            <span className="gb-statusbar-ellipsis">
              {used != null ? `${used.toLocaleString()} tok` : ""}
              {usagePct != null ? ` ${usagePct.toFixed(0)}%` : ""}
            </span>
          </button>
        ) : session ? (
          <button type="button" style={chip} onClick={openContext} title="Context / session info">
            Context
          </button>
        ) : null}

        {session && !narrow ? (
          <span
            className="gb-statusbar-cwd"
            title={`${session.cwd}\n${session.sessionId}`}
          >
            {session.cwd}
          </span>
        ) : null}

        {error ? (
          <span className="gb-statusbar-error" title={error}>
            {error}
          </span>
        ) : null}
      </div>

      {/* Actions — wrap; secondary go to More when compact */}
      <div className="gb-statusbar-actions">
        {visibleBtns.map((b) => (
          <BarButton key={b.key} btn={b} />
        ))}
        {overflowBtns.length > 0 ? (
          <div className="gb-statusbar-more" ref={moreRef}>
            <button
              type="button"
              className="gb-statusbar-btn"
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              title="More actions"
              onClick={() => setMoreOpen((v) => !v)}
            >
              More ▾
            </button>
            {moreOpen ? (
              <div className="gb-statusbar-more-menu" role="menu">
                {overflowBtns.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    role="menuitem"
                    disabled={b.disabled}
                    title={b.title}
                    className="gb-statusbar-more-item"
                    onClick={() => {
                      setMoreOpen(false);
                      if (!b.disabled) b.onClick();
                    }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}

function BarButton({ btn }: { btn: BarBtn }) {
  return (
    <button
      type="button"
      className="gb-statusbar-btn"
      disabled={btn.disabled}
      title={btn.title}
      onClick={btn.onClick}
      data-warn={btn.warn ? "1" : undefined}
      data-accent={btn.accent ? "1" : undefined}
    >
      {btn.label}
    </button>
  );
}
