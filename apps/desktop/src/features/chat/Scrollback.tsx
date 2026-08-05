import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";
import { MarkdownBody } from "../../shared/MarkdownBody";
import { useAppStore } from "../../shared/store";
import { asDisplayText } from "../../shared/text";
import { blockDisplayText } from "../../shared/toolContent";
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

function formatTs(ts?: number): string | null {
  if (ts == null || !Number.isFinite(ts)) return null;
  try {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return null;
  }
}

function ContentBlocks({ blocks }: { blocks: ToolContentBlock[] }) {
  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      {blocks.map((b, i) => {
        const t = (b.type ?? "").toLowerCase();
        if (t === "diff") {
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
        const text = blockDisplayText(b);
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

function LabelRow({
  label,
  color,
  ts,
  showTs,
}: {
  label: string;
  color: string;
  ts?: number;
  showTs: boolean;
}) {
  const clock = showTs ? formatTs(ts) : null;
  return (
    <div
      style={{
        marginBottom: 4,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color,
        display: "flex",
        justifyContent: "space-between",
        gap: 8,
        alignItems: "baseline",
      }}
    >
      <span>{label}</span>
      {clock ? (
        <span
          style={{
            fontWeight: 400,
            letterSpacing: 0,
            textTransform: "none",
            color: "var(--gb-ink-muted)",
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 10,
          }}
        >
          {clock}
        </span>
      ) : null}
    </div>
  );
}

function detailsOpen(
  policy: "default" | "all-open" | "all-closed",
  defaultOpen: boolean,
): boolean | undefined {
  if (policy === "all-open") return true;
  if (policy === "all-closed") return false;
  return defaultOpen;
}

function ItemView({ item }: { item: ScrollItem }) {
  const showTimestamps = useAppStore((s) => s.showTimestamps);
  const foldPolicy = useAppStore((s) => s.foldPolicy);
  const compact = useAppStore((s) => s.compactMode);
  const pad = compact ? "8px 12px" : "12px 16px";
  const fontSize = compact ? 13 : 15;

  switch (item.kind) {
    case "user":
      return (
        <div
          className="gb-scroll-item"
          style={{
            borderRadius: 12,
            border: "1px solid var(--gb-border)",
            background: "var(--gb-user)",
            padding: pad,
            contentVisibility: "auto",
            containIntrinsicSize: "auto 72px",
          }}
        >
          <LabelRow label="You" color="var(--gb-ink-muted)" ts={item.ts} showTs={showTimestamps} />
          <div style={{ whiteSpace: "pre-wrap", fontSize }}>{asDisplayText(item.text)}</div>
        </div>
      );
    case "agent":
      return (
        <div
          className="gb-scroll-item"
          style={{
            borderRadius: 12,
            border: "1px solid var(--gb-border)",
            background: "var(--gb-agent)",
            padding: pad,
            contentVisibility: "auto",
            containIntrinsicSize: "auto 96px",
          }}
        >
          <LabelRow label="Grok" color="var(--gb-accent)" ts={item.ts} showTs={showTimestamps} />
          <div className="prose-chat" style={{ fontSize }}>
            <MarkdownBody text={asDisplayText(item.text)} />
          </div>
        </div>
      );
    case "thought": {
      const open = detailsOpen(foldPolicy, false);
      return (
        <details
          className="gb-scroll-item"
          open={open}
          key={`thought-${item.id}-${foldPolicy}`}
          style={{
            borderRadius: 12,
            border: "1px solid var(--gb-border)",
            background: "var(--gb-thought)",
            padding: compact ? "6px 12px" : "8px 16px",
            fontSize: compact ? 12 : 13,
            color: "var(--gb-ink-muted)",
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
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Thinking</span>
            {showTimestamps && formatTs(item.ts) ? (
              <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                {formatTs(item.ts)}
              </span>
            ) : null}
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
            {asDisplayText(item.text)}
          </div>
        </details>
      );
    }
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
      const defaultOpen = item.status !== "completed";
      const open = detailsOpen(foldPolicy, defaultOpen);
      return (
        <details
          className="gb-scroll-item"
          open={open}
          key={`tool-${item.id}-${foldPolicy}`}
          style={{
            borderRadius: 12,
            border: "1px solid var(--gb-border)",
            background: "var(--gb-tool)",
            padding: compact ? "8px 12px" : "10px 16px",
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: compact ? 12 : 13,
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
            <span style={{ fontWeight: 600, color: "var(--gb-ink)" }}>{item.title}</span>
            {item.toolKind ? (
              <span style={{ fontSize: 11, color: "var(--gb-ink-muted)" }}>{item.toolKind}</span>
            ) : null}
            <span style={{ fontSize: 11, color: "var(--gb-ink-muted)" }}>{item.status}</span>
            {item.locations && item.locations.length > 0 ? (
              <span style={{ fontSize: 11, color: "var(--gb-accent)" }}>
                {item.locations.slice(0, 2).join(", ")}
                {item.locations.length > 2 ? ` +${item.locations.length - 2}` : ""}
              </span>
            ) : null}
            {showTimestamps && formatTs(item.ts) ? (
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 10,
                  color: "var(--gb-ink-muted)",
                }}
              >
                {formatTs(item.ts)}
              </span>
            ) : null}
          </summary>
          {item.input ? (
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--gb-ink-muted)",
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
                  color: "var(--gb-ink-muted)",
                  background: "var(--gb-surface)",
                  borderRadius: 8,
                  padding: 8,
                  border: "1px solid var(--gb-border)",
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
                  color: "var(--gb-ink-muted)",
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
                    color: "var(--gb-ink-muted)",
                    background: "var(--gb-surface)",
                    borderRadius: 8,
                    padding: 8,
                    border: "1px solid var(--gb-border)",
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
          className="gb-scroll-item"
          style={{
            borderRadius: 12,
            border: "1px solid var(--gb-border)",
            background: "var(--gb-surface-raised)",
            padding: pad,
            contentVisibility: "auto",
            containIntrinsicSize: "auto 80px",
          }}
        >
          <LabelRow label="Plan" color="var(--gb-accent)" ts={item.ts} showTs={showTimestamps} />
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {item.entries.map((e, i) => (
              <li
                key={`${i}-${e.content.slice(0, 24)}`}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  padding: "4px 0",
                  fontSize: compact ? 12 : 13,
                  color:
                    e.status === "completed" || e.status === "done"
                      ? "var(--gb-ink-muted)"
                      : "var(--gb-ink)",
                  textDecoration:
                    e.status === "completed" || e.status === "done"
                      ? "line-through"
                      : "none",
                }}
              >
                <span style={{ color: statusColor(e.status), minWidth: 14 }}>
                  {planStatusIcon(e.status)}
                </span>
                <span>{asDisplayText(e.content)}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "system":
      return (
        <div
          className="gb-scroll-item"
          style={{
            borderRadius: 8,
            padding: compact ? "6px 10px" : "8px 12px",
            fontSize: compact ? 12 : 13,
            border:
              item.level === "error"
                ? "1px solid rgba(240,113,120,0.4)"
                : "1px solid var(--gb-border)",
            background:
              item.level === "error" ? "rgba(240,113,120,0.1)" : "var(--gb-surface-overlay)",
            color: item.level === "error" ? "var(--gb-danger)" : "var(--gb-ink-muted)",
            contentVisibility: "auto",
            containIntrinsicSize: "auto 40px",
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span>{asDisplayText(item.text)}</span>
          {showTimestamps && formatTs(item.ts) ? (
            <span
              style={{
                flexShrink: 0,
                fontSize: 10,
                fontFamily: "ui-monospace, Menlo, monospace",
              }}
            >
              {formatTs(item.ts)}
            </span>
          ) : null}
        </div>
      );
  }
}

export function Scrollback() {
  const items = useAppStore((s) => s.items);
  const findOpen = useAppStore((s) => s.findOpen);
  const findQuery = useAppStore((s) => s.findQuery);
  const findIndex = useAppStore((s) => s.findIndex);
  const scrollToIndex = useAppStore((s) => s.scrollToIndex);
  const setScrollToIndex = useAppStore((s) => s.setScrollToIndex);
  const compact = useAppStore((s) => s.compactMode);
  const parentRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const matchIndices = (() => {
    const q = findQuery.trim().toLowerCase();
    if (!findOpen || !q) return new Set<number>();
    const set = new Set<number>();
    items.forEach((it, i) => {
      let text = "";
      if (it.kind === "user" || it.kind === "agent" || it.kind === "thought" || it.kind === "system") {
        text = it.text;
      } else if (it.kind === "tool") {
        text = [it.title, it.input, it.output].filter(Boolean).join("\n");
      } else if (it.kind === "plan") {
        text = it.entries.map((e) => e.content).join("\n");
      }
      if (text.toLowerCase().includes(q)) set.add(i);
    });
    return set;
  })();

  const activeMatch = (() => {
    if (!findOpen || matchIndices.size === 0) return -1;
    const arr = Array.from(matchIndices).sort((a, b) => a - b);
    return arr[Math.min(findIndex, arr.length - 1)] ?? -1;
  })();

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => {
      const it = items[i];
      if (!it) return 80;
      if (it.kind === "system") return compact ? 40 : 48;
      if (it.kind === "thought") return compact ? 48 : 56;
      if (it.kind === "tool") return compact ? 72 : 88;
      if (it.kind === "plan") return compact ? 84 : 100;
      if (it.kind === "user") return compact ? 60 : 72;
      const len = it.kind === "agent" ? it.text.length : 0;
      return Math.min(480, Math.max(compact ? 64 : 80, 48 + Math.floor(len / 4)));
    },
    overscan: 8,
    getItemKey: (i) => items[i]?.id ?? i,
  });

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
    if (scrollToIndex != null) return;
    virtualizer.scrollToIndex(items.length - 1, { align: "end" });
  }, [items.length, items[items.length - 1]?.id, virtualizer, scrollToIndex]);

  // Consume jump / timeline scroll requests.
  useEffect(() => {
    if (scrollToIndex == null) return;
    if (scrollToIndex < 0 || scrollToIndex >= items.length) {
      setScrollToIndex(null);
      return;
    }
    stickToBottom.current = false;
    virtualizer.scrollToIndex(scrollToIndex, { align: "start" });
    // Keep highlight briefly then clear target so stick-to-bottom can resume later.
    const t = window.setTimeout(() => setScrollToIndex(null), 800);
    return () => window.clearTimeout(t);
  }, [scrollToIndex, items.length, virtualizer, setScrollToIndex]);

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
          color: "var(--gb-ink-muted)",
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: 18, color: "var(--gb-ink)" }}>
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
  const gap = compact ? 8 : 12;

  return (
    <div
      ref={parentRef}
      className="gb-scrollback"
      style={{
        flex: 1,
        overflowY: "auto",
        padding: compact ? "10px 12px" : "16px",
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
          const jumped = scrollToIndex === v.index;
          return (
            <div
              key={item.id}
              data-index={v.index}
              data-scroll-item={v.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${v.start}px)`,
                paddingBottom: gap,
                outline:
                  jumped || v.index === activeMatch
                    ? "2px solid var(--gb-accent)"
                    : matchIndices.has(v.index)
                      ? "1px solid var(--gb-accent-dim)"
                      : undefined,
                outlineOffset: 2,
                borderRadius: 12,
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
