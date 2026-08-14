import { type CSSProperties } from "react";
import { asDisplayText } from "../../shared/text";
import { useAppStore } from "../../shared/store";

function formatTurnTs(ts: number): string {
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TimelinePanel() {
  const open = useAppStore((s) => s.timelineOpen);
  const setOpen = useAppStore((s) => s.setTimelineOpen);
  const items = useAppStore((s) => s.items);
  const setScrollToIndex = useAppStore((s) => s.setScrollToIndex);
  const scrollToIndex = useAppStore((s) => s.scrollToIndex);

  if (!open) return null;

  const turns = items
    .map((it, index) => ({ it, index }))
    .filter((x) => x.it.kind === "user" || x.it.kind === "system");

  const userTurns = turns.filter((t) => t.it.kind === "user");

  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        borderLeft: "1px solid var(--gb-border)",
        background: "var(--gb-surface-raised)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 10px",
          borderBottom: "1px solid var(--gb-border)",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--gb-accent)",
            }}
          >
            Timeline
          </div>
          <div style={{ fontSize: 11, color: "var(--gb-ink-muted)" }}>
            {userTurns.length} turn{userTurns.length === 1 ? "" : "s"}
          </div>
        </div>
        <button type="button" style={ghost} onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {userTurns.length === 0 ? (
          <p style={{ margin: 8, fontSize: 12, color: "var(--gb-ink-muted)" }}>
            No user turns yet.
          </p>
        ) : (
          userTurns.map((t, n) => {
            const text =
              t.it.kind === "user" ? asDisplayText(t.it.text) : "";
            const active = scrollToIndex === t.index;
            const preview = text.replace(/\s+/g, " ").slice(0, 80);
            return (
              <button
                key={t.it.id}
                type="button"
                onClick={() => setScrollToIndex(t.index)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  border: `1px solid ${active ? "var(--gb-accent)" : "var(--gb-border)"}`,
                  background: active
                    ? "rgba(124,156,255,0.12)"
                    : "var(--gb-surface)",
                  color: "var(--gb-ink)",
                  borderRadius: 8,
                  padding: "8px 10px",
                  marginBottom: 6,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--gb-ink-muted)",
                    marginBottom: 4,
                    fontFamily: "ui-monospace, Menlo, monospace",
                  }}
                >
                  #{n + 1}
                  {t.it.ts ? ` · ${formatTurnTs(t.it.ts)}` : ""}
                </div>
                <div
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={preview}
                >
                  {preview || "(empty)"}
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

const ghost: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--gb-ink-muted)",
  cursor: "pointer",
  fontSize: 14,
  padding: 4,
};
