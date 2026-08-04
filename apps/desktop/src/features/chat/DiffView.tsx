import type { CSSProperties } from "react";

/** Line-colored unified-diff renderer for tool output. */
export function DiffView({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  return (
    <pre
      style={{
        margin: 0,
        maxHeight: 280,
        overflow: "auto",
        fontSize: 11,
        fontFamily: "ui-monospace, Menlo, monospace",
        background: "var(--gb-surface)",
        borderRadius: 8,
        padding: 0,
        border: "1px solid var(--gb-border)",
        lineHeight: 1.45,
      }}
    >
      {lines.map((line, i) => {
        const style = lineStyle(line);
        return (
          <div key={i} style={style}>
            {line.length === 0 ? " " : line}
          </div>
        );
      })}
    </pre>
  );
}

function lineStyle(line: string): CSSProperties {
  const base: CSSProperties = {
    padding: "0 8px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };
  if (line.startsWith("+++") || line.startsWith("---")) {
    return { ...base, color: "var(--gb-ink-muted)", fontWeight: 600 };
  }
  if (line.startsWith("@@")) {
    return {
      ...base,
      color: "var(--gb-accent)",
      background: "color-mix(in srgb, var(--gb-accent) 10%, transparent)",
    };
  }
  if (line.startsWith("+")) {
    return {
      ...base,
      color: "var(--gb-success)",
      background: "color-mix(in srgb, var(--gb-success) 12%, transparent)",
    };
  }
  if (line.startsWith("-")) {
    return {
      ...base,
      color: "var(--gb-danger)",
      background: "color-mix(in srgb, var(--gb-danger) 12%, transparent)",
    };
  }
  if (line.startsWith("diff ") || line.startsWith("index ")) {
    return { ...base, color: "var(--gb-ink-muted)" };
  }
  return { ...base, color: "var(--gb-ink-muted)" };
}
