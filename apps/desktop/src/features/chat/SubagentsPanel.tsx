import { useEffect, type CSSProperties } from "react";
import { listSessionSubagents } from "../../shared/api";
import { useAppStore } from "../../shared/store";

function statusColor(status?: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s.includes("fail") || s.includes("error")) return "var(--gb-danger)";
  if (s.includes("run") || s.includes("work") || s.includes("progress"))
    return "var(--gb-warning)";
  if (s.includes("complete") || s.includes("done") || s.includes("success"))
    return "var(--gb-success)";
  return "var(--gb-ink-muted)";
}

export function SubagentsPanel() {
  const session = useAppStore((s) => s.session);
  const subagents = useAppStore((s) => s.subagents);
  const setSubagents = useAppStore((s) => s.setSubagents);

  useEffect(() => {
    if (!session?.sessionId) {
      setSubagents([]);
      return;
    }
    void listSessionSubagents(session.sessionId)
      .then(setSubagents)
      .catch(() => setSubagents([]));
  }, [session?.sessionId, setSubagents]);

  if (!session || subagents.length === 0) return null;

  return (
    <div
      style={{
        borderTop: "1px solid var(--gb-border)",
        background: "var(--gb-surface-raised)",
        padding: "8px 16px",
        maxHeight: 140,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--gb-ink-muted)",
          marginBottom: 6,
        }}
      >
        Subagents ({subagents.length})
      </div>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {subagents.map((s) => (
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
            <span style={{ fontWeight: 600, fontSize: 12 }}>
              {s.name || s.agentType || "subagent"}
            </span>
            {s.agentType && s.name ? (
              <span style={{ fontSize: 11, color: "var(--gb-ink-muted)" }}>
                {s.agentType}
              </span>
            ) : null}
            <span
              style={{
                fontSize: 11,
                color: "var(--gb-ink-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
            >
              {s.title || s.status || s.id.slice(0, 8)}
              {s.live ? " · live" : ""}
            </span>
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
          </li>
        ))}
      </ul>
    </div>
  );
}

const row: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "4px 8px",
  borderRadius: 6,
  background: "var(--gb-surface)",
  border: "1px solid var(--gb-border)",
};
