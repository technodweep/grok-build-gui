/**
 * Lightweight modal accessibility helpers (Phase I).
 * - Focus trap within the dialog
 * - Restore focus on close
 * - Escape to close
 */

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1 && el.offsetParent !== null,
  );
}

/**
 * Activate a11y for a modal panel. Call the returned dispose when the modal unmounts.
 */
export function activateModalA11y(
  panel: HTMLElement,
  opts: { onClose: () => void; initialFocus?: HTMLElement | null },
): () => void {
  const previouslyFocused =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  if (!panel.hasAttribute("tabindex")) {
    panel.tabIndex = -1;
  }

  const focusables = getFocusable(panel);
  const target = opts.initialFocus ?? focusables[0] ?? panel;
  // Defer so the browser paints the modal first.
  requestAnimationFrame(() => {
    try {
      target.focus();
    } catch {
      /* ignore */
    }
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      opts.onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const list = getFocusable(panel);
    if (list.length === 0) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (active === first || !panel.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Capture on document so Esc works even if focus is weird.
  document.addEventListener("keydown", onKeyDown, true);

  return () => {
    document.removeEventListener("keydown", onKeyDown, true);
    if (previouslyFocused && document.contains(previouslyFocused)) {
      try {
        previouslyFocused.focus();
      } catch {
        /* ignore */
      }
    }
  };
}
