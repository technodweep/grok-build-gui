import { describe, expect, it } from "vitest";
import { extractTerminalId } from "./terminalId";

describe("extractTerminalId", () => {
  it("reads rawOutput.terminalId", () => {
    expect(
      extractTerminalId({
        rawOutput: { terminalId: "term-abc123" },
      }),
    ).toBe("term-abc123");
  });

  it("reads terminal:// URI", () => {
    expect(
      extractTerminalId({
        locations: ["terminal://term-xyz"],
      }),
    ).toBe("term-xyz");
  });

  it("ignores file paths", () => {
    expect(
      extractTerminalId({
        locations: ["/home/me/src/main.rs"],
      }),
    ).toBeUndefined();
  });
});
