import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { killTerminal, releaseTerminal } from "../../shared/api";
import { LocalMedia } from "../../shared/LocalMedia";
import { MarkdownBody } from "../../shared/MarkdownBody";
import { extractMediaPaths, mediaKind } from "../../shared/mediaPaths";
import { useAppStore } from "../../shared/store";
import { asDisplayText } from "../../shared/text";
import { blockDisplayText } from "../../shared/toolContent";
import type { ScrollItem, ToolContentBlock } from "../../shared/types";
import { DiffView } from "./DiffView";

function AgentMediaExtras({ text }: { text: string }) {
  const paths = useMemo(() => extractMediaPaths(text), [text]);
  // Skip paths already inlined as markdown images (MarkdownBody handles those).
  const bare = useMemo(() => {
    const mdLinked = new Set(
      Array.from(text.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)).map((m) => m[1]),
    );
    return paths.filter((p) => !mdLinked.has(p) && mediaKind(p) !== "other");
  }, [paths, text]);
  if (bare.length === 0) return null;
  return (
    <div
      style={{
        marginTop: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {bare.map((p) => (
        <LocalMedia key={p} path={p} maxHeight={280} />
      ))}
    </div>
  );
}

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
        if (t === "image") {
          const data = typeof b.data === "string" ? b.data : undefined;
          const mime =
            typeof b.mimeType === "string"
              ? b.mimeType
              : typeof (b as { mime_type?: string }).mime_type === "string"
                ? (b as { mime_type: string }).mime_type
                : "image/png";
          const uri =
            typeof b.uri === "string"
              ? b.uri
              : typeof b.path === "string"
                ? b.path
                : undefined;
          if (data) {
            const src = data.startsWith("data:")
              ? data
              : `data:${mime};base64,${data}`;
            return (
              <img
                key={i}
                src={src}
                alt={uri || "image"}
                style={{
                  maxWidth: "100%",
                  maxHeight: 280,
                  borderRadius: 8,
                  border: "1px solid #2a3140",
                }}
              />
            );
          }
          if (uri) {
            return <LocalMedia key={i} path={uri.replace(/^file:\/\//, "")} maxHeight={280} />;
          }
        }
        const text = blockDisplayText(b);
        if (text) {
          // Surface bare media paths from tool output.
          const paths = extractMediaPaths(text);
          return (
            <div key={i}>
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
                {text}
              </pre>
              {paths.map((p) => (
                <div key={p} style={{ marginTop: 8 }}>
                  <LocalMedia path={p} maxHeight={220} />
                </div>
              ))}
            </div>
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

type FoldPolicy = "default" | "all-open" | "all-closed";

type ToolScrollItem = Extract<ScrollItem, { kind: "tool" }>;

type DisplayRow =
  | { kind: "single"; itemIndex: number; item: ScrollItem }
  | { kind: "tools"; itemIndices: number[]; tools: ToolScrollItem[] };

/** Consecutive tools become one group when 2+ appear back-to-back. */
function buildDisplayRows(items: ScrollItem[]): DisplayRow[] {
  const rows: DisplayRow[] = [];
  let i = 0;
  while (i < items.length) {
    const it = items[i]!;
    if (it.kind === "tool") {
      const tools: ToolScrollItem[] = [];
      const indices: number[] = [];
      while (i < items.length && items[i]!.kind === "tool") {
        tools.push(items[i] as ToolScrollItem);
        indices.push(i);
        i += 1;
      }
      if (tools.length === 1) {
        rows.push({ kind: "single", itemIndex: indices[0]!, item: tools[0]! });
      } else {
        rows.push({ kind: "tools", itemIndices: indices, tools });
      }
    } else {
      rows.push({ kind: "single", itemIndex: i, item: it });
      i += 1;
    }
  }
  return rows;
}

/**
 * Props for <details>. When fold policy is default, leave uncontrolled so the
 * user can expand/collapse freely (including after a tool completes).
 * all-open / all-closed force open state via remount key + controlled open.
 */
function detailsFoldProps(
  policy: FoldPolicy,
  defaultOpen: boolean,
  remountKey: string,
): { key: string; open?: boolean; defaultOpen?: boolean } {
  if (policy === "all-open") {
    return { key: `${remountKey}::open`, open: true };
  }
  if (policy === "all-closed") {
    return { key: `${remountKey}::closed`, open: false };
  }
  return { key: remountKey, defaultOpen };
}

function toolStatusTone(status: string): string {
  const s = status.toLowerCase();
  if (s === "completed" || s === "success" || s === "done") return "done";
  if (s === "failed" || s === "error" || s === "cancelled") return "fail";
  return "run";
}

function groupStatusLabel(tools: ToolScrollItem[]): string {
  const tones = tools.map((t) => toolStatusTone(t.status));
  if (tones.some((t) => t === "run")) return "running";
  if (tones.some((t) => t === "fail")) return "failed";
  return "completed";
}

function ToolTerminalEmbed({ terminalId }: { terminalId: string }) {
  const term = useAppStore((s) =>
    s.terminals.find((t) => t.terminalId === terminalId),
  );
  const setTerminalsOpen = useAppStore((s) => s.setTerminalsOpen);
  const setSelectedTerminalId = useAppStore((s) => s.setSelectedTerminalId);
  const setError = useAppStore((s) => s.setError);
  const tail = term?.output?.slice(-2500) ?? "";

  return (
    <div
      style={{
        marginTop: 10,
        border: "1px solid var(--gb-border)",
        borderRadius: 8,
        background: "#0c0e12",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "6px 10px",
          borderBottom: "1px solid var(--gb-border)",
          fontSize: 11,
          color: "var(--gb-ink-muted)",
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: term?.running
              ? "var(--gb-warning)"
              : term?.exitCode === 0 || term?.exitCode == null
                ? "var(--gb-success)"
                : "var(--gb-danger)",
          }}
        />
        <span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>
          terminal · {terminalId}
        </span>
        {term?.command ? (
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
            }}
            title={term.command}
          >
            {term.command.slice(0, 80)}
          </span>
        ) : (
          <span style={{ flex: 1, color: "var(--gb-ink-muted)" }}>
            {term ? "" : "(not in live roster)"}
          </span>
        )}
        <button
          type="button"
          style={termBtn}
          onClick={() => {
            setSelectedTerminalId(terminalId);
            setTerminalsOpen(true);
          }}
        >
          Open
        </button>
        {term?.running ? (
          <button
            type="button"
            style={termBtn}
            onClick={() =>
              void killTerminal(terminalId).catch((e) =>
                setError(e instanceof Error ? e.message : String(e)),
              )
            }
          >
            Kill
          </button>
        ) : term ? (
          <button
            type="button"
            style={termBtn}
            onClick={() =>
              void releaseTerminal(terminalId).catch((e) =>
                setError(e instanceof Error ? e.message : String(e)),
              )
            }
          >
            Release
          </button>
        ) : null}
      </div>
      {tail ? (
        <pre
          style={{
            margin: 0,
            maxHeight: 160,
            overflow: "auto",
            padding: 8,
            fontSize: 11,
            color: "#8b95a8",
            whiteSpace: "pre-wrap",
            fontFamily: "ui-monospace, Menlo, monospace",
          }}
        >
          {tail}
        </pre>
      ) : null}
    </div>
  );
}

const termBtn: CSSProperties = {
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface)",
  color: "var(--gb-ink)",
  borderRadius: 6,
  padding: "2px 8px",
  fontSize: 11,
  cursor: "pointer",
};

/** Single tool card — collapsed by default; always expandable after complete. */
function ToolCard({
  item,
  foldPolicy,
  compact,
  showTimestamps,
  nested = false,
}: {
  item: ToolScrollItem;
  foldPolicy: FoldPolicy;
  compact: boolean;
  showTimestamps: boolean;
  nested?: boolean;
}) {
  const hasBlocks = (item.contentBlocks?.length ?? 0) > 0;
  const looksLikeDiff =
    !!item.output &&
    (item.output.includes("\n+") ||
      item.output.includes("\n-") ||
      item.toolKind === "edit" ||
      item.title.toLowerCase().includes("edit") ||
      item.title.toLowerCase().includes("diff") ||
      item.contentBlocks?.some((b) => (b.type ?? "").toLowerCase() === "diff"));
  // Always start collapsed unless /expand (all-open) forces open.
  const fold = detailsFoldProps(foldPolicy, false, `tool-${item.id}`);

  return (
    <details
      className={nested ? undefined : "gb-scroll-item"}
      {...fold}
      style={{
        borderRadius: nested ? 8 : 12,
        border: "1px solid var(--gb-border)",
        background: "var(--gb-tool)",
        padding: compact ? "8px 12px" : nested ? "8px 12px" : "10px 16px",
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: compact ? 12 : 13,
        contentVisibility: nested ? undefined : "auto",
        containIntrinsicSize: nested ? undefined : "auto 64px",
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
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 600, color: "var(--gb-ink)" }}>{item.title}</span>
        {item.toolKind ? (
          <span style={{ fontSize: 11, color: "var(--gb-ink-muted)" }}>{item.toolKind}</span>
        ) : null}
        <span style={{ fontSize: 11, color: "var(--gb-ink-muted)" }}>{item.status}</span>
        {item.terminalId ? (
          <span style={{ fontSize: 11, color: "var(--gb-warning)" }}>
            term:{item.terminalId.slice(0, 12)}
          </span>
        ) : null}
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
      {item.terminalId ? <ToolTerminalEmbed terminalId={item.terminalId} /> : null}
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

/** Multiple consecutive tools as one collapsible group (collapsed by default). */
function ToolGroupView({
  tools,
  foldPolicy,
  compact,
  showTimestamps,
}: {
  tools: ToolScrollItem[];
  foldPolicy: FoldPolicy;
  compact: boolean;
  showTimestamps: boolean;
}) {
  const fold = detailsFoldProps(
    foldPolicy,
    false,
    `tool-group-${tools.map((t) => t.id).join("|")}`,
  );
  const label = groupStatusLabel(tools);
  const toneColor =
    label === "running"
      ? "var(--gb-warning)"
      : label === "failed"
        ? "var(--gb-danger)"
        : "var(--gb-success)";
  const titlePreview = tools
    .slice(0, 4)
    .map((t) => t.title)
    .join(" · ");
  const extra = tools.length > 4 ? ` +${tools.length - 4}` : "";

  return (
    <details
      className="gb-scroll-item"
      {...fold}
      style={{
        borderRadius: 12,
        border: "1px solid var(--gb-border)",
        background: "var(--gb-surface-raised)",
        padding: compact ? "8px 12px" : "10px 16px",
        contentVisibility: "auto",
        containIntrinsicSize: "auto 56px",
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
            width: 8,
            height: 8,
            borderRadius: 999,
            background: toneColor,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--gb-ink-muted)",
          }}
        >
          {tools.length} tools
        </span>
        <span style={{ fontSize: 11, color: toneColor, fontWeight: 600 }}>{label}</span>
        <span
          style={{
            fontSize: 12,
            color: "var(--gb-ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
            flex: 1,
            fontFamily: "ui-monospace, Menlo, monospace",
          }}
          title={tools.map((t) => t.title).join("\n")}
        >
          {titlePreview}
          {extra}
        </span>
        {showTimestamps && formatTs(tools[0]?.ts) ? (
          <span style={{ fontSize: 10, color: "var(--gb-ink-muted)" }}>
            {formatTs(tools[0]?.ts)}
          </span>
        ) : null}
      </summary>
      <div
        style={{
          marginTop: 10,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {tools.map((t) => (
          <ToolCard
            key={t.id}
            item={t}
            foldPolicy={foldPolicy}
            compact={compact}
            showTimestamps={showTimestamps}
            nested
          />
        ))}
      </div>
    </details>
  );
}

function AgentMessageView({
  item,
  pad,
  fontSize,
  showTimestamps,
}: {
  item: Extract<ScrollItem, { kind: "agent" }>;
  pad: string;
  fontSize: number;
  showTimestamps: boolean;
}) {
  const rawMarkdown = useAppStore((s) => s.rawMarkdown);
  const text = asDisplayText(item.text);
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
      <LabelRow
        label={rawMarkdown ? "Grok (raw)" : "Grok"}
        color="var(--gb-accent)"
        ts={item.ts}
        showTs={showTimestamps}
      />
      {rawMarkdown ? (
        <pre
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            fontSize: fontSize - 1,
            fontFamily: "ui-monospace, Menlo, monospace",
            color: "var(--gb-ink)",
            lineHeight: 1.45,
          }}
        >
          {text}
        </pre>
      ) : (
        <div className="prose-chat" style={{ fontSize }}>
          <MarkdownBody text={text} />
          <AgentMediaExtras text={text} />
        </div>
      )}
    </div>
  );
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
        <AgentMessageView
          item={item}
          pad={pad}
          fontSize={fontSize}
          showTimestamps={showTimestamps}
        />
      );
    case "thought": {
      const fold = detailsFoldProps(foldPolicy, false, `thought-${item.id}`);
      return (
        <details
          className="gb-scroll-item"
          {...fold}
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
    case "tool":
      return (
        <ToolCard
          item={item}
          foldPolicy={foldPolicy}
          compact={compact}
          showTimestamps={showTimestamps}
        />
      );
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
  const foldPolicy = useAppStore((s) => s.foldPolicy);
  const showTimestamps = useAppStore((s) => s.showTimestamps);
  const parentRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const displayRows = useMemo(() => buildDisplayRows(items), [items]);

  const itemToRow = useMemo(() => {
    const map = new Map<number, number>();
    displayRows.forEach((row, ri) => {
      if (row.kind === "single") {
        map.set(row.itemIndex, ri);
      } else {
        for (const ii of row.itemIndices) map.set(ii, ri);
      }
    });
    return map;
  }, [displayRows]);

  const matchIndices = useMemo(() => {
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
  }, [findOpen, findQuery, items]);

  const activeMatchItem = useMemo(() => {
    if (!findOpen || matchIndices.size === 0) return -1;
    const arr = Array.from(matchIndices).sort((a, b) => a - b);
    return arr[Math.min(findIndex, arr.length - 1)] ?? -1;
  }, [findOpen, matchIndices, findIndex]);

  const activeMatchRow =
    activeMatchItem >= 0 ? (itemToRow.get(activeMatchItem) ?? -1) : -1;
  const jumpRow =
    scrollToIndex != null ? (itemToRow.get(scrollToIndex) ?? scrollToIndex) : null;

  const virtualizer = useVirtualizer({
    count: displayRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => {
      const row = displayRows[i];
      if (!row) return 80;
      if (row.kind === "tools") {
        // Collapsed group height; expands when opened.
        return compact ? 52 : 60;
      }
      const it = row.item;
      if (it.kind === "system") return compact ? 40 : 48;
      if (it.kind === "thought") return compact ? 48 : 56;
      if (it.kind === "tool") return compact ? 52 : 60;
      if (it.kind === "plan") return compact ? 84 : 100;
      if (it.kind === "user") return compact ? 60 : 72;
      const len = it.kind === "agent" ? it.text.length : 0;
      return Math.min(480, Math.max(compact ? 64 : 80, 48 + Math.floor(len / 4)));
    },
    overscan: 8,
    getItemKey: (i) => {
      const row = displayRows[i];
      if (!row) return i;
      if (row.kind === "tools") return `tools:${row.tools.map((t) => t.id).join(",")}`;
      return row.item.id;
    },
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
    if (!stickToBottom.current || displayRows.length === 0) return;
    if (scrollToIndex != null) return;
    virtualizer.scrollToIndex(displayRows.length - 1, { align: "end" });
  }, [
    displayRows.length,
    items[items.length - 1]?.id,
    virtualizer,
    scrollToIndex,
  ]);

  // Consume jump / timeline scroll requests (item index → display row).
  useEffect(() => {
    if (scrollToIndex == null) return;
    if (scrollToIndex < 0 || scrollToIndex >= items.length) {
      setScrollToIndex(null);
      return;
    }
    const row = itemToRow.get(scrollToIndex) ?? 0;
    stickToBottom.current = false;
    virtualizer.scrollToIndex(row, { align: "start" });
    const t = window.setTimeout(() => setScrollToIndex(null), 800);
    return () => window.clearTimeout(t);
  }, [scrollToIndex, items.length, itemToRow, virtualizer, setScrollToIndex]);

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
          const row = displayRows[v.index];
          if (!row) return null;
          const rowItemIndices =
            row.kind === "single" ? [row.itemIndex] : row.itemIndices;
          const rowMatches = rowItemIndices.some((ii) => matchIndices.has(ii));
          const jumped = jumpRow === v.index;
          const active = activeMatchRow === v.index;
          const key =
            row.kind === "tools"
              ? `tools:${row.tools.map((t) => t.id).join(",")}`
              : row.item.id;

          return (
            <div
              key={key}
              data-index={v.index}
              data-scroll-item={rowItemIndices[0]}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${v.start}px)`,
                paddingBottom: gap,
                outline:
                  jumped || active
                    ? "2px solid var(--gb-accent)"
                    : rowMatches
                      ? "1px solid var(--gb-accent-dim)"
                      : undefined,
                outlineOffset: 2,
                borderRadius: 12,
              }}
            >
              {row.kind === "tools" ? (
                <ToolGroupView
                  tools={row.tools}
                  foldPolicy={foldPolicy}
                  compact={compact}
                  showTimestamps={showTimestamps}
                />
              ) : (
                <ItemView item={row.item} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
