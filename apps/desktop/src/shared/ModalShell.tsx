import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { activateModalA11y } from "./modalA11y";

/**
 * Shared accessible modal shell: backdrop click, Esc, focus trap, ARIA.
 */
export function ModalShell({
  open,
  onClose,
  title,
  description,
  children,
  panelStyle,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  panelStyle?: CSSProperties;
  /** Wider max-width for complex hubs. */
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`gb-modal-title-${Math.random().toString(36).slice(2, 9)}`).current;
  const descId = useRef(`gb-modal-desc-${Math.random().toString(36).slice(2, 9)}`).current;

  useEffect(() => {
    if (!open || !panelRef.current) return;
    return activateModalA11y(panelRef.current, { onClose });
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="gb-modal-backdrop"
      onClick={onClose}
      // Decorative; dialog is the panel
    >
      <div
        ref={panelRef}
        className="gb-modal"
        onClick={(e) => e.stopPropagation()}
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        style={{
          maxWidth: wide ? 920 : undefined,
          width: wide ? "94vw" : undefined,
          maxHeight: wide ? "88vh" : undefined,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          ...panelStyle,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div>
            <div id={titleId} style={{ fontWeight: 700, fontSize: 16 }}>
              {title}
            </div>
            {description ? (
              <div
                id={descId}
                style={{ fontSize: 12, color: "var(--gb-ink-muted)", marginTop: 2 }}
              >
                {description}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              fontSize: 12,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid var(--gb-border)",
              background: "var(--gb-surface)",
              color: "var(--gb-ink)",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{children}</div>
      </div>
    </div>
  );
}
