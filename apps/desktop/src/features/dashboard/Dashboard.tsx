import { useState, type CSSProperties } from "react";
import {
  cancelLiveSession,
  closeLiveSession,
  dispatchSession,
  pinLiveSession,
  renameLiveSession,
  switchSession,
} from "../../shared/api";
import { nextId, useAppStore } from "../../shared/store";
import type { LiveSession } from "../../shared/types";

function stateColor(state: string): string {
  switch (state) {
    case "working":
      return "#f0b429";
    case "needsInput":
      return "#7c9cff";
    case "failed":
      return "#f07178";
    default:
      return "#3dd68c";
  }
}

function stateLabel(state: string): string {
  if (state === "needsInput") return "needs input";
  return state;
}

export function Dashboard() {
  const liveSessions = useAppStore((s) => s.liveSessions);
  const session = useAppStore((s) => s.session);
  const projectCwd = useAppStore((s) => s.projectCwd);
  const setSession = useAppStore((s) => s.setSession);
  const setView = useAppStore((s) => s.setView);
  const setError = useAppStore((s) => s.setError);
  const setStatus = useAppStore((s) => s.setStatus);
  const pushItem = useAppStore((s) => s.pushItem);
  const loadScrollForSession = useAppStore((s) => s.loadScrollForSession);
  const clearScroll = useAppStore((s) => s.clearScroll);

  const [dispatchText, setDispatchText] = useState("");
  const [busy, setBusy] = useState(false);

  const onAttach = async (s: LiveSession) => {
    try {
      const st = await switchSession(s.sessionId);
      loadScrollForSession(s.sessionId);
      setSession(st);
      setStatus("ready");
      setView("chat");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onDispatch = async () => {
    const prompt = dispatchText.trim();
    setBusy(true);
    try {
      const st = await dispatchSession({
        cwd: projectCwd || session?.cwd || null,
        prompt: prompt || null,
        title: prompt ? prompt.slice(0, 48) : null,
      });
      setDispatchText("");
      clearScroll();
      setSession(st);
      setStatus("ready");
      setView("chat");
      if (prompt) {
        pushItem({ id: nextId(), kind: "user", text: prompt }, st.sessionId);
      } else {
        pushItem(
          {
            id: nextId(),
            kind: "system",
            text: `Dispatched · ${st.sessionId.slice(0, 8)}…`,
          },
          st.sessionId,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onPin = async (s: LiveSession) => {
    try {
      await pinLiveSession(s.sessionId, !s.pinned);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onRename = async (s: LiveSession) => {
    const title = prompt("Rename agent", s.title);
    if (!title?.trim()) return;
    try {
      await renameLiveSession(s.sessionId, title.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onStop = async (s: LiveSession) => {
    try {
      await cancelLiveSession(s.sessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onClose = async (s: LiveSession, deleteDisk: boolean) => {
    if (deleteDisk && !confirm(`Delete session “${s.title}” from disk?`)) return;
    try {
      const next = await closeLiveSession(s.sessionId, deleteDisk);
      if (session?.sessionId === s.sessionId) {
        if (next) {
          loadScrollForSession(next.sessionId);
          setSession(next);
        } else {
          setSession(null);
          setView("dashboard");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        padding: 24,
        background: "#0c0e12",
        color: "#e8ecf4",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Dashboard</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#8b95a8" }}>
              Live agents in this process · {liveSessions.length} session
              {liveSessions.length === 1 ? "" : "s"}
            </p>
          </div>
          <button type="button" style={btn} onClick={() => setView(session ? "chat" : "welcome")}>
            {session ? "Back to chat" : "Home"}
          </button>
        </div>

        <div
          style={{
            borderRadius: 12,
            border: "1px solid #2a3140",
            background: "#141820",
            padding: 14,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "#8b95a8",
              marginBottom: 8,
            }}
          >
            Dispatch new agent
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={dispatchText}
              onChange={(e) => setDispatchText(e.target.value)}
              placeholder="Optional seed prompt…"
              onKeyDown={(e) => {
                if (e.key === "Enter") void onDispatch();
              }}
              style={{
                flex: 1,
                borderRadius: 8,
                border: "1px solid #2a3140",
                background: "#0c0e12",
                color: "#e8ecf4",
                padding: "8px 12px",
                fontSize: 14,
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void onDispatch()}
              style={{ ...primary, opacity: busy ? 0.5 : 1 }}
            >
              {busy ? "…" : "Dispatch"}
            </button>
          </div>
        </div>

        {liveSessions.length === 0 ? (
          <p style={{ color: "#8b95a8", fontSize: 14 }}>
            No live sessions. Open a session from Home or dispatch one above.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {liveSessions.map((s) => {
              const active = session?.sessionId === s.sessionId;
              return (
                <li
                  key={s.sessionId}
                  style={{
                    borderRadius: 10,
                    border: active ? "1px solid #7c9cff" : "1px solid #2a3140",
                    background: "#141820",
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {s.pinned ? (
                          <span style={{ color: "#f0b429", fontSize: 12 }}>📌</span>
                        ) : null}
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: stateColor(s.state),
                            display: "inline-block",
                          }}
                        />
                        <strong
                          style={{
                            fontSize: 14,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {s.title}
                        </strong>
                        <span style={{ fontSize: 11, color: "#8b95a8" }}>
                          {stateLabel(s.state)}
                          {s.activity && s.state === "working" ? ` · ${s.activity}` : ""}
                        </span>
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 11,
                          color: "#8b95a8",
                          fontFamily: "ui-monospace, Menlo, monospace",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={s.cwd}
                      >
                        {s.cwd}
                      </div>
                      <div style={{ marginTop: 2, fontSize: 11, color: "#8b95a8" }}>
                        {s.sessionId.slice(0, 8)}…
                      </div>
                    </div>
                    {/* Live activity line doubles as subagent hint when working */}
                    {s.state === "working" && s.activity ? (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 11,
                          color: "var(--gb-warning)",
                        }}
                      >
                        Activity: {s.activity}
                        {s.activity.toLowerCase().includes("agent") ||
                        s.activity.toLowerCase().includes("tool")
                          ? " · open chat to see subagents strip"
                          : ""}
                      </div>
                    ) : null}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-start" }}>
                      <button type="button" style={btn} onClick={() => void onAttach(s)}>
                        Open
                      </button>
                      <button type="button" style={btn} onClick={() => void onPin(s)}>
                        {s.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button type="button" style={btn} onClick={() => void onRename(s)}>
                        Rename
                      </button>
                      {s.state === "working" ? (
                        <button type="button" style={btn} onClick={() => void onStop(s)}>
                          Stop
                        </button>
                      ) : null}
                      <button type="button" style={btn} onClick={() => void onClose(s, false)}>
                        Close
                      </button>
                      <button
                        type="button"
                        style={{ ...btn, color: "#f07178" }}
                        onClick={() => void onClose(s, true)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

const btn: CSSProperties = {
  borderRadius: 6,
  border: "1px solid #2a3140",
  background: "#1a1f2a",
  color: "#e8ecf4",
  padding: "5px 8px",
  fontSize: 12,
  cursor: "pointer",
};

const primary: CSSProperties = {
  ...btn,
  background: "#7c9cff",
  color: "#0c0e12",
  border: "none",
  fontWeight: 600,
  padding: "8px 14px",
};
