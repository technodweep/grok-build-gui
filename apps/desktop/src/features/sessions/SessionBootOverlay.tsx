import type { CSSProperties } from "react";
import { useAppStore } from "../../shared/store";

/**
 * Full-window progress when opening / resuming a session so the delay
 * (spawn agent + ACP handshake + history hydrate) is understandable.
 */
export function SessionBootOverlay() {
  const boot = useAppStore((s) => s.sessionBoot);
  if (!boot) return null;

  const kindLabel =
    boot.kind === "resume"
      ? "Resuming session"
      : boot.kind === "reconnect"
        ? "Reconnecting"
        : boot.kind === "switch"
          ? "Switching session"
          : "Opening session";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={backdrop}
    >
      <div style={card}>
        <div style={spinnerWrap} aria-hidden>
          <div style={spinner} />
        </div>
        <div style={kindStyle}>{kindLabel}</div>
        <div style={titleStyle} title={boot.title}>
          {boot.title}
        </div>
        <div style={detailStyle}>{boot.detail}</div>
        {boot.meta ? (
          <div style={metaStyle} title={boot.meta}>
            {boot.meta}
          </div>
        ) : null}
        <p style={hintStyle}>
          The agent process can take a few seconds to start. Please wait…
        </p>
      </div>
    </div>
  );
}

const backdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 200,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(8, 10, 14, 0.72)",
  backdropFilter: "blur(4px)",
  padding: 24,
};

const card: CSSProperties = {
  width: "100%",
  maxWidth: 400,
  borderRadius: 14,
  border: "1px solid var(--gb-border, #2a3140)",
  background: "var(--gb-surface-raised, #141820)",
  color: "var(--gb-ink, #e8ecf4)",
  padding: "28px 24px 22px",
  textAlign: "center",
  boxShadow: "0 20px 48px rgba(0,0,0,0.5)",
};

const spinnerWrap: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  marginBottom: 16,
};

const spinner: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  border: "3px solid var(--gb-border, #2a3140)",
  borderTopColor: "var(--gb-accent, #7c9cff)",
  animation: "gb-spin 0.8s linear infinite",
};

const kindStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--gb-accent, #7c9cff)",
  marginBottom: 8,
};

const titleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  marginBottom: 8,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const detailStyle: CSSProperties = {
  fontSize: 13,
  color: "var(--gb-ink-muted, #8b95a8)",
  marginBottom: 6,
  minHeight: 20,
};

const metaStyle: CSSProperties = {
  fontSize: 11,
  fontFamily: "ui-monospace, Menlo, monospace",
  color: "var(--gb-ink-muted, #8b95a8)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  marginBottom: 12,
};

const hintStyle: CSSProperties = {
  margin: "12px 0 0",
  fontSize: 12,
  color: "var(--gb-ink-muted, #8b95a8)",
  lineHeight: 1.45,
};
