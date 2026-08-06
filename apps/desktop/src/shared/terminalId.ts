/** Best-effort extraction of ACP terminal ids from tool update payloads. */

export function extractTerminalId(update: {
  rawInput?: unknown;
  rawOutput?: unknown;
  content?: unknown;
  title?: unknown;
  locations?: unknown;
  [key: string]: unknown;
}): string | undefined {
  const candidates: unknown[] = [
    update.terminalId,
    update.terminal_id,
    (update as { _meta?: { terminalId?: string } })._meta?.terminalId,
  ];

  const rawIn = asRecord(update.rawInput);
  const rawOut = asRecord(update.rawOutput);
  if (rawIn) {
    candidates.push(
      rawIn.terminalId,
      rawIn.terminal_id,
      rawIn.terminal,
      asRecord(rawIn.terminal)?.id,
      asRecord(rawIn.terminal)?.terminalId,
    );
  }
  if (rawOut) {
    candidates.push(
      rawOut.terminalId,
      rawOut.terminal_id,
      rawOut.terminal,
      asRecord(rawOut.terminal)?.id,
      asRecord(rawOut.terminal)?.terminalId,
    );
  }

  // Content blocks / locations sometimes carry terminal:// or ids
  if (Array.isArray(update.locations)) {
    for (const loc of update.locations) {
      if (typeof loc === "string") candidates.push(loc);
      else if (loc && typeof loc === "object" && "path" in loc) {
        candidates.push((loc as { path?: string }).path);
      }
    }
  }

  if (Array.isArray(update.content)) {
    for (const b of update.content) {
      if (b && typeof b === "object") {
        const o = b as Record<string, unknown>;
        candidates.push(o.terminalId, o.terminal_id, o.uri, o.text);
      }
    }
  }

  const title = String(update.title ?? "");
  for (const c of candidates) {
    const id = normalizeTerminalId(c);
    if (id) return id;
  }
  // Last resort: title like "terminal term-xyz"
  const m = title.match(/\b(term[-_]?[a-zA-Z0-9]+)\b/i);
  if (m) return m[1];
  return undefined;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function normalizeTerminalId(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  let s = v.trim();
  if (!s) return undefined;
  if (s.startsWith("terminal://")) s = s.slice("terminal://".length);
  // Ignore file paths
  if (s.includes("/") && !s.startsWith("term")) return undefined;
  if (s.length > 80) return undefined;
  // Heuristic: looks like an id
  if (/^[a-zA-Z0-9._:-]+$/.test(s) && s.length >= 3) return s;
  return undefined;
}
