import type { ScrollItem, SessionSignals, TurnUsage } from "./types";

/** Estimated token categories for context panel (best-effort, not agent truth). */
export interface ContextCategory {
  id: string;
  label: string;
  /** Approximate tokens (chars/4). */
  tokens: number;
  color: string;
}

/** Rough chars→tokens; good enough for relative bars. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateContextCategories(items: ScrollItem[]): ContextCategory[] {
  let user = 0;
  let agent = 0;
  let thought = 0;
  let tools = 0;
  let plan = 0;
  let system = 0;

  for (const it of items) {
    switch (it.kind) {
      case "user":
        user += estimateTokens(it.text);
        break;
      case "agent":
        agent += estimateTokens(it.text);
        break;
      case "thought":
        thought += estimateTokens(it.text);
        break;
      case "tool":
        tools += estimateTokens(
          [it.title, it.input ?? "", it.output ?? ""].join("\n"),
        );
        break;
      case "plan":
        plan += estimateTokens(it.entries.map((e) => e.content).join("\n"));
        break;
      case "system":
        system += estimateTokens(it.text);
        break;
    }
  }

  // Fixed overhead for system prompt / tools schema when we have any content.
  const totalContent = user + agent + thought + tools + plan + system;
  const overhead = totalContent > 0 ? Math.max(800, Math.round(totalContent * 0.08)) : 0;

  const cats: ContextCategory[] = [
    { id: "system", label: "System / overhead (est.)", tokens: overhead, color: "var(--gb-ink-muted)" },
    { id: "user", label: "User messages", tokens: user, color: "var(--gb-accent)" },
    { id: "agent", label: "Assistant", tokens: agent, color: "var(--gb-success)" },
    { id: "thought", label: "Thinking", tokens: thought, color: "#a78bfa" },
    { id: "tools", label: "Tools", tokens: tools, color: "var(--gb-warning)" },
    { id: "plan", label: "Plan", tokens: plan, color: "#38bdf8" },
  ];
  return cats.filter((c) => c.tokens > 0);
}

export function scaleCategoriesToUsed(
  cats: ContextCategory[],
  usedTokens: number,
): ContextCategory[] {
  if (usedTokens <= 0 || cats.length === 0) return cats;
  const sum = cats.reduce((a, c) => a + c.tokens, 0);
  if (sum <= 0) return cats;
  // Scale relative estimates so they sum ≈ used (when known from signals).
  return cats.map((c) => ({
    ...c,
    tokens: Math.max(1, Math.round((c.tokens / sum) * usedTokens)),
  }));
}

export interface UsageSummary {
  lastTurn: TurnUsage | null;
  sessionTurns: number;
  sessionToolCalls: number;
  contextUsed: number;
  contextWindow: number;
  usagePercent: number;
  model: string | null;
  durationSec: number;
}

export function buildUsageSummary(
  signals: SessionSignals | null,
  lastUsage: TurnUsage | null,
  lastTokens: number | null,
  modelId: string | null,
): UsageSummary {
  const used = signals?.contextTokensUsed ?? lastTokens ?? lastUsage?.totalTokens ?? 0;
  const window = signals?.contextWindowTokens ?? 0;
  const pct =
    signals?.usagePercent ??
    (window > 0 && used ? (used / window) * 100 : 0);
  return {
    lastTurn: lastUsage,
    sessionTurns: signals?.turnCount ?? 0,
    sessionToolCalls: signals?.toolCallCount ?? 0,
    contextUsed: used,
    contextWindow: window,
    usagePercent: pct,
    model: signals?.primaryModelId ?? modelId,
    durationSec: signals?.sessionDurationSeconds ?? 0,
  };
}
