/**
 * Coalesce high-frequency session stream handlers onto rAF (≈16ms)
 * so React re-renders once per frame instead of once per chunk.
 */

type FlushFn = () => void;

let scheduled = false;
const pending = new Set<FlushFn>();

function pump() {
  scheduled = false;
  const batch = Array.from(pending);
  pending.clear();
  for (const fn of batch) {
    try {
      fn();
    } catch (e) {
      console.error("stream batch flush error", e);
    }
  }
}

/** Schedule work for the next animation frame (coalesced). */
export function scheduleStreamFlush(fn: FlushFn) {
  pending.add(fn);
  if (scheduled) return;
  scheduled = true;
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(pump);
  } else {
    setTimeout(pump, 16);
  }
}

/** Debounced flush at ~32ms for lower-priority work (usage polls, etc.). */
export function scheduleIdleFlush(fn: FlushFn, ms = 32) {
  const key = fn;
  // Reuse scheduleStreamFlush with a timer wrapper stored on the function.
  const w = key as FlushFn & { __t?: ReturnType<typeof setTimeout> };
  if (w.__t) clearTimeout(w.__t);
  w.__t = setTimeout(() => {
    w.__t = undefined;
    try {
      fn();
    } catch (e) {
      console.error("idle flush error", e);
    }
  }, ms);
}
