import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useAppStore } from "../../shared/store";
import type { ScrollItem } from "../../shared/types";

function itemText(item: ScrollItem): string {
  if (
    item.kind === "user" ||
    item.kind === "agent" ||
    item.kind === "thought" ||
    item.kind === "system"
  ) {
    return item.text;
  }
  if (item.kind === "tool") {
    return [item.title, item.input, item.output].filter(Boolean).join("\n");
  }
  if (item.kind === "plan") {
    return item.entries.map((e) => e.content).join("\n");
  }
  return "";
}

export function FindBar() {
  const open = useAppStore((s) => s.findOpen);
  const setOpen = useAppStore((s) => s.setFindOpen);
  const query = useAppStore((s) => s.findQuery);
  const setQuery = useAppStore((s) => s.setFindQuery);
  const index = useAppStore((s) => s.findIndex);
  const setIndex = useAppStore((s) => s.setFindIndex);
  const items = useAppStore((s) => s.items);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as number[];
    const out: number[] = [];
    items.forEach((it, i) => {
      if (itemText(it).toLowerCase().includes(q)) out.push(i);
    });
    return out;
  }, [items, query]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [open]);

  useEffect(() => {
    if (matches.length === 0) {
      if (index !== 0) setIndex(0);
      return;
    }
    if (index >= matches.length) setIndex(0);
  }, [matches.length, index, setIndex]);

  const current = matches.length ? matches[Math.min(index, matches.length - 1)] : -1;

  useEffect(() => {
    if (!open || current < 0) return;
    const el = document.querySelector(`[data-scroll-item="${current}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [open, current, query]);

  if (!open) return null;

  const go = (delta: number) => {
    if (matches.length === 0) return;
    const next = (index + delta + matches.length) % matches.length;
    setIndex(next);
  };

  return (
    <div
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderBottom: "1px solid var(--gb-border)",
        background: "var(--gb-surface-raised)",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--gb-ink-muted)",
        }}
      >
        Find
      </span>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            go(e.shiftKey ? -1 : 1);
          }
        }}
        placeholder="Search conversation…"
        style={input}
      />
      <span
        style={{
          fontSize: 11,
          color: "var(--gb-ink-muted)",
          fontFamily: "ui-monospace, Menlo, monospace",
          minWidth: 56,
        }}
      >
        {query.trim()
          ? matches.length
            ? `${Math.min(index + 1, matches.length)}/${matches.length}`
            : "0/0"
          : "—"}
      </span>
      <button type="button" style={btn} disabled={!matches.length} onClick={() => go(-1)}>
        ↑
      </button>
      <button type="button" style={btn} disabled={!matches.length} onClick={() => go(1)}>
        ↓
      </button>
      <button type="button" style={btn} onClick={() => setOpen(false)}>
        Esc
      </button>
    </div>
  );
}

const input: CSSProperties = {
  flex: 1,
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface)",
  color: "var(--gb-ink)",
  padding: "6px 10px",
  fontSize: 13,
  outline: "none",
};

const btn: CSSProperties = {
  borderRadius: 6,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface-overlay)",
  color: "var(--gb-ink)",
  padding: "4px 8px",
  fontSize: 12,
  cursor: "pointer",
};
