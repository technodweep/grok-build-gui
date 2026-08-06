import { describe, expect, it } from "vitest";
import {
  estimateContextCategories,
  estimateTokens,
  scaleCategoriesToUsed,
} from "./contextEstimate";
import type { ScrollItem } from "./types";

describe("contextEstimate", () => {
  it("estimateTokens is roughly chars/4", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });

  it("builds categories from items", () => {
    const items: ScrollItem[] = [
      { id: "1", kind: "user", text: "hello world" },
      { id: "2", kind: "agent", text: "response text here" },
    ];
    const cats = estimateContextCategories(items);
    expect(cats.some((c) => c.id === "user")).toBe(true);
    expect(cats.some((c) => c.id === "agent")).toBe(true);
    expect(cats.some((c) => c.id === "system")).toBe(true);
  });

  it("scales to known used tokens", () => {
    const cats = [
      { id: "a", label: "A", tokens: 50, color: "red" },
      { id: "b", label: "B", tokens: 50, color: "blue" },
    ];
    const scaled = scaleCategoriesToUsed(cats, 1000);
    const sum = scaled.reduce((s, c) => s + c.tokens, 0);
    expect(sum).toBe(1000);
  });
});
