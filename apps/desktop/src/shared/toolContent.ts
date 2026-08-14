import { asDisplayText } from "./text";
import type { ToolContentBlock } from "./types";

/** Build a unified-diff string from ACP `type: "diff"` content blocks. */
export function blocksToDiffText(blocks: ToolContentBlock[]): string | null {
  const diffs = blocks.filter((b) => (b.type ?? "").toLowerCase() === "diff");
  if (diffs.length === 0) return null;
  const parts: string[] = [];
  for (const d of diffs) {
    const path = d.path || "file";
    const oldText = asDisplayText(d.oldText);
    const newText = asDisplayText(d.newText);
    parts.push(`--- a/${path}`);
    parts.push(`+++ b/${path}`);
    // Prefer full-file replace style when either side is empty.
    if (!oldText && newText) {
      parts.push("@@ -0,0 +1 @@");
      for (const line of newText.split("\n")) parts.push(`+${line}`);
    } else if (oldText && !newText) {
      parts.push("@@ -1 +0,0 @@");
      for (const line of oldText.split("\n")) parts.push(`-${line}`);
    } else {
      // Naive side-by-side line dump (agent often sends full files).
      const oldLines = oldText.split("\n");
      const newLines = newText.split("\n");
      parts.push(`@@ -1,${oldLines.length} +1,${newLines.length} @@`);
      // If identical, skip.
      if (oldText === newText) continue;
      // Simple LCS-less: show old as - then new as + when different.
      const max = Math.max(oldLines.length, newLines.length);
      for (let i = 0; i < max; i++) {
        const o = oldLines[i];
        const n = newLines[i];
        if (o === n) {
          if (o != null) parts.push(` ${o}`);
        } else {
          if (o != null) parts.push(`-${o}`);
          if (n != null) parts.push(`+${n}`);
        }
      }
    }
  }
  return parts.length ? parts.join("\n") : null;
}

export function extractContentBlocks(content: unknown): ToolContentBlock[] | undefined {
  if (!Array.isArray(content)) return undefined;
  const blocks = content.filter(
    (b): b is ToolContentBlock => !!b && typeof b === "object",
  );
  return blocks.length ? blocks : undefined;
}

/** Flatten a single content block to display text (never returns an object). */
export function blockDisplayText(b: ToolContentBlock): string {
  if (typeof b.text === "string") return b.text;
  if (b.content != null) return asDisplayText(b.content);
  return "";
}

/** Text blocks or raw output for tool cards. */
export function toolOutputFromUpdate(update: {
  content?: unknown;
  rawOutput?: unknown;
}): { output?: string; contentBlocks?: ToolContentBlock[] } {
  const contentBlocks = extractContentBlocks(update.content);
  if (contentBlocks) {
    const diff = blocksToDiffText(contentBlocks);
    if (diff) return { output: diff, contentBlocks };
    // Flatten text-ish blocks
    const texts = contentBlocks
      .map(blockDisplayText)
      .filter(Boolean)
      .join("\n");
    if (texts) return { output: texts, contentBlocks };
    return { contentBlocks };
  }
  if (typeof update.content === "string") {
    return { output: update.content };
  }
  if (update.content && typeof update.content === "object") {
    const t = asDisplayText(update.content);
    if (t) return { output: t };
  }
  return {};
}

export type ToolLikeForChanges = {
  title?: string;
  input?: string;
  output?: string;
  locations?: string[];
  contentBlocks?: ToolContentBlock[];
  toolKind?: string;
};

function pathFromToolInput(input?: string): string[] {
  if (!input?.trim()) return [];
  const out: string[] = [];
  try {
    const j = JSON.parse(input) as Record<string, unknown>;
    for (const k of [
      "path",
      "file_path",
      "filePath",
      "target_file",
      "targetFile",
      "old_path",
      "new_path",
      "filename",
    ]) {
      const v = j[k];
      if (typeof v === "string" && v.trim()) out.push(v.trim());
    }
  } catch {
    // bare path-ish line
    const m = input.match(/(?:^|[\s"'])(\/[^\s"'\\]+|[A-Za-z]:\\[^\s"'\\]+)/);
    if (m?.[1]) out.push(m[1]);
  }
  return out;
}

function looksLikeUnifiedDiff(text: string): boolean {
  return (
    text.includes("--- a/") ||
    text.includes("+++ b/") ||
    text.includes("\n@@ ") ||
    /^diff --git /m.test(text)
  );
}

/** Collect unique file paths + combined unified diff from a set of tools. */
export function collectToolFileChanges(tools: ToolLikeForChanges[]): {
  paths: string[];
  changeset: string | null;
} {
  const pathSet = new Set<string>();
  const diffParts: string[] = [];

  for (const t of tools) {
    for (const loc of t.locations ?? []) {
      if (!loc || loc.startsWith("terminal:") || loc.startsWith("term:")) continue;
      pathSet.add(loc);
    }
    for (const p of pathFromToolInput(t.input)) pathSet.add(p);
    for (const b of t.contentBlocks ?? []) {
      if (typeof b.path === "string" && b.path.trim()) pathSet.add(b.path.trim());
    }
    if (t.contentBlocks?.length) {
      const d = blocksToDiffText(t.contentBlocks);
      if (d) {
        diffParts.push(`### ${t.title || "tool"}\n${d}`);
        continue;
      }
    }
    if (t.output && looksLikeUnifiedDiff(t.output)) {
      diffParts.push(`### ${t.title || "tool"}\n${t.output}`);
    }
  }

  const paths = [...pathSet].sort((a, b) => a.localeCompare(b));
  return {
    paths,
    changeset: diffParts.length > 0 ? diffParts.join("\n\n") : null,
  };
}
