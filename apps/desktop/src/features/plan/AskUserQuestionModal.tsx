import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { respondUserQuestion } from "../../shared/api";
import { useAppStore } from "../../shared/store";
import type { UserQuestionItem, UserQuestionRequest } from "../../shared/types";

const OTHER_LABEL = "Other";

type AnswerState = {
  /** Selected option labels (for multi) or single selection. */
  selected: string[];
  /** Free-text when Other is chosen. */
  otherText: string;
  /** Whether the synthetic Other row is active. */
  other: boolean;
};

function emptyAnswer(): AnswerState {
  return { selected: [], otherText: "", other: false };
}

function questionKey(q: UserQuestionItem, index: number): string {
  return q.question?.trim() || q.header?.trim() || `question-${index}`;
}

function isMulti(q: UserQuestionItem): boolean {
  return q.multiSelect === true;
}

function resolveAnswer(q: UserQuestionItem, state: AnswerState): string | null {
  const parts = [...state.selected];
  if (state.other) {
    const t = state.otherText.trim();
    if (t) parts.push(t);
    else if (!parts.length) return null;
  }
  if (!parts.length) return null;
  return isMulti(q) ? parts.join(", ") : parts[0] ?? null;
}

export function AskUserQuestionModal() {
  const queue = useAppStore((s) => s.userQuestions);
  const dequeue = useAppStore((s) => s.dequeueUserQuestion);
  const setError = useAppStore((s) => s.setError);
  const current = queue[0];
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Record<number, AnswerState>>({});
  const [activeQi, setActiveQi] = useState(0);

  useEffect(() => {
    if (!current) return;
    const init: Record<number, AnswerState> = {};
    current.questions.forEach((_, i) => {
      init[i] = emptyAnswer();
    });
    setAnswers(init);
    setActiveQi(0);
    setBusy(false);
  }, [current?.requestId]);

  const questions = current?.questions ?? [];
  const total = questions.length;

  const missing = useMemo(() => {
    if (!current) return [] as number[];
    return questions
      .map((q, i) => ({ q, i, a: resolveAnswer(q, answers[i] ?? emptyAnswer()) }))
      .filter((x) => !x.a)
      .map((x) => x.i);
  }, [current, questions, answers]);

  if (!current) return null;

  const respond = async (outcome: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await respondUserQuestion({
        requestId: current.requestId,
        outcome,
      });
      dequeue();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      dequeue();
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async () => {
    if (missing.length > 0) {
      setActiveQi(missing[0]!);
      setError(`Answer all questions (${missing.length} remaining)`);
      return;
    }
    const map: Record<string, string> = {};
    questions.forEach((q, i) => {
      const key = questionKey(q, i);
      const val = resolveAnswer(q, answers[i] ?? emptyAnswer());
      if (val) map[key] = val;
    });
    await respond({
      outcome: "accepted",
      answers: map,
      partial_answers: {},
    });
  };

  const onSkip = () => void respond({ outcome: "skip_interview" });

  const q = questions[activeQi] ?? questions[0];
  const qi = questions[activeQi] != null ? activeQi : 0;
  const state = answers[qi] ?? emptyAnswer();
  const multi = q ? isMulti(q) : false;

  const setState = (next: AnswerState) => {
    setAnswers((prev) => ({ ...prev, [qi]: next }));
  };

  const pickOption = (label: string) => {
    if (multi) {
      const set = new Set(state.selected);
      if (set.has(label)) set.delete(label);
      else set.add(label);
      setState({ ...state, selected: [...set], other: state.other });
    } else {
      setState({ selected: [label], otherText: state.otherText, other: false });
    }
  };

  const pickOther = () => {
    if (multi) {
      setState({ ...state, other: !state.other });
    } else {
      setState({ selected: [], otherText: state.otherText, other: true });
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Question from agent"
        style={{
          width: "100%",
          maxWidth: 520,
          borderRadius: 12,
          border: "1px solid var(--gb-border)",
          background: "var(--gb-surface-raised)",
          color: "var(--gb-ink)",
          padding: 20,
          boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
          maxHeight: "min(88vh, 760px)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--gb-accent)",
            fontWeight: 600,
          }}
        >
          Question from agent
          {queue.length > 1 ? ` · ${queue.length} pending` : ""}
          {total > 1 ? ` · ${qi + 1}/${total}` : ""}
        </div>

        {total > 1 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {questions.map((item, i) => {
              const done = !!resolveAnswer(item, answers[i] ?? emptyAnswer());
              const active = i === qi;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveQi(i)}
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${active ? "var(--gb-accent)" : "var(--gb-border)"}`,
                    background: active
                      ? "rgba(124,156,255,0.18)"
                      : done
                        ? "rgba(80,200,120,0.12)"
                        : "var(--gb-surface)",
                    color: "var(--gb-ink)",
                    padding: "4px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Q{i + 1}
                  {done ? " ✓" : ""}
                </button>
              );
            })}
          </div>
        ) : null}

        {q ? (
          <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            <h2 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600 }}>
              {q.question || q.header || "Please choose"}
            </h2>
            {multi ? (
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--gb-ink-muted)" }}>
                Select one or more options
              </p>
            ) : null}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(q.options ?? []).map((opt, oi) => {
                const label = opt.label || `Option ${oi + 1}`;
                const checked = state.selected.includes(label);
                return (
                  <button
                    key={`${label}-${oi}`}
                    type="button"
                    onClick={() => pickOption(label)}
                    style={optionBtn(checked)}
                  >
                    <span style={{ fontWeight: 600 }}>
                      {multi ? (checked ? "☑ " : "☐ ") : checked ? "● " : "○ "}
                      {label}
                    </span>
                    {opt.description ? (
                      <span style={{ fontSize: 12, color: "var(--gb-ink-muted)", marginTop: 2 }}>
                        {opt.description}
                      </span>
                    ) : null}
                    {opt.preview ? (
                      <pre
                        style={{
                          margin: "6px 0 0",
                          padding: 8,
                          borderRadius: 6,
                          background: "var(--gb-surface)",
                          border: "1px solid var(--gb-border)",
                          fontSize: 11,
                          whiteSpace: "pre-wrap",
                          textAlign: "left",
                          color: "var(--gb-ink-muted)",
                        }}
                      >
                        {opt.preview}
                      </pre>
                    ) : null}
                  </button>
                );
              })}

              <button type="button" onClick={pickOther} style={optionBtn(state.other)}>
                <span style={{ fontWeight: 600 }}>
                  {multi ? (state.other ? "☑ " : "☐ ") : state.other ? "● " : "○ "}
                  {OTHER_LABEL}
                </span>
                <span style={{ fontSize: 12, color: "var(--gb-ink-muted)", marginTop: 2 }}>
                  Type a custom answer
                </span>
              </button>

              {state.other ? (
                <textarea
                  value={state.otherText}
                  onChange={(e) => setState({ ...state, otherText: e.target.value, other: true })}
                  placeholder="Type your answer here"
                  rows={2}
                  autoFocus
                  style={{
                    borderRadius: 8,
                    border: "1px solid var(--gb-accent)",
                    background: "var(--gb-surface)",
                    color: "var(--gb-ink)",
                    padding: 10,
                    fontSize: 13,
                    resize: "vertical",
                  }}
                />
              ) : null}
            </div>
          </div>
        ) : (
          <p style={{ color: "var(--gb-ink-muted)" }}>No questions provided.</p>
        )}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 4,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            {total > 1 ? (
              <>
                <button
                  type="button"
                  disabled={busy || qi <= 0}
                  onClick={() => setActiveQi((i) => Math.max(0, i - 1))}
                  style={secondaryBtn}
                >
                  ← Prev
                </button>
                <button
                  type="button"
                  disabled={busy || qi >= total - 1}
                  onClick={() => setActiveQi((i) => Math.min(total - 1, i + 1))}
                  style={secondaryBtn}
                >
                  Next →
                </button>
              </>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" disabled={busy} onClick={onSkip} style={secondaryBtn}>
              Skip
            </button>
            <button
              type="button"
              disabled={busy || missing.length > 0}
              onClick={() => void onSubmit()}
              style={{
                ...primaryBtn,
                opacity: busy || missing.length > 0 ? 0.55 : 1,
              }}
            >
              {total > 1 && missing.length === 0
                ? "Submit answers"
                : total > 1 && qi < total - 1
                  ? "Submit all"
                  : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function optionBtn(selected: boolean): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    textAlign: "left",
    borderRadius: 10,
    border: `1px solid ${selected ? "var(--gb-accent)" : "var(--gb-border)"}`,
    background: selected ? "rgba(124,156,255,0.14)" : "var(--gb-surface)",
    color: "var(--gb-ink)",
    padding: "10px 12px",
    cursor: "pointer",
    fontSize: 13,
  };
}

const secondaryBtn: CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface-overlay)",
  color: "var(--gb-ink)",
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const primaryBtn: CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--gb-accent)",
  background: "var(--gb-accent)",
  color: "#0c0e12",
  padding: "8px 12px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

/** Parse agent payload into a UserQuestionRequest. */
export function normalizeUserQuestion(payload: Record<string, unknown>): UserQuestionRequest {
  const requestId = payload.requestId ?? payload.request_id ?? payload.id;
  const sessionId = (payload.sessionId ?? payload.session_id) as string | undefined;
  const toolCallId = (payload.toolCallId ?? payload.tool_call_id) as string | undefined;
  const mode = (payload.mode as string) ?? null;
  const rawQs = (payload.questions as unknown[]) ?? [];
  const questions: UserQuestionItem[] = [];
  for (const raw of rawQs) {
    if (!raw || typeof raw !== "object") continue;
    const q = raw as Record<string, unknown>;
    const optionsRaw = (q.options as unknown[]) ?? [];
    const options: UserQuestionItem["options"] = [];
    for (const o of optionsRaw) {
      if (!o || typeof o !== "object") continue;
      const opt = o as Record<string, unknown>;
      const label = String(opt.label ?? opt.name ?? "");
      if (!label) continue;
      options.push({
        label,
        description: typeof opt.description === "string" ? opt.description : null,
        preview: typeof opt.preview === "string" ? opt.preview : null,
      });
    }
    const question = String(q.question ?? q.header ?? "").trim();
    if (!question) continue;
    questions.push({
      question,
      options,
      multiSelect:
        typeof q.multiSelect === "boolean"
          ? q.multiSelect
          : typeof q.multi_select === "boolean"
            ? q.multi_select
            : null,
      header: typeof q.header === "string" ? q.header : null,
    });
  }

  return {
    requestId,
    sessionId,
    toolCallId,
    questions,
    mode,
    raw: payload,
  };
}
