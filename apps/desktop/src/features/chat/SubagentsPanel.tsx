import { useEffect, useState, type CSSProperties } from "react";
import {
  cancelLiveSession,
  getSessionHistory,
  listSessionSubagents,
  switchSession,
} from "../../shared/api";
import { useAppStore } from "../../shared/store";
import type { SubagentInfo } from "../../shared/types";

function statusColor(status?: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s.includes("fail") || s.includes("error") || s.includes("cancel"))
    return "var(--gb-danger)";
  if (s.includes("run") || s.includes("work") || s.includes("progress") || s.includes("active"))
    return "var(--gb-warning)";
  if (s.includes("complete") || s.includes("done") || s.includes("success") || s.includes("idle"))
    return "var(--gb-success)";
  return "var(--gb-ink-muted)";
}

function isRunning(status?: string | null): boolean {
  const s = (status ?? "").toLowerCase();
  return (
    s.includes("run") ||
    s.includes("work") ||
    s.includes("progress") ||
    s.includes("active") ||
    s.includes("pending")
  );
}

function isolationBadge(s: SubagentInfo): string | null {
  const iso = (s.isolation ?? "").toLowerCase();
  if (iso.includes("worktree") || s.worktreePath) return "worktree";
  if (iso && iso !== "none") return iso;
  return null;
}

