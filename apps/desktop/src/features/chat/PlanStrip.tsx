import type { CSSProperties } from "react";
import { useAppStore } from "../../shared/store";
import { asDisplayText } from "../../shared/text";

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s === "completed" || s === "done") return "var(--gb-success)";
  if (s === "in_progress" || s === "in-progress" || s === "running")
    return "var(--gb-warning)";
  if (s === "cancelled" || s === "failed") return "var(--gb-danger)";
  return "var(--gb-ink-muted)";
}

export function PlanStrip() {
  const items = useAppStore((s) => s.items);
  const setPlanOpen = useAppStore((s) => s.setPlanOpen);
  const plan = items.find((i) => i.kind === "plan");
  if (!plan || plan.kind !== "plan" || plan.entries.length === 0) return null;

  const done = plan.entries.filter((e) => {
    const s = e.status.toLowerCase();
    return s === "completed" || s === "done";
  }).length;
  const active = plan.entries.find((e) => {
    const s = e.status.toLowerCase();
    return s === "in_progress" || s === "in-progress" || s === "running";
  });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setPlanOpen(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setPlanOpen(true);
        }
      }}
      title="Open plan.md viewer (/view-plan)"
      style={{
        flexShrink: 0,
        borderBottom: "1px solid var(--gb-border)",
        background: "var(--gb-surface-raised)",
        padding: "8px 16px",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 12,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--gb-accent)",
          }}
        >
          Plan
        </span>
        <span style={{ color: "var(--gb-ink-muted)", fontFamily: "ui-monospace, Menlo, monospace" }}>
          {done}/{plan.entries.length}
        </span>
        <div style={barTrack}>
          <div
            style={{
              ...barFill,
              width: `${Math.round((done / plan.entries.length) * 100)}%`,
            }}
          />
        </div>
        {active ? (
          <span
            style={{
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "var(--gb-ink)",
            }}
            title={asDisplayText(active.content)}
          >
            <span style={{ color: statusColor(active.status), marginRight: 6 }}>●</span>
            {asDisplayText(active.content)}
          </span>
        ) : (
          <span style={{ color: "var(--gb-ink-muted)", flex: 1 }}>
            {done === plan.entries.length ? "All steps complete" : "Waiting…"}
          </span>
        )}
      </div>
      <div
        style={{
          display: "flex",
          gap: 4,
          marginTop: 6,
          overflowX: "auto",
          paddingBottom: 2,
        }}
      >
        {plan.entries.map((e, i) => (
          <span
            key={`${i}-${e.content.slice(0, 12)}`}
            title={`${e.status}: ${e.content}`}
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: statusColor(e.status),
              opacity: e.status.toLowerCase().includes("pending") ? 0.35 : 0.9,
              flexShrink: 0,
            }}
          />
        ))}
      </div>
    </div>
  );
}

const barTrack: CSSProperties = {
  width: 64,
  height: 6,
  borderRadius: 999,
  background: "var(--gb-surface-overlay)",
  border: "1px solid var(--gb-border)",
  overflow: "hidden",
};

const barFill: CSSProperties = {
  height: "100%",
  background: "var(--gb-success)",
  borderRadius: 999,
};
