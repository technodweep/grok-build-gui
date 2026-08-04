import type { CSSProperties } from "react";
import { useAppStore } from "../../shared/store";

const ROWS: { keys: string; action: string }[] = [
  { keys: "Enter", action: "Send message" },
  { keys: "Shift+Enter", action: "Newline in composer" },
  { keys: "/", action: "Open slash command palette" },
  { keys: "@", action: "Open file attachment picker" },
  { keys: "↑ / ↓", action: "Navigate palette" },
  { keys: "Tab / Enter", action: "Select palette item" },
  { keys: "Esc", action: "Close palette / modal" },
  { keys: "Ctrl+,", action: "Open settings" },
  { keys: "Ctrl+/ or ?", action: "This shortcuts cheatsheet" },
  { keys: "/new", action: "New session (client)" },
  { keys: "/home", action: "Welcome screen (client)" },
  { keys: "/dashboard", action: "Multi-agent dashboard" },
  { keys: "/clear", action: "Clear local scrollback" },
  { keys: "/cancel", action: "Cancel current turn" },
  { keys: "/export", action: "Export conversation (save dialog)" },
  { keys: "/export clipboard", action: "Copy conversation to clipboard" },
  { keys: "/history", action: "Recall last prompt into composer" },
  { keys: "↑ / ↓ (empty input)", action: "Browse prompt history" },
  { keys: "/settings", action: "Open settings" },
  { keys: "/shortcuts", action: "Open this cheatsheet" },
  { keys: "/context", action: "Context window usage panel" },
  { keys: "/terminal", action: "Toggle agent terminal panel" },
  { keys: "/model [id]", action: "Switch model or open picker (alias: /m)" },
  { keys: "/effort [level]", action: "Set reasoning effort (low|medium|high)" },
  { keys: "/copy", action: "Copy last agent reply" },
  { keys: "/rename <title>", action: "Rename current session (alias: /title)" },
  { keys: "/delete", action: "Delete current session from disk" },
  { keys: "Drop files", action: "Attach paths on the composer" },
  { keys: "/session-info", action: "Session stats (aliases: /status, /info)" },
];

export function ShortcutsModal() {
  const open = useAppStore((s) => s.shortcutsOpen);
  const setOpen = useAppStore((s) => s.setShortcutsOpen);
  if (!open) return null;

  return (
    <div className="gb-modal-backdrop" onClick={() => setOpen(false)}>
      <div className="gb-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              borderRadius: 8,
              border: "1px solid var(--gb-border)",
              background: "transparent",
              color: "var(--gb-ink-muted)",
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
        <table style={{ width: "100%", marginTop: 16, borderCollapse: "collapse", fontSize: 13 }}>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.keys} style={{ borderBottom: "1px solid var(--gb-border)" }}>
                <td style={tdKeys}>
                  <kbd style={kbd}>{r.keys}</kbd>
                </td>
                <td style={tdAction}>{r.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const tdKeys: CSSProperties = { padding: "8px 8px 8px 0", width: "40%", verticalAlign: "top" };
const tdAction: CSSProperties = { padding: "8px 0", color: "var(--gb-ink-muted)" };
const kbd: CSSProperties = {
  display: "inline-block",
  fontFamily: "ui-monospace, Menlo, monospace",
  fontSize: 12,
  padding: "2px 6px",
  borderRadius: 4,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface)",
  color: "var(--gb-ink)",
};
