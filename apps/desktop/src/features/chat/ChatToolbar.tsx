import { type CSSProperties } from "react";
import { useAppStore } from "../../shared/store";

export function ChatToolbar() {
  const foldPolicy = useAppStore((s) => s.foldPolicy);
  const setFoldPolicy = useAppStore((s) => s.setFoldPolicy);
  const timelineOpen = useAppStore((s) => s.timelineOpen);
  const setTimelineOpen = useAppStore((s) => s.setTimelineOpen);
  const showTimestamps = useAppStore((s) => s.showTimestamps);
  const setShowTimestamps = useAppStore((s) => s.setShowTimestamps);
  const compactMode = useAppStore((s) => s.compactMode);
  const setCompactMode = useAppStore((s) => s.setCompactMode);
  const rawMarkdown = useAppStore((s) => s.rawMarkdown);
  const setRawMarkdown = useAppStore((s) => s.setRawMarkdown);
  const jumpUserTurn = useAppStore((s) => s.jumpUserTurn);
  const items = useAppStore((s) => s.items);
  const setContextOpen = useAppStore((s) => s.setContextOpen);

  const userTurns = items.filter((i) => i.kind === "user").length;

  const btn = (active?: boolean): CSSProperties => ({
    borderRadius: 6,
    border: `1px solid ${active ? "var(--gb-accent)" : "var(--gb-border)"}`,
    background: active ? "rgba(124,156,255,0.12)" : "var(--gb-surface)",
    color: active ? "var(--gb-accent)" : "var(--gb-ink-muted)",
    padding: "3px 8px",
    fontSize: 11,
    cursor: "pointer",
    fontWeight: active ? 600 : 500,
  });

  return (
    <div
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        borderBottom: "1px solid var(--gb-border)",
        background: "var(--gb-surface)",
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--gb-ink-muted)",
          marginRight: 4,
        }}
      >
        Scrollback
      </span>
      <button
        type="button"
        style={btn()}
        title="Previous user turn (Alt+↑)"
        disabled={userTurns === 0}
        onClick={() => jumpUserTurn(-1)}
      >
        ↑ Turn
      </button>
      <button
        type="button"
        style={btn()}
        title="Next user turn (Alt+↓)"
        disabled={userTurns === 0}
        onClick={() => jumpUserTurn(1)}
      >
        ↓ Turn
      </button>
      <button
        type="button"
        style={btn(timelineOpen)}
        title="Turn timeline (/timeline)"
        onClick={() => setTimelineOpen(!timelineOpen)}
      >
        Timeline{userTurns ? ` (${userTurns})` : ""}
      </button>
      <button
        type="button"
        style={btn(foldPolicy === "all-closed")}
        title="Collapse all tools & thinking (/fold)"
        onClick={() =>
          setFoldPolicy(foldPolicy === "all-closed" ? "default" : "all-closed")
        }
      >
        Fold
      </button>
      <button
        type="button"
        style={btn(foldPolicy === "all-open")}
        title="Expand all tools & thinking (/expand)"
        onClick={() =>
          setFoldPolicy(foldPolicy === "all-open" ? "default" : "all-open")
        }
      >
        Expand
      </button>
      <button
        type="button"
        style={btn(showTimestamps)}
        title="Toggle timestamps (/timestamps)"
        onClick={() => setShowTimestamps(!showTimestamps)}
      >
        Time
      </button>
      <button
        type="button"
        style={btn(compactMode)}
        title="Compact density (/compact-mode)"
        onClick={() => setCompactMode(!compactMode)}
      >
        Compact
      </button>
      <button
        type="button"
        style={btn(rawMarkdown)}
        title="Raw markdown source for agent messages (/raw)"
        onClick={() => setRawMarkdown(!rawMarkdown)}
      >
        Raw
      </button>
      <button
        type="button"
        style={btn()}
        title="Context & usage (/context, /usage)"
        onClick={() => setContextOpen(true)}
      >
        Context
      </button>
    </div>
  );
}
