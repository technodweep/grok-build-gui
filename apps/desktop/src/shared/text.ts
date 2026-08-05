/**
 * Coerce ACP content (string | {type,text} | nested content | array) into a
 * plain string safe for React children / markdown.
 */
export function asDisplayText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map(asDisplayText).filter(Boolean).join("");
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    // ACP text block: { type: "text", text: "..." }
    if (typeof o.text === "string") return o.text;
    // Nested: { type: "content", content: { type, text } | string }
    if ("content" in o) return asDisplayText(o.content);
    // Diff-ish or other structured payloads — fall back to JSON (bounded).
    try {
      return JSON.stringify(value, null, 2).slice(0, 4000);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
