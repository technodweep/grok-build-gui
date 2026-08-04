import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAppStore } from "../../shared/store";
import type { ScrollItem } from "../../shared/types";
import { DiffView } from "./DiffView";

function statusColor(status: string): string {
  if (status === "completed" || status === "success") return "#3dd68c";
  if (status === "failed" || status === "error" || status === "cancelled")
    return "#f07178";
  return "#f0b429";
}

function planStatusIcon(status: string): string {
  const s = status.toLowerCase();
  if (s === "completed" || s === "done") return "✓";
  if (s === "in_progress" || s === "in-progress" || s === "running") return "●";
  if (s === "cancelled" || s === "failed") return "✗";
  return "○";
}

function ItemView({ item }: { item: ScrollItem }) {
  switch (item.kind) {
    case "user":
      return (
        <div
          style={{
            borderRadius: 12,
            border: "1px solid #2a3140",
            background: "#1e2a44",
            padding: "12px 16px",
          }}
        >
          <div
            style={{
              marginBottom: 4,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#8b95a8",
            }}
          >
            You
          </div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 15 }}>{item.text}</div>
        </div>
      );
    case "agent":
      return (
        <div
          style={{
            borderRadius: 12,
            border: "1px solid #2a3140",
            background: "#12161e",
            padding: "12px 16px",
          }}
        >
          <div
            style={{
              marginBottom: 4,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#7c9cff",
            }}
          >
            Grok
          </div>
          <div className="prose-chat" style={{ fontSize: 15 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
          </div>
        </div>
      );
    case "thought":
      return (
        <details
          style={{
            borderRadius: 12,
            border: "1px solid #2a3140",
            background: "#1c1a28",
            padding: "8px 16px",
            fontSize: 13,
            color: "#8b95a8",
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Thinking
          </summary>
          <div
            style={{
              marginTop: 8,
              whiteSpace: "pre-wrap",
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 12,
              opacity: 0.9,
            }}
          >
            {item.text}
          </div>
        </details>
      );
    case "tool": {
      const looksLikeDiff =
        !!item.output &&
        (item.output.includes("\n+") ||
          item.output.includes("\n-") ||
          item.toolKind === "edit" ||
          item.title.toLowerCase().includes("edit") ||
          item.title.toLowerCase().includes("diff"));
      return (
        <details
          open={item.status !== "completed"}
          style={{
            borderRadius: 12,
            border: "1px solid #2a3140",
            background: "#1a2420",
            padding: "10px 16px",
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 13,
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              listStyle: "none",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 999,
                background: statusColor(item.status),
              }}
            />
            <span style={{ fontWeight: 600, color: "#e8ecf4" }}>{item.title}</span>
            {item.toolKind ? (
              <span style={{ fontSize: 11, color: "#8b95a8" }}>{item.toolKind}</span>
            ) : null}
            <span style={{ fontSize: 11, color: "#8b95a8" }}>{item.status}</span>
            {item.locations && item.locations.length > 0 ? (
              <span style={{ fontSize: 11, color: "#7c9cff" }}>
                {item.locations.slice(0, 2).join(", ")}
                {item.locations.length > 2 ? ` +${item.locations.length - 2}` : ""}
              </span>
            ) : null}
          </summary>
          {item.input ? (
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  fontSize: 10,
                  color: "#8b95a8",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: 4,
                }}
              >
                Input
              </div>
              <pre
                style={{
                  margin: 0,
                  maxHeight: 160,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  fontSize: 11,
                  color: "#8b95a8",
                  background: "#0c0e12",
                  borderRadius: 8,
                  padding: 8,
                  border: "1px solid #2a3140",
                }}
              >
                {item.input}
              </pre>
            </div>
          ) : null}
          {item.output ? (
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  fontSize: 10,
                  color: "#8b95a8",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: 4,
                }}
              >
                {looksLikeDiff ? "Diff / output" : "Output"}
              </div>
              {looksLikeDiff ? (
                <DiffView text={item.output} />
              ) : (
                <pre
                  style={{
                    margin: 0,
                    maxHeight: 220,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    fontSize: 11,
                    color: "#8b95a8",
                    background: "#0c0e12",
                    borderRadius: 8,
                    padding: 8,
                    border: "1px solid #2a3140",
                  }}
                >
                  {item.output}
                </pre>
              )}
            </div>
          ) : null}
        </details>
      );
    }
    case "plan":
      return (
        <div
          style={{
            borderRadius: 12,
            border: "1px solid #2a3140",
            background: "#141820",
            padding: "12px 16px",
          }}
        >
          <div
            style={{
              marginBottom: 8,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#7c9cff",
            }}
          >
            Plan
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {item.entries.map((e, i) => (
              <li
                key={`${i}-${e.content.slice(0, 24)}`}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  padding: "4px 0",
                  fontSize: 13,
                  color:
                    e.status === "completed" || e.status === "done"
                      ? "#8b95a8"
                      : "#e8ecf4",
                  textDecoration:
                    e.status === "completed" || e.status === "done"
                      ? "line-through"
                      : "none",
                }}
              >
                <span style={{ color: statusColor(e.status), minWidth: 14 }}>
                  {planStatusIcon(e.status)}
                </span>
                <span>{e.content}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "system":
      return (
        <div
          style={{
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 13,
            border:
              item.level === "error"
                ? "1px solid rgba(240,113,120,0.4)"
                : "1px solid #2a3140",
            background:
              item.level === "error" ? "rgba(240,113,120,0.1)" : "#1a1f2a",
            color: item.level === "error" ? "#f07178" : "#8b95a8",
          }}
        >
          {item.text}
        </div>
      );
  }
}

export function Scrollback() {
  const items = useAppStore((s) => s.items);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items]);

  if (items.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
          textAlign: "center",
          color: "#8b95a8",
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: 18, color: "#e8ecf4" }}>
            Start a conversation
          </p>
          <p style={{ marginTop: 8, fontSize: 14 }}>
            Send a prompt. Tool calls, diffs, thinking, and plans stream here.
            Permission prompts appear as modal dialogs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {items.map((item) => (
        <ItemView key={item.id} item={item} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
