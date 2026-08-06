import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { activateModalA11y } from "../../shared/modalA11y";
import { useAppStore } from "../../shared/store";

/** Fuzzy rank: lower is better; null = no match. */
function rank(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  if (t.includes(q)) return t.indexOf(q);
  // subsequence match
  let ti = 0;
  let score = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    const found = t.indexOf(ch, ti);
    if (found < 0) return null;
    score += found - ti;
    ti = found + 1;
  }
  return 1000 + score;
}

/** Highlight case-insensitive substring matches. */
function highlight(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const at = lower.indexOf(needle, i);
    if (at < 0) {
      parts.push(text.slice(i));
      break;
    }
    if (at > i) parts.push(text.slice(i, at));
    parts.push(
      <mark
        key={key++}
        style={{
          background: "rgba(124,156,255,0.35)",
          color: "inherit",
          borderRadius: 2,
          padding: 0,
        }}
      >
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    i = at + needle.length;
  }
  return parts;
}

export function HistoryPanel() {
  const open = useAppStore((s) => s.historyOpen);
  const setOpen = useAppStore((s) => s.setHistoryOpen);
  const promptHistory = useAppStore((s) => s.promptHistory);
  const setDraft = useAppStore((s) => s.setDraft);
  const removePromptHistoryAt = useAppStore((s) => s.removePromptHistoryAt);
  const clearPromptHistory = useAppStore((s) => s.clearPromptHistory);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState(0);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Newest first for display
  const ranked = useMemo(() => {
    if (!filter.trim()) {
      return [...promptHistory]
        .map((text, idx) => ({ text, idx, r: 0 }))
        .reverse();
    }
    const entries = promptHistory
      .map((text, idx) => ({ text, idx, r: rank(filter, text) }))
      .filter((e) => e.r != null) as Array<{ text: string; idx: number; r: number }>;
    entries.sort((a, b) => {
      if (a.r !== b.r) return a.r - b.r;
      return b.idx - a.idx;
    });
    return entries;
  }, [promptHistory, filter]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    return activateModalA11y(panelRef.current, {
      onClose: () => setOpen(false),
      initialFocus: inputRef.current,
    });
  }, [open, setOpen]);

  useEffect(() => {
    if (open) {
      setFilter("");
      setSelected(0);
      setPreviewIdx(null);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [filter]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-hist-idx="${selected}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selected, ranked]);

  if (!open) return null;

  const pick = (text: string) => {
    setDraft(text);
    setOpen(false);
  };

  const persist = async () => {
    try {
      const { getGuiSettings, setGuiSettings } = await import("../../shared/api");
      const s = await getGuiSettings();
      const hist = useAppStore.getState().promptHistory;
      await setGuiSettings({ ...s, promptHistory: hist.slice(-200) });
    } catch {
      /* ignore */
    }
  };

  const onRemove = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    removePromptHistoryAt(idx);
    void persist();
  };

  const onClear = () => {
    if (!window.confirm("Clear all prompt history?")) return;
    clearPromptHistory();
    void persist();
  };

  const onCopy = async (text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  const preview =
    previewIdx != null
      ? ranked.find((e) => e.idx === previewIdx) ?? ranked[selected]
      : ranked[selected];

  return (
    <div className="gb-modal-backdrop" onClick={() => setOpen(false)}>
      <div
        ref={panelRef}
        className="gb-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 640,
          maxHeight: "75vh",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Prompt history</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              style={ghost}
              disabled={promptHistory.length === 0}
              onClick={onClear}
            >
              Clear
            </button>
            <button type="button" style={ghost} onClick={() => setOpen(false)} aria-label="Close dialog">
              Close
            </button>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "var(--gb-ink-muted)" }}>
          Fuzzy search · Enter insert · Ctrl+C copy selected · Del remove · {promptHistory.length}{" "}
          saved
        </p>
        <input
          ref={inputRef}
          style={input}
          value={filter}
          placeholder="Filter prompts…"
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((i) => Math.min(i + 1, Math.max(0, ranked.length - 1)));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((i) => Math.max(i - 1, 0));
              return;
            }
            if (e.key === "Delete" || e.key === "Backspace") {
              if (filter === "" && ranked[selected]) {
                e.preventDefault();
                removePromptHistoryAt(ranked[selected].idx);
                void persist();
              }
              return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === "c") {
              const hit = ranked[selected];
              if (hit) {
                e.preventDefault();
                void navigator.clipboard.writeText(hit.text);
              }
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              const hit = ranked[selected];
              if (hit) pick(hit.text);
            }
          }}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr minmax(160px, 40%)",
            gap: 10,
            flex: 1,
            minHeight: 0,
          }}
        >
          <ul
            ref={listRef}
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              overflowY: "auto",
              minHeight: 0,
            }}
          >
            {ranked.length === 0 ? (
              <li style={{ padding: 12, color: "var(--gb-ink-muted)", fontSize: 13 }}>
                {promptHistory.length === 0 ? "No prompts yet." : "No matches."}
              </li>
            ) : (
              ranked.map((e, i) => (
                <li key={`${e.idx}-${i}`}>
                  <div
                    data-hist-idx={i}
                    role="option"
                    aria-selected={i === selected}
                    onMouseEnter={() => {
                      setSelected(i);
                      setPreviewIdx(e.idx);
                    }}
                    onClick={() => pick(e.text)}
                    style={{
                      ...row,
                      background:
                        i === selected ? "var(--gb-surface-overlay)" : "var(--gb-surface)",
                      borderColor:
                        i === selected ? "var(--gb-accent-dim)" : "var(--gb-border)",
                      display: "flex",
                      gap: 6,
                      alignItems: "flex-start",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        whiteSpace: "pre-wrap",
                        textAlign: "left",
                        display: "block",
                        maxHeight: 64,
                        overflow: "hidden",
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      {highlight(e.text.slice(0, 500), filter)}
                      {e.text.length > 500 ? "…" : ""}
                    </span>
                    <button
                      type="button"
                      title="Copy"
                      style={iconBtn}
                      onClick={(ev) => void onCopy(e.text, ev)}
                    >
                      ⎘
                    </button>
                    <button
                      type="button"
                      title="Remove"
                      style={iconBtn}
                      onClick={(ev) => onRemove(e.idx, ev)}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
          <div
            style={{
              border: "1px solid var(--gb-border)",
              borderRadius: 8,
              padding: 10,
              overflow: "auto",
              background: "var(--gb-bg)",
              fontSize: 12,
              whiteSpace: "pre-wrap",
              fontFamily: "ui-monospace, Menlo, monospace",
              color: "var(--gb-ink-muted)",
              minHeight: 120,
            }}
          >
            {preview ? (
              <>
                <div style={{ marginBottom: 6, fontSize: 10, textTransform: "uppercase" }}>
                  Preview · #{preview.idx + 1}
                </div>
                {preview.text}
              </>
            ) : (
              "Select a prompt to preview"
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const input: CSSProperties = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface)",
  color: "var(--gb-ink)",
  padding: "8px 10px",
  fontSize: 13,
  boxSizing: "border-box",
};

const row: CSSProperties = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  padding: "8px 10px",
  marginBottom: 6,
  cursor: "pointer",
  color: "var(--gb-ink)",
  boxSizing: "border-box",
};

const ghost: CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "transparent",
  color: "var(--gb-ink-muted)",
  padding: "6px 12px",
  fontSize: 13,
  cursor: "pointer",
};

const iconBtn: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--gb-ink-muted)",
  cursor: "pointer",
  padding: "0 4px",
  fontSize: 14,
  lineHeight: 1,
  flexShrink: 0,
};
