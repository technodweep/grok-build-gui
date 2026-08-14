import { describe, expect, it } from "vitest";
import {
  blocksToDiffText,
  collectToolFileChanges,
  toolOutputFromUpdate,
} from "./toolContent";

describe("toolContent", () => {
  it("builds a simple diff", () => {
    const diff = blocksToDiffText([
      {
        type: "diff",
        path: "a.txt",
        oldText: "one\n",
        newText: "two\n",
      },
    ]);
    expect(diff).toContain("--- a/a.txt");
    expect(diff).toContain("+++ b/a.txt");
    expect(diff).toContain("-one");
    expect(diff).toContain("+two");
  });

  it("flattens text content blocks", () => {
    const r = toolOutputFromUpdate({
      content: [
        { type: "text", text: "hello" },
        { type: "text", text: "world" },
      ],
    });
    expect(r.output).toContain("hello");
    expect(r.contentBlocks?.length).toBe(2);
  });

  it("collects paths and changeset from tools", () => {
    const { paths, changeset } = collectToolFileChanges([
      {
        title: "edit",
        locations: ["src/a.ts"],
        input: JSON.stringify({ path: "src/b.ts" }),
        contentBlocks: [
          { type: "diff", path: "src/a.ts", oldText: "x\n", newText: "y\n" },
        ],
      },
    ]);
    expect(paths).toContain("src/a.ts");
    expect(paths).toContain("src/b.ts");
    expect(changeset).toContain("--- a/src/a.ts");
    expect(changeset).toContain("### edit");
  });
});