export function SubagentsPanel() {
  const session = useAppStore((s) => s.session);
  const subagents = useAppStore((s) => s.subagents);
  const setSubagents = useAppStore((s) => s.setSubagents);
  const open = useAppStore((s) => s.subagentsOpen);
  const toggleOpen = useAppStore((s) => s.toggleSubagentsOpen);
  const setSubagentsOpen = useAppStore((s) => s.setSubagentsOpen);
  const liveSessions = useAppStore((s) => s.liveSessions);
  const setSession = useAppStore((s) => s.setSession);
  const setStatus = useAppStore((s) => s.setStatus);
  const setView = useAppStore((s) => s.setView);
  const loadScrollForSession = useAppStore((s) => s.loadScrollForSession);
  const setError = useAppStore((s) => s.setError);
  const setAgentsOpen = useAppStore((s) => s.setAgentsOpen);
  const setAgentsTab = useAppStore((s) => s.setAgentsTab);
  const pushItem = useAppStore((s) => s.pushItem);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.sessionId) {
      setSubagents([]);
      return;
    }
    void listSessionSubagents(session.sessionId)
      .then((disk) => {
        const live = useAppStore.getState().subagents.filter((s) => s.live);
        const byId = new Map<string, SubagentInfo>();
        for (const d of disk) byId.set(d.id, d);
        for (const l of live) {
          const prev = byId.get(l.id);
          byId.set(l.id, prev ? { ...prev, ...l, live: true } : l);
        }
        setSubagents(Array.from(byId.values()));
      })
      .catch(() => {
        /* keep live */
      });
    const t = window.setInterval(() => {
      const sid = useAppStore.getState().session?.sessionId;
      if (!sid) return;
      void listSessionSubagents(sid)
        .then((disk) => {
          const live = useAppStore.getState().subagents.filter((s) => s.live);
          const byId = new Map<string, SubagentInfo>();
          for (const d of disk) byId.set(d.id, d);
          for (const l of live) {
            const prev = byId.get(l.id);
            byId.set(l.id, prev ? { ...prev, ...l, live: true } : l);
          }
          setSubagents(Array.from(byId.values()));
        })
        .catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(t);
  }, [session?.sessionId, setSubagents]);

  if (!session) return null;

  const openChild = async (s: SubagentInfo) => {
    const childId = s.childSessionId;
    if (!childId) {
      setError("No child session id for this subagent yet");
      return;
    }
    setBusyId(s.id);
    try {
      const live = liveSessions.find((x) => x.sessionId === childId);
      if (live || useAppStore.getState().status === "ready") {
        try {
          const st = await switchSession(childId);
          loadScrollForSession(childId);
          const items = useAppStore.getState().items;
          if (items.length === 0) {
            try {
              const hist = await getSessionHistory(childId, 200);
              for (const h of hist) {
                if (h.kind === "user" || h.kind === "agent" || h.kind === "system") {
                  pushItem(
                    {
                      id: `hist-${childId}-${h.kind}-${Math.random()}`,
                      kind: h.kind as "user" | "agent" | "system",
                      text: h.text,
                    },
                    childId,
                  );
                }
              }
            } catch {
              /* optional */
            }
          }
          setSession(st);
          setStatus("ready");
          setView("chat");
          return;
        } catch {
          // Fall through — child may not be on this agent process
        }
      }
      setError(
        `Child ${childId.slice(0, 8)}… is not on the live roster. Open Dashboard or resume from Home if the session is on disk.`,
      );
      setView("dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const cancelChild = async (s: SubagentInfo) => {
    const childId = s.childSessionId;
    if (!childId) {
      setError("No child session to cancel");
      return;
    }
    setBusyId(s.id);
    try {
      await cancelLiveSession(childId);
      setSubagents(
        useAppStore.getState().subagents.map((x) =>
          x.id === s.id ? { ...x, status: "cancelled" } : x,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const liveCount = subagents.filter((s) => s.live || isRunning(s.status)).length;
  const n = subagents.length;

  return (
    <div
      className="gb-subagents"
      style={{
        ...panel,
        maxHeight: open ? 200 : undefined,
        overflowY: open ? "auto" : "visible",
        paddingBottom: open ? 8 : 6,
      }}
    >
      <div style={headerRow}>
        <button
          type="button"
          className="gb-subagents-toggle"
          onClick={() => toggleOpen()}
          aria-expanded={open}
          title={open ? "Collapse subagents" : "Expand subagents"}
          style={toggleBtn}
        >
          <span style={chevron} aria-hidden>
            {open ? "▾" : "▸"}
          </span>
          <span style={title}>
            Subagents
            {n > 0 ? ` (${n})` : ""}
          </span>
          {liveCount > 0 ? (
            <span style={livePill} title={`${liveCount} live / running`}>
              <span style={liveDot} />
              {liveCount} live
            </span>
          ) : null}
        </button>

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {!open && n > 0 ? (
            <span style={collapsedSummary} title={subagents.map((s) => s.name || s.agentType || s.id).join(", ")}>
              {subagents
                .slice(0, 3)
                .map((s) => s.name || s.agentType || "agent")
                .join(" · ")}
              {n > 3 ? ` +${n - 3}` : ""}
            </span>
          ) : null}
          <button
            type="button"
            style={btn}
            onClick={() => {
              setSubagentsOpen(true);
              setAgentsTab("live");
              setAgentsOpen(true);
            }}
            title="Open Agents hub · Live tab"
          >
            {n === 0 ? "Agents…" : "Manage"}
          </button>
        </div>
      </div>

      {open ? (
        n === 0 ? (
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--gb-ink-muted)" }}>
            No child agents yet. When the parent spawns subagents they appear here with open / stop
            controls.
          </p>
        ) : (
          <ul style={list}>
            {subagents.map((s) => {
              const iso = isolationBadge(s);
              const isLiveOnRoster =
                !!s.childSessionId &&
                liveSessions.some((x) => x.sessionId === s.childSessionId);
              return (
                <li key={s.id} style={row}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 999,
                      background: statusColor(s.status),
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        alignItems: "baseline",
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: 12 }}>
                        {s.name || s.agentType || "subagent"}
                      </span>
                      {s.agentType && s.name ? (
                        <span style={{ fontSize: 11, color: "var(--gb-ink-muted)" }}>
                          {s.agentType}
                        </span>
                      ) : null}
                      {s.persona ? (
                        <span style={{ fontSize: 10, color: "var(--gb-accent)" }}>
                          @{s.persona}
                        </span>
                      ) : null}
                      {iso ? (
                        <span
                          style={{
                            fontSize: 10,
                            color: "var(--gb-warning)",
                            border: "1px solid var(--gb-border)",
                            borderRadius: 4,
                            padding: "0 4px",
                          }}
                          title={s.worktreePath || iso}
                        >
                          {iso}
                        </span>
                      ) : null}
                      {s.live ? (
                        <span style={{ fontSize: 10, color: "var(--gb-warning)" }}>live</span>
                      ) : null}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--gb-ink-muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={s.worktreePath || s.title || s.id}
                    >
                      {s.title || s.status || s.id.slice(0, 8)}
                      {s.modelId ? ` · ${s.modelId}` : ""}
                      {s.worktreePath ? ` · ${s.worktreePath}` : ""}
                    </div>
                  </div>
                  {s.childSessionId ? (
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "ui-monospace, Menlo, monospace",
                        color: "var(--gb-accent)",
                      }}
                      title={s.childSessionId}
                    >
                      {s.childSessionId.slice(0, 8)}…
                    </span>
                  ) : null}
                  <button
                    type="button"
                    style={btn}
                    disabled={!s.childSessionId || busyId === s.id}
                    title={
                      isLiveOnRoster
                        ? "Switch chat to child session"
                        : "Open child if on live roster"
                    }
                    onClick={() => void openChild(s)}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    style={{ ...btn, color: "var(--gb-danger)" }}
                    disabled={!s.childSessionId || busyId === s.id}
                    title="Cancel child session turn"
                    onClick={() => void cancelChild(s)}
                  >
                    Stop
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}

const panel: CSSProperties = {
  borderTop: "1px solid var(--gb-border)",
  background: "var(--gb-surface-raised)",
  padding: "6px 16px 8px",
  flexShrink: 0,
};

const headerRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  minHeight: 28,
};

const toggleBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
  border: "none",
  background: "transparent",
  color: "var(--gb-ink)",
  padding: "2px 4px 2px 0",
  cursor: "pointer",
  textAlign: "left",
};

const chevron: CSSProperties = {
  fontSize: 12,
  color: "var(--gb-ink-muted)",
  width: 12,
  flexShrink: 0,
};

const title: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--gb-ink-muted)",
  whiteSpace: "nowrap",
};

const livePill: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 10,
  fontWeight: 600,
  color: "var(--gb-warning)",
  border: "1px solid var(--gb-border)",
  borderRadius: 999,
  padding: "1px 7px",
  whiteSpace: "nowrap",
};

const liveDot: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: 999,
  background: "var(--gb-warning)",
  display: "inline-block",
};

const collapsedSummary: CSSProperties = {
  fontSize: 11,
  color: "var(--gb-ink-muted)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: 220,
};

const list: CSSProperties = {
  listStyle: "none",
  margin: "6px 0 0",
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const row: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 8px",
  borderRadius: 6,
  background: "var(--gb-surface)",
  border: "1px solid var(--gb-border)",
};

const btn: CSSProperties = {
  borderRadius: 6,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface-overlay)",
  color: "var(--gb-ink)",
  padding: "3px 8px",
  fontSize: 11,
  cursor: "pointer",
  flexShrink: 0,
};
