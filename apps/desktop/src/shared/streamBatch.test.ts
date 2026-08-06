import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleStreamFlush } from "./streamBatch";

describe("scheduleStreamFlush", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("coalesces multiple schedules into one rAF", async () => {
    const calls: number[] = [];
    let rafCb: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCb = cb;
      return 1;
    });

    scheduleStreamFlush(() => calls.push(1));
    scheduleStreamFlush(() => calls.push(2));
    expect(calls).toEqual([]);
    expect(rafCb).toBeTypeOf("function");
    rafCb?.(0);
    // Same function identity is de-duped via Set — two different fns both run
    expect(calls).toEqual([1, 2]);
  });
});
