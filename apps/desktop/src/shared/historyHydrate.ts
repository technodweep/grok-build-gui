import type { HistoryItem, HistoryPage, HistoryPager, ScrollItem } from "./types";
import { useAppStore } from "./store";

/** Default first page size on resume / reconnect. */
export const HISTORY_INITIAL_LIMIT = 150;
/** Older pages when the user scrolls up. */
export const HISTORY_PAGE_SIZE = 100;

/** Attach original disk timestamp only when present — never invent. */
function withOriginalTs<T extends { ts?: number }>(
  item: T,
  ts: number | null | undefined,
): T {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return item;
  return { ...item, ts };
}

export function historyItemToScroll(
  h: HistoryItem,
  id: string,
): ScrollItem | null {
  if (h.kind === "user") {
    return withOriginalTs({ id, kind: "user", text: h.text }, h.ts);
  }
  if (h.kind === "agent") {
    return withOriginalTs({ id, kind: "agent", text: h.text }, h.ts);
  }
  if (h.kind === "thought") {
    return withOriginalTs({ id, kind: "thought", text: h.text }, h.ts);
  }
  if (h.kind === "tool") {
    return withOriginalTs(
      {
        id,
        kind: "tool",
        toolCallId: h.toolCallId || id,
        title: h.title || "tool",
        status: h.status || "completed",
        toolKind: h.toolKind ?? undefined,
      },
      h.ts,
    );
  }
  if (h.kind === "system") {
    return withOriginalTs({ id, kind: "system", text: h.text }, h.ts);
  }
  return null;
}

/** Convert a history page to scroll items with stable disk-backed ids. */
export function historyPageToScrollItems(
  page: HistoryPage,
  sessionId: string,
): ScrollItem[] {
  const out: ScrollItem[] = [];
  page.items.forEach((h, i) => {
    const abs = page.startIndex + i;
    const id = `hist:${sessionId}:${abs}`;
    const item = historyItemToScroll(h, id);
    if (item) out.push(item);
  });
  return out;
}

export function pagerFromPage(sessionId: string, page: HistoryPage): HistoryPager {
  return {
    sessionId,
    total: page.total,
    loadedFromEnd: page.loadedFromEnd,
    hasMore: page.hasMore,
    loading: false,
  };
}

/**
 * Replace a session's scrollback with a history page (initial resume hydrate).
 * Safe for inactive session ids (writes `sessionScroll[sessionId]` only).
 * Optionally seed ↑ prompt history from user messages on this page.
 */
export function hydrateHistoryReplace(
  sessionId: string,
  page: HistoryPage,
  opts?: { seedPromptHistory?: boolean },
): HistoryPager {
  const store = useAppStore.getState();
  // Keep original disk ts only; do not stamp Date.now() onto history.
  const items = historyPageToScrollItems(page, sessionId);
  const map = { ...store.sessionScroll, [sessionId]: items };
  const isActive = store.session?.sessionId === sessionId;
  const pager = pagerFromPage(sessionId, page);
  useAppStore.setState({
    sessionScroll: map,
    ...(isActive ? { items, historyPager: pager } : {}),
  });
  if (opts?.seedPromptHistory) {
    for (const item of items) {
      if (item.kind === "user" && item.text?.trim()) {
        store.pushPromptHistory(item.text.trim());
      }
    }
  }
  return pager;
}

/**
 * Prepend an older page. Returns how many scroll items were added.
 * Caller should preserve scrollTop (see Scrollback).
 */
export function hydrateHistoryPrepend(
  sessionId: string,
  page: HistoryPage,
): number {
  const store = useAppStore.getState();
  const items = historyPageToScrollItems(page, sessionId);
  if (items.length === 0) {
    store.setHistoryPager({
      ...pagerFromPage(sessionId, page),
      loading: false,
    });
    return 0;
  }
  // Drop duplicates if a race re-fetched the same range.
  const existing = new Set(store.items.map((it) => it.id));
  const fresh = items.filter((it) => !existing.has(it.id));
  if (fresh.length > 0) {
    store.prependItems(fresh, sessionId);
  }
  store.setHistoryPager(pagerFromPage(sessionId, page));
  return fresh.length;
}
