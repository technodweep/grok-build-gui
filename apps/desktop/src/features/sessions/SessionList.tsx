import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  connectAgent,
  deleteDiskSession,
  getSessionHistory,
  listAgentSessions,
  listDiskSessions,
  renameDiskSession,
} from "../../shared/api";
import { nextId, useAppStore } from "../../shared/store";
import type { DiskSession, HistoryItem } from "../../shared/types";

function formatWhen(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function hydrateHistory(items: HistoryItem[]) {
  const pushItem = useAppStore.getState().pushItem;
  const upsertTool = useAppStore.getState().upsertTool;
  const pushPromptHistory = useAppStore.getState().pushPromptHistory;
  for (const h of items) {
    if (h.kind === "user") {
      pushItem({ id: nextId(), kind: "user", text: h.text });
      if (h.text?.trim()) pushPromptHistory(h.text.trim());
    } else if (h.kind === "agent") {
      pushItem({ id: nextId(), kind: "agent", text: h.text });
    } else if (h.kind === "thought") {
      pushItem({ id: nextId(), kind: "thought", text: h.text });
    } else if (h.kind === "tool") {
      upsertTool({
        toolCallId: h.toolCallId || nextId(),
        title: h.title || "tool",
        status: h.status || "completed",
        toolKind: h.toolKind || undefined,
      });
    }
  }
}

export function SessionList({
  projectCwd,
  alwaysApprove,
}: {
  projectCwd: string;
  alwaysApprove: boolean;
}) {
  const [sessions, setSessions] = useState<DiskSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterAll, setFilterAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [source, setSource] = useState<"disk" | "merged">("disk");

  const setSession = useAppStore((s) => s.setSession);
  const setStatus = useAppStore((s) => s.setStatus);
  const setError = useAppStore((s) => s.setError);
  const clearScroll = useAppStore((s) => s.clearScroll);
  const pushItem = useAppStore((s) => s.pushItem);
  const setProjectCwd = useAppStore((s) => s.setProjectCwd);
  const setView = useAppStore((s) => s.setView);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const disk = await listDiskSessions(filterAll ? null : projectCwd || null);
      const byId = new Map(disk.map((s) => [s.id, s]));
      // Merge ACP session/list (live or short-lived agent) for titles/currency.
      try {
        const agent = await listAgentSessions(filterAll ? null : projectCwd || null);
        for (const a of agent) {
          const existing = byId.get(a.sessionId);
          if (existing) {
            byId.set(a.sessionId, {
              ...existing,
              title: a.title || existing.title,
              updatedAt: a.updatedAt || existing.updatedAt,
              cwd: a.cwd || existing.cwd,
            });
          } else {
            byId.set(a.sessionId, {
              id: a.sessionId,
              title: a.title || `Session ${a.sessionId.slice(0, 8)}`,
              cwd: a.cwd || projectCwd || "",
              updatedAt: a.updatedAt ?? null,
              createdAt: null,
              modelId: null,
              numMessages: null,
              path: "",
            });
          }
        }
        setSource("merged");
      } catch {
        setSource("disk");
      }
      const list = Array.from(byId.values()).sort((a, b) =>
        (b.updatedAt || "").localeCompare(a.updatedAt || ""),
      );
      setSessions(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filterAll, projectCwd, setError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onResume = async (s: DiskSession) => {
    setBusyId(s.id);
    setStatus("connecting");
    setError(null);
    clearScroll();
    const setSuppress = useAppStore.getState().setSuppressHistoryUpdates;
    // Suppress stream history while loading so disk hydrate + agent replay don't double.
    setSuppress(true);
    try {
      setProjectCwd(s.cwd);
      const session = await connectAgent({
        cwd: s.cwd,
        alwaysApprove,
        resumeSessionId: s.id,
      });
      setSession(session);
      setStatus("ready");
      setView("chat");

      // Prefer disk hydrate once (stable). If empty, leave room for any live tail.
      try {
        const hist = await getSessionHistory(s.id, 150);
        clearScroll();
        hydrateHistory(hist);
      } catch {
        /* history is best-effort */
      }

      pushItem({
        id: nextId(),
        kind: "system",
        text: `Resumed · ${s.title} · ${session.sessionId.slice(0, 8)}…`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("error");
      setError(msg);
      pushItem({ id: nextId(), kind: "system", text: msg, level: "error" });
    } finally {
      setBusyId(null);
      // Allow new live turns after a short grace period.
      window.setTimeout(() => setSuppress(false), 1500);
    }
  };

  const onDelete = async (s: DiskSession) => {
    if (!confirm(`Delete session “${s.title}”? This cannot be undone.`)) return;
    setBusyId(s.id);
    try {
      await deleteDiskSession(s.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const onRename = async (s: DiskSession) => {
    const title = prompt("Rename session", s.title);
    if (!title || title.trim() === s.title) return;
    setBusyId(s.id);
    try {
      await renameDiskSession(s.id, title.trim());
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 560,
        borderRadius: 12,
        border: "1px solid #2a3140",
        background: "#141820",
        padding: 16,
        textAlign: "left",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "#8b95a8",
          }}
        >
          Recent sessions
          <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: 6 }}>
            {source === "merged" ? "· disk + agent" : "· disk"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: "#8b95a8", display: "flex", gap: 4 }}>
            <input
              type="checkbox"
              checked={filterAll}
              onChange={(e) => setFilterAll(e.target.checked)}
            />
            All projects
          </label>
          <button
            type="button"
            onClick={() => void refresh()}
            style={{
              border: "1px solid #2a3140",
              background: "#1a1f2a",
              color: "#e8ecf4",
              borderRadius: 6,
              padding: "4px 8px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ margin: 0, fontSize: 13, color: "#8b95a8" }}>Loading…</p>
      ) : sessions.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "#8b95a8" }}>
          {filterAll
            ? "No sessions found under ~/.grok/sessions."
            : projectCwd
              ? "No sessions for this project yet. Open a new session above."
              : "Choose a project folder to filter sessions, or enable All projects."}
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            maxHeight: 280,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {sessions.map((s) => (
            <li
              key={s.id}
              style={{
                border: "1px solid #2a3140",
                borderRadius: 8,
                padding: "10px 12px",
                background: "#0c0e12",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 13,
                      color: "#e8ecf4",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={s.title}
                  >
                    {s.title}
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
                  <div style={{ marginTop: 4, fontSize: 11, color: "#8b95a8" }}>
                    {formatWhen(s.updatedAt)}
                    {s.modelId ? ` · ${s.modelId}` : ""}
                    {s.numMessages != null ? ` · ${s.numMessages} msgs` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    disabled={busyId === s.id}
                    onClick={() => void onResume(s)}
                    style={btnStyle("#7c9cff", "#0c0e12")}
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    disabled={busyId === s.id}
                    onClick={() => void onRename(s)}
                    style={btnStyle("#1a1f2a", "#e8ecf4")}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    disabled={busyId === s.id}
                    onClick={() => void onDelete(s)}
                    style={btnStyle("rgba(240,113,120,0.15)", "#f07178")}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function btnStyle(bg: string, color: string): CSSProperties {
  return {
    borderRadius: 6,
    border: "1px solid #2a3140",
    background: bg,
    color,
    padding: "5px 8px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };
}
