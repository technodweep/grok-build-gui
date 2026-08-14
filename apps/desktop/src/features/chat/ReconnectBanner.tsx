import { useState, type CSSProperties } from "react";
import { connectAgent, getSessionHistory } from "../../shared/api";
import {
  HISTORY_INITIAL_LIMIT,
  hydrateHistoryReplace,
} from "../../shared/historyHydrate";
import { nextId, useAppStore } from "../../shared/store";

export function ReconnectBanner() {
  const status = useAppStore((s) => s.status);
  const session = useAppStore((s) => s.session);
  const projectCwd = useAppStore((s) => s.projectCwd);
  const alwaysApprove = useAppStore((s) => s.alwaysApprove);
  const setSession = useAppStore((s) => s.setSession);
  const setStatus = useAppStore((s) => s.setStatus);
  const setError = useAppStore((s) => s.setError);
  const setView = useAppStore((s) => s.setView);
  const pushItem = useAppStore((s) => s.pushItem);
  const clearPermissions = useAppStore((s) => s.clearPermissions);
  const clearScroll = useAppStore((s) => s.clearScroll);
  const setSuppressHistoryUpdates = useAppStore((s) => s.setSuppressHistoryUpdates);
  const [working, setWorking] = useState(false);

  const needsReconnect =
    !!session && (status === "disconnected" || status === "error");

  if (!needsReconnect || !session) return null;

  const cwd = projectCwd || session.cwd;

  const onReconnect = async (resume: boolean) => {
    if (!cwd) {
      setError("No project folder to reconnect");
      return;
    }
    setWorking(true);
    setStatus("connecting");
    setError(null);
    clearPermissions();
    const { setSessionBoot, patchSessionBoot } = useAppStore.getState();
    setSessionBoot({
      kind: resume ? "reconnect" : "new",
      title: resume ? "Resume after disconnect" : "New session after disconnect",
      detail: "Starting agent process…",
      meta: cwd,
    });
    try {
      const resumeId = resume ? session.sessionId : null;
      if (!resume) {
        clearScroll();
      } else {
        setSuppressHistoryUpdates(true);
      }
      patchSessionBoot({
        detail: resume
          ? "Reconnecting over ACP & loading session…"
          : "Connecting over ACP…",
      });
      const next = await connectAgent({
        cwd,
        alwaysApprove,
        resumeSessionId: resumeId,
      });
      setSession(next);
      setStatus("ready");
      setView("chat");
      if (resume) {
        patchSessionBoot({ detail: "Loading conversation history…" });
        try {
          const page = await getSessionHistory(
            next.sessionId,
            HISTORY_INITIAL_LIMIT,
            0,
          );
          hydrateHistoryReplace(next.sessionId, page, {
            seedPromptHistory: true,
          });
        } catch {
          /* keep existing scroll */
        }
        window.setTimeout(() => setSuppressHistoryUpdates(false), 1500);
      }
      pushItem({
        id: nextId(),
        kind: "system",
        text: resume
          ? `Reconnected · resumed ${next.sessionId.slice(0, 8)}…`
          : `Reconnected · new session ${next.sessionId.slice(0, 8)}…`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("error");
      setError(msg);
      setSuppressHistoryUpdates(false);
    } finally {
      setWorking(false);
      useAppStore.getState().setSessionBoot(null);
    }
  };

  const onDismiss = () => {
    setSession(null);
    setView("welcome");
    setError(null);
  };

  return (
    <div
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 16px",
        borderBottom: "1px solid var(--gb-border)",
        background: "color-mix(in srgb, var(--gb-danger) 12%, var(--gb-surface-raised))",
        color: "var(--gb-ink)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>Agent disconnected</div>
        <div
          style={{
            fontSize: 12,
            color: "var(--gb-ink-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={cwd}
        >
          Scrollback kept · {cwd}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button type="button" style={ghost} disabled={working} onClick={onDismiss}>
          Welcome
        </button>
        <button
          type="button"
          style={secondary}
          disabled={working}
          onClick={() => void onReconnect(false)}
          title="Start a fresh session in the same project"
        >
          {working ? "…" : "New session"}
        </button>
        <button
          type="button"
          style={primary}
          disabled={working}
          onClick={() => void onReconnect(true)}
          title="Resume this session id via session/load"
        >
          {working ? "Reconnecting…" : "Resume"}
        </button>
      </div>
    </div>
  );
}

const ghost: CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "transparent",
  color: "var(--gb-ink-muted)",
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
};

const secondary: CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface-overlay)",
  color: "var(--gb-ink)",
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
};

const primary: CSSProperties = {
  borderRadius: 8,
  border: "none",
  background: "var(--gb-accent)",
  color: "var(--gb-surface)",
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
