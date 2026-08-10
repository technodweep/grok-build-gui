import { useEffect, useState, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getSessionPlan, respondPlanApproval } from "../../shared/api";
import { useAppStore } from "../../shared/store";
import type { PlanApprovalRequest } from "../../shared/types";

/**
 * Grok `_x.ai/exit_plan_mode` approval card (TUI plan approval parity).
 * Outcomes: approved | request_changes | abandoned (+ optional comments).
 */
export function PlanApprovalModal() {
  const queue = useAppStore((s) => s.planApprovals);
  const dequeue = useAppStore((s) => s.dequeuePlanApproval);
  const setError = useAppStore((s) => s.setError);
  const session = useAppStore((s) => s.session);
  const setSessionMode = useAppStore((s) => s.setSessionMode);
  const setPlanOpen = useAppStore((s) => s.setPlanOpen);
  const setDraft = useAppStore((s) => s.setDraft);
  const setPlanMarkdown = useAppStore((s) => s.setPlanMarkdown);

  const current = queue[0];
  const [busy, setBusy] = useState(false);
  const [planMd, setPlanMd] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [reviseNote, setReviseNote] = useState("");

  useEffect(() => {
    if (!current) {
      setPlanMd(null);
      setReviseNote("");
      return;
    }
    const embedded = current.planContent?.trim() ?? "";
    if (embedded) {
      setPlanMd(embedded);
      setPlanMarkdown(embedded);
      setPlanLoading(false);
      setReviseNote("");
      setBusy(false);
      return;
    }
    const sid = current.sessionId || session?.sessionId;
    if (!sid) {
      setPlanMd(null);
      setPlanLoading(false);
      return;
    }
    setPlanLoading(true);
    setReviseNote("");
    setBusy(false);
    void getSessionPlan(sid)
      .then((md) => {
        setPlanMd(md);
        if (md) setPlanMarkdown(md);
      })
      .catch(() => setPlanMd(null))
      .finally(() => setPlanLoading(false));
  }, [current?.requestId, current?.planContent, session?.sessionId, setPlanMarkdown]);

  if (!current) return null;

  const respond = async (
    outcome: string,
    after?: () => void,
    includeComments = false,
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { outcome };
      const note = reviseNote.trim();
      if (includeComments && note) {
        body.comments = note;
      }
      await respondPlanApproval({
        requestId: current.requestId,
        outcome: body,
      });
      dequeue();
      after?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      dequeue();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 58,
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
        aria-label="Plan approval"
        style={{
          width: "100%",
          maxWidth: 640,
          maxHeight: "min(88vh, 800px)",
          display: "flex",
          flexDirection: "column",
          borderRadius: 12,
          border: "1px solid var(--gb-border)",
          background: "var(--gb-surface-raised)",
          color: "var(--gb-ink)",
          padding: 20,
          boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--gb-warning)",
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          Plan approval
          {queue.length > 1 ? ` · ${queue.length} pending` : ""}
        </div>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          Approve plan and start building?
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--gb-ink-muted)" }}>
          The agent finished planning and is requesting to leave plan mode.
        </p>

        <div
          style={{
            marginTop: 12,
            flex: 1,
            minHeight: 180,
            overflow: "auto",
            borderRadius: 8,
            border: "1px solid var(--gb-border)",
            background: "var(--gb-surface)",
            padding: 12,
          }}
        >
          {planLoading ? (
            <p style={{ margin: 0, color: "var(--gb-ink-muted)" }}>Loading plan…</p>
          ) : !planMd?.trim() ? (
            <div style={{ color: "var(--gb-ink-muted)" }}>
              <p style={{ margin: "0 0 6px", fontWeight: 600, color: "var(--gb-warning)" }}>
                No plan written yet
              </p>
              <p style={{ margin: 0, fontSize: 13 }}>
                You can still approve to start implementing, request changes, or quit plan mode.
              </p>
            </div>
          ) : (
            <div className="prose-chat">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{planMd}</ReactMarkdown>
            </div>
          )}
        </div>

        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            marginTop: 12,
            fontSize: 12,
            color: "var(--gb-ink-muted)",
          }}
        >
          Comments (optional — sent with approve or request changes)
          <textarea
            value={reviseNote}
            onChange={(e) => setReviseNote(e.target.value)}
            rows={2}
            placeholder="What should change in the plan? Or notes for implementation…"
            style={{
              borderRadius: 8,
              border: "1px solid var(--gb-border)",
              background: "var(--gb-surface)",
              color: "var(--gb-ink)",
              padding: 8,
              fontSize: 13,
              resize: "vertical",
            }}
          />
        </label>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 14,
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (planMd) {
                void navigator.clipboard.writeText(planMd).catch(() => undefined);
              }
            }}
            style={btnStyle(false, false)}
          >
            Copy plan
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void respond("abandoned", () => {
                setSessionMode("ask");
              })
            }
            style={btnStyle(true, false)}
          >
            Quit plan
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void respond(
                "request_changes",
                () => {
                  setSessionMode("plan");
                  const note = reviseNote.trim();
                  if (note) setDraft(note);
                  else setDraft("Please revise the plan: ");
                },
                true,
              )
            }
            style={btnStyle(false, false)}
          >
            Request changes
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void respond(
                "approved",
                () => {
                  setSessionMode("ask");
                  if (reviseNote.trim()) {
                    setDraft(reviseNote.trim());
                  }
                },
                true,
              )
            }
            style={btnStyle(false, true)}
          >
            {reviseNote.trim() ? "Approve w/ comments" : "Approve & build"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setPlanOpen(true)}
            style={btnStyle(false, false)}
            title="Open full plan editor"
          >
            Open editor
          </button>
        </div>
      </div>
    </div>
  );
}

function btnStyle(deny: boolean, primary: boolean): CSSProperties {
  return {
    borderRadius: 8,
    border: "1px solid var(--gb-border)",
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    background: deny
      ? "rgba(240,113,120,0.15)"
      : primary
        ? "var(--gb-accent)"
        : "var(--gb-surface-overlay)",
    color: deny ? "var(--gb-danger)" : primary ? "#0c0e12" : "var(--gb-ink)",
  };
}

export function normalizePlanApproval(payload: Record<string, unknown>): PlanApprovalRequest {
  const requestId = payload.requestId ?? payload.request_id ?? payload.id;
  const sessionId = (payload.sessionId ?? payload.session_id) as string | undefined;
  const toolCallId = (payload.toolCallId ?? payload.tool_call_id) as string | undefined;
  let planContent =
    (payload.planContent as string | undefined) ??
    (payload.plan_content as string | undefined) ??
    null;
  if (!planContent && payload.raw && typeof payload.raw === "object") {
    const raw = payload.raw as Record<string, unknown>;
    planContent =
      (raw.planContent as string | undefined) ??
      (raw.plan_content as string | undefined) ??
      null;
  }
  return {
    requestId,
    sessionId,
    toolCallId,
    planContent,
    raw: payload,
  };
}
