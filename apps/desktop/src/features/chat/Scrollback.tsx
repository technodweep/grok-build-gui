import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAppStore } from "../../shared/store";
import type { ScrollItem, ToolContentBlock } from "../../shared/types";
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

function ContentBlocks({ blocks }: { blocks: ToolContentBlock[] }) {
  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      {blocks.map((b, i) => {
        const t = (b.type ?? "").toLowerCase();
        if (t === "diff") {
          // Prefer pre-flattened unified text when parent already set output;
          // still show path header.
          return (
            <div key={i}>
              {b.path ? (
                <div
                  style={{
                    fontSize: 10,
                    color: "#7c9cff",
                    fontFamily: "ui-monospace, Menlo, monospace",
                    marginBottom: 4,
                  }}
                >
                  {b.path}
                </div>
              ) : null}
            </div>
          );
        }
        const text = b.text || b.content;
        if (text) {
          return (
            <pre
              key={i}
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
              {text}
            </pre>
          );
        }
        return null;
      })}
    </div>
  );
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
            contentVisibility: "auto",
            containIntrinsicSize: "auto 72px",
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
            contentVisibility: "auto",
            containIntrinsicSize: "auto 96px",
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
            contentVisibility: "auto",
            containIntrinsicSize: "auto 48px",
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
      const hasBlocks = (item.contentBlocks?.length ?? 0) > 0;
      const looksLikeDiff =
        !!item.output &&
        (item.output.includes("\n+") ||
          item.output.includes("\n-") ||
          item.toolKind === "edit" ||
          item.title.toLowerCase().includes("edit") ||
          item.title.toLowerCase().includes("diff") ||
          item.contentBlocks?.some((b) => (b.type ?? "").toLowerCase() === "diff"));
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
            contentVisibility: "auto",
            containIntrinsicSize: "auto 64px",
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
          {hasBlocks ? <ContentBlocks blocks={item.contentBlocks!} /> : null}
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
            contentVisibility: "auto",
            containIntrinsicSize: "auto 80px",
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
            contentVisibility: "auto",
            containIntrinsicSize: "auto 40px",
          }}
        >
          {item.text}
        </div>
      );
  }
}

export function Scrollback() {
  const items = useAppStore((s) => s.items);
  const parentRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => {
      const it = items[i];
      if (!it) return 80;
      if (it.kind === "system") return 48;
      if (it.kind === "thought") return 56;
      if (it.kind === "tool") return 88;
      if (it.kind === "plan") return 100;
      if (it.kind === "user") return 72;
      // agent messages grow; estimate from text length
      const len = it.kind === "agent" ? it.text.length : 0;
      return Math.min(480, Math.max(80, 48 + Math.floor(len / 4)));
    },
    overscan: 8,
    getItemKey: (i) => items[i]?.id ?? i,
  });

  // Stick to bottom while the user is near the end.
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottom.current = dist < 120;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!stickToBottom.current || items.length === 0) return;
    virtualizer.scrollToIndex(items.length - 1, { align: "end" });
  }, [items.length, items[items.length - 1]?.id, virtualizer]);

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

  const vItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "16px",
        minHeight: 0,
      }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {vItems.map((v) => {
          const item = items[v.index];
          if (!item) return null;
          return (
            <div
              key={item.id}
              data-index={v.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${v.start}px)`,
                paddingBottom: 12,
              }}
            >
              <ItemView item={item} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
