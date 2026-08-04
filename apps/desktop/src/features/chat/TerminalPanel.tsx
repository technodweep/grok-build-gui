import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { listTerminals } from "../../shared/api";
import { useAppStore } from "../../shared/store";
import type { TerminalSnapshot } from "../../shared/types";

function statusLabel(t: TerminalSnapshot): { text: string; color: string } {
  if (t.running) return { text: "running", color: "var(--gb-warning)" };
  if (t.signal) return { text: `signal ${t.signal}`, color: "var(--gb-danger)" };
  if (t.exitCode === 0) return { text: "exit 0", color: "var(--gb-success)" };
  if (t.exitCode != null) return { text: `exit ${t.exitCode}`, color: "var(--gb-danger)" };
  return { text: "idle", color: "var(--gb-ink-muted)" };
}

function shortCmd(cmd: string): string {
  const base = cmd.trim().split(/\s+/)[0] || cmd;
  const name = base.includes("/") ? base.split("/").pop()! : base;
  return name.length > 18 ? `${name.slice(0, 16)}…` : name;
}

function shortPath(p: string): string {
  if (p.length <= 36) return p;
  return `…${p.slice(-34)}`;
}

export function TerminalPanel() {
  const open = useAppStore((s) => s.terminalsOpen);
  const setOpen = useAppStore((s) => s.setTerminalsOpen);
  const terminals = useAppStore((s) => s.terminals);
  const setTerminals = useAppStore((s) => s.setTerminals);
  const selectedId = useAppStore((s) => s.selectedTerminalId);
  const setSelected = useAppStore((s) => s.setSelectedTerminalId);
  const [height, setHeight] = useState(220);
  const preRef = useRef<HTMLPreElement>(null);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    void listTerminals()
      .then(setTerminals)
      .catch(() => undefined);
  }, [open, setTerminals]);

  const active = useMemo(() => {
    if (terminals.length === 0) return null;
    if (selectedId) {
      const found = terminals.find((t) => t.terminalId === selectedId);
      if (found) return found;
    }
    return terminals.find((t) => t.running) ?? terminals[terminals.length - 1];
  }, [terminals, selectedId]);

  useEffect(() => {
    const el = preRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [active?.output, active?.terminalId]);

  if (!open) return null;

  const onResizeStart = (e: ReactMouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: height };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      setHeight(Math.min(480, Math.max(120, dragRef.current.startH + delta)));
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      style={{
        borderTop: "1px solid var(--gb-border)",
        background: "var(--gb-surface-raised)",
        display: "flex",
        flexDirection: "column",
        height,
        flexShrink: 0,
        minHeight: 0,
      }}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        onMouseDown={onResizeStart}
        title="Drag to resize"
        style={{
          height: 5,
          cursor: "ns-resize",
          background: "transparent",
          borderBottom: "1px solid var(--gb-border)",
          flexShrink: 0,
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--gb-ink-muted)",
            }}
          >
            Terminals ({terminals.length})
          </span>
          {active ? (
            <span
              style={{
                fontSize: 11,
                fontFamily: "ui-monospace, Menlo, monospace",
                color: "var(--gb-ink-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={active.command}
            >
              {active.command}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={btn}
          title="Hide terminal panel (/terminal)"
        >
          Hide
        </button>
      </div>

      {terminals.length === 0 ? (
        <div
          style={{
            padding: "16px 12px",
            color: "var(--gb-ink-muted)",
            fontSize: 12,
          }}
        >
          No agent terminals yet. When the agent runs a command via ACP{" "}
          <code style={{ color: "var(--gb-accent)" }}>terminal/*</code>, output appears here.
        </div>
      ) : (
        <div style={{ display: "flex", flex: 1, minHeight: 0, gap: 0 }}>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 6,
              width: 160,
              flexShrink: 0,
              overflowY: "auto",
              borderRight: "1px solid var(--gb-border)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {terminals.map((t) => {
              const st = statusLabel(t);
              const sel = active?.terminalId === t.terminalId;
              return (
                <li key={t.terminalId}>
                  <button
                    type="button"
                    onClick={() => setSelected(t.terminalId)}
                    style={{
                      ...tabBtn,
                      background: sel ? "var(--gb-surface-overlay)" : "var(--gb-surface)",
                      borderColor: sel ? "var(--gb-accent-dim)" : "var(--gb-border)",
                    }}
                    title={t.command}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: st.color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                        textAlign: "left",
                      }}
                    >
                      {shortCmd(t.command)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            {active ? (
              <>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "4px 10px",
                    fontSize: 11,
                    color: "var(--gb-ink-muted)",
                    borderBottom: "1px solid var(--gb-border)",
                    flexShrink: 0,
                    fontFamily: "ui-monospace, Menlo, monospace",
                  }}
                >
                  <span style={{ color: statusLabel(active).color }}>
                    {statusLabel(active).text}
                  </span>
                  {active.cwd ? <span title={active.cwd}>cwd {shortPath(active.cwd)}</span> : null}
                  {active.truncated ? (
                    <span style={{ color: "var(--gb-warning)" }}>truncated</span>
                  ) : null}
                  <span style={{ marginLeft: "auto" }}>{active.terminalId}</span>
                </div>
                <pre
                  ref={preRef}
                  style={{
                    margin: 0,
                    padding: "8px 10px",
                    flex: 1,
                    overflow: "auto",
                    fontFamily: "ui-monospace, Menlo, monospace",
                    fontSize: 12,
                    lineHeight: 1.45,
                    background: "#0a0c10",
                    color: "#c8d0dc",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {active.output || (active.running ? "…" : "(no output)")}
                </pre>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

const btn: CSSProperties = {
  borderRadius: 6,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface-overlay)",
  color: "var(--gb-ink)",
  padding: "2px 8px",
  fontSize: 11,
  cursor: "pointer",
};

const tabBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  width: "100%",
  borderRadius: 6,
  border: "1px solid var(--gb-border)",
  color: "var(--gb-ink)",
  padding: "5px 8px",
  fontSize: 11,
  cursor: "pointer",
  fontFamily: "ui-monospace, Menlo, monospace",
};
