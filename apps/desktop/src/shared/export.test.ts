import { describe, expect, it } from "vitest";
import { conversationText } from "./export";
import type { ScrollItem } from "./types";

describe("conversationText", () => {
  it("formats mixed scroll items", () => {
    const items: ScrollItem[] = [
      { id: "1", kind: "user", text: "hello" },
      { id: "2", kind: "agent", text: "hi there" },
      {
        id: "3",
        kind: "tool",
        toolCallId: "t1",
        title: "bash",
        status: "completed",
        output: "ok",
      },
      {
        id: "4",
        kind: "plan",
        entries: [{ content: "step one", status: "pending" }],
      },
      { id: "5", kind: "system", text: "connected" },
    ];
    const out = conversationText(items);
    expect(out).toContain("You:\nhello");
    expect(out).toContain("Grok:\nhi there");
    expect(out).toContain("Tool bash [completed]");
    expect(out).toContain("ok");
    expect(out).toContain("- [pending] step one");
    expect(out).toContain("connected");
  });

  it("returns empty for empty list", () => {
    expect(conversationText([])).toBe("");
  });
});
