import { describe, expect, it } from "vitest";
import { asDisplayText } from "./text";

describe("asDisplayText", () => {
  it("handles primitives", () => {
    expect(asDisplayText(null)).toBe("");
    expect(asDisplayText("hi")).toBe("hi");
    expect(asDisplayText(42)).toBe("42");
  });

  it("flattens ACP text blocks", () => {
    expect(asDisplayText({ type: "text", text: "hello" })).toBe("hello");
    expect(asDisplayText({ content: { type: "text", text: "nested" } })).toBe(
      "nested",
    );
  });

  it("joins arrays", () => {
    expect(
      asDisplayText([
        { type: "text", text: "a" },
        { type: "text", text: "b" },
      ]),
    ).toBe("ab");
  });
});
