import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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

export function HistoryPanel() {
  const open = useAppStore((s) => s.historyOpen);
  const setOpen = useAppStore((s) => s.setHistoryOpen);
  const promptHistory = useAppStore((s) => s.promptHistory);
  const setDraft = useAppStore((s) => s.setDraft);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Newest first for display
  const ranked = useMemo(() => {
    const entries = promptHistory
      .map((text, idx) => ({ text, idx, r: rank(filter, text) }))
      .filter((e) => e.r != null) as Array<{ text: string; idx: number; r: number }>;
    entries.sort((a, b) => {
      // Prefer newer (higher idx) when ranks equal
      if (a.r !== b.r) return a.r - b.r;
      return b.idx - a.idx;
    });
    // Stable newest-first among full list when no filter
    if (!filter.trim()) {
      return [...promptHistory]
        .map((text, idx) => ({ text, idx, r: 0 }))
        .reverse();
    }
    return entries;
  }, [promptHistory, filter]);

  useEffect(() => {
    if (open) {
      setFilter("");
      setSelected(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [filter]);

  if (!open) return null;

  const pick = (text: string) => {
    setDraft(text);
    setOpen(false);
  };

  return (
    <div className="gb-modal-backdrop" onClick={() => setOpen(false)}>
      <div
        className="gb-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520, maxHeight: "70vh", display: "flex", flexDirection: "column" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Prompt history</h2>
          <button type="button" style={ghost} onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--gb-ink-muted)" }}>
          Fuzzy search past prompts. Enter inserts into the composer.
        </p>
        <input
          ref={inputRef}
          style={input}
          value={filter}
          placeholder="Filter…"
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
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              const hit = ranked[selected];
              if (hit) pick(hit.text);
            }
          }}
        />
        <ul
          style={{
            listStyle: "none",
            margin: "12px 0 0",
            padding: 0,
            overflowY: "auto",
            flex: 1,
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
                <button
                  type="button"
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => pick(e.text)}
                  style={{
                    ...row,
                    background:
                      i === selected ? "var(--gb-surface-overlay)" : "var(--gb-surface)",
                    borderColor:
                      i === selected ? "var(--gb-accent-dim)" : "var(--gb-border)",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      whiteSpace: "pre-wrap",
                      textAlign: "left",
                      display: "block",
                      maxHeight: 72,
                      overflow: "hidden",
                    }}
                  >
                    {e.text.slice(0, 400)}
                    {e.text.length > 400 ? "…" : ""}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

const input: CSSProperties = {
  width: "100%",
  marginTop: 12,
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface)",
  color: "var(--gb-ink)",
  padding: "8px 10px",
  fontSize: 13,
};

const row: CSSProperties = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  padding: "8px 10px",
  marginBottom: 6,
  cursor: "pointer",
  color: "var(--gb-ink)",
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
