import { type CSSProperties } from "react";
import { disconnectAgent, getSessionSignals, newSession } from "../../shared/api";
import { nextId, useAppStore } from "../../shared/store";

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
  const terminals = useAppStore((s) => s.terminals);
  const terminalsOpen = useAppStore((s) => s.terminalsOpen);
  const setTerminalsOpen = useAppStore((s) => s.setTerminalsOpen);

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

  const btn: CSSProperties = {
    borderRadius: 6,
    border: "1px solid var(--gb-border)",
    background: "var(--gb-surface-overlay)",
    color: "var(--gb-ink)",
    padding: "4px 8px",
    fontSize: 12,
    cursor: "pointer",
  };

  return (
    <header
      style={{
        height: 48,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid var(--gb-border)",
        background: "var(--gb-surface-raised)",
        padding: "0 16px",
        color: "var(--gb-ink)",
        flexShrink: 0,
        gap: 8,
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0, flex: 1 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Grok Build</span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--gb-ink-muted)",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: statusColor,
              display: "inline-block",
            }}
          />
          {status}
          {busy ? " · working" : null}
        </span>
        {session || modelId ? (
          <button
            type="button"
            onClick={() => setModelsOpen(true)}
            title="Model & effort — click to change (/model, /effort)"
            style={{
              fontSize: 11,
              color: "var(--gb-accent)",
              fontFamily: "ui-monospace, Menlo, monospace",
              border: "1px solid var(--gb-border)",
              borderRadius: 6,
              background: "var(--gb-surface)",
              padding: "2px 8px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>{modelId || "model"}</span>
            {effort ? (
              <span style={{ color: "var(--gb-ink-muted)", textTransform: "capitalize" }}>
                · {effort}
              </span>
            ) : null}
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
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              border: "1px solid var(--gb-border)",
              borderRadius: 6,
              background: "var(--gb-surface)",
              color: "var(--gb-ink-muted)",
              fontSize: 11,
              padding: "2px 8px",
              cursor: "pointer",
              fontFamily: "ui-monospace, Menlo, monospace",
            }}
          >
            {usagePct != null ? (
              <span
                style={{
                  width: 36,
                  height: 6,
                  borderRadius: 999,
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
            {used != null ? `${used.toLocaleString()} tok` : ""}
            {usagePct != null ? ` ${usagePct.toFixed(0)}%` : ""}
          </button>
        ) : session ? (
          <button type="button" style={btn} onClick={openContext} title="Context / session info">
            Context
          </button>
        ) : null}
        {session ? (
          <span
            style={{
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 11,
              color: "var(--gb-ink-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 280,
            }}
            title={`${session.cwd}\n${session.sessionId}`}
          >
            {session.cwd}
          </span>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          color: "var(--gb-ink-muted)",
          flexShrink: 0,
        }}
      >
        {error ? (
          <span
            style={{
              maxWidth: 160,
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: "var(--gb-danger)",
            }}
            title={error}
          >
            {error}
          </span>
        ) : null}
        {env?.binaryVersion ? <span title="CLI version">{env.binaryVersion}</span> : null}
        {session || terminals.length > 0 ? (
          <button
            type="button"
            style={{
              ...btn,
              borderColor: terminalsOpen ? "var(--gb-accent-dim)" : "var(--gb-border)",
              color: terminals.some((t) => t.running)
                ? "var(--gb-warning)"
                : "var(--gb-ink)",
            }}
            onClick={() => setTerminalsOpen(!terminalsOpen)}
            title="Agent terminals (/terminal)"
          >
            Term{terminals.length ? ` (${terminals.length})` : ""}
          </button>
        ) : null}
        <button type="button" style={btn} onClick={() => setShortcutsOpen(true)} title="Shortcuts (Ctrl+/)">
          ?
        </button>
        <button type="button" style={btn} onClick={() => setSettingsOpen(true)} title="Settings (Ctrl+,)">
          Settings
        </button>
        {(session || liveSessions.length > 0) && view !== "welcome" ? (
          <button
            type="button"
            style={btn}
            onClick={() => setView("dashboard")}
            title="Multi-agent dashboard"
          >
            Dashboard{liveSessions.length ? ` (${liveSessions.length})` : ""}
          </button>
        ) : null}
        {session ? (
          <>
            <button type="button" style={btn} onClick={() => void onNew()} title="New session">
              New
            </button>
            <button type="button" style={btn} onClick={() => void goHome()} title="Home">
              Home
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}
