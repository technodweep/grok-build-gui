import { useCallback, useEffect, useState, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getPlanModeState,
  getSessionPlan,
  saveSessionPlan,
} from "../../shared/api";
import { useAppStore } from "../../shared/store";

export function PlanViewer() {
  const open = useAppStore((s) => s.planOpen);
  const setOpen = useAppStore((s) => s.setPlanOpen);
  const session = useAppStore((s) => s.session);
  const planMarkdown = useAppStore((s) => s.planMarkdown);
  const setPlanMarkdown = useAppStore((s) => s.setPlanMarkdown);
  const planModeState = useAppStore((s) => s.planModeState);
  const setPlanModeState = useAppStore((s) => s.setPlanModeState);
  const setError = useAppStore((s) => s.setError);

  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const reload = useCallback(async () => {
    const sid = session?.sessionId;
    if (!sid) return;
    setLoading(true);
    try {
      const [md, mode] = await Promise.all([
        getSessionPlan(sid),
        getPlanModeState(sid),
      ]);
      setPlanMarkdown(md ?? null);
      setPlanModeState(mode);
      setDraft(md ?? "");
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session?.sessionId, setPlanMarkdown, setPlanModeState, setError]);

  useEffect(() => {
    if (!open) return;
    setEditing(false);
    void reload();
  }, [open, reload]);

  if (!open) return null;

  const modeLabel = planModeState?.state ?? "Unknown";
  const awaiting = !!planModeState?.awaitingPlanApproval;

  const onSave = async () => {
    const sid = session?.sessionId;
    if (!sid) return;
    setSaving(true);
    try {
      await saveSessionPlan(sid, draft);
      setPlanMarkdown(draft);
      setDirty(false);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const onCopy = async () => {
    const text = editing ? draft : planMarkdown ?? draft;
    try {
      await navigator.clipboard.writeText(text || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="gb-modal-backdrop" onClick={() => setOpen(false)}>
      <div
        className="gb-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720, maxHeight: "min(88vh, 800px)", display: "flex", flexDirection: "column" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Plan</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--gb-ink-muted)" }}>
              plan.md · mode{" "}
              <span style={{ color: "var(--gb-accent)", textTransform: "capitalize" }}>
                {modeLabel}
              </span>
              {awaiting ? " · awaiting approval" : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" style={btn} onClick={() => void reload()} disabled={loading}>
              Refresh
            </button>
            <button type="button" style={btn} onClick={() => void onCopy()}>
              Copy
            </button>
            {editing ? (
              <>
                <button
                  type="button"
                  style={btn}
                  onClick={() => {
                    setEditing(false);
                    setDraft(planMarkdown ?? "");
                    setDirty(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  style={{ ...btn, background: "var(--gb-accent)", color: "#0c0e12", borderColor: "var(--gb-accent)" }}
                  disabled={saving || !dirty}
                  onClick={() => void onSave()}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </>
            ) : (
              <button type="button" style={btn} onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
            <button type="button" style={btn} onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 14,
            flex: 1,
            minHeight: 280,
            overflow: "auto",
            borderRadius: 8,
            border: "1px solid var(--gb-border)",
            background: "var(--gb-surface)",
            padding: 14,
          }}
        >
          {loading ? (
            <p style={{ color: "var(--gb-ink-muted)", margin: 0 }}>Loading plan…</p>
          ) : editing ? (
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setDirty(true);
              }}
              spellCheck={false}
              style={{
                width: "100%",
                minHeight: 320,
                height: "100%",
                border: "none",
                outline: "none",
                resize: "vertical",
                background: "transparent",
                color: "var(--gb-ink)",
                fontFamily: "ui-monospace, Menlo, monospace",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            />
          ) : !planMarkdown?.trim() ? (
            <div style={{ color: "var(--gb-ink-muted)" }}>
              <p style={{ margin: "0 0 8px", fontWeight: 600, color: "var(--gb-warning)" }}>
                No plan written yet
              </p>
              <p style={{ margin: 0, fontSize: 13 }}>
                Enter plan mode with <kbd style={kbd}>/plan</kbd> or the status bar mode cycle,
                then ask the agent to design an approach. The plan is saved as{" "}
                <code>plan.md</code> in the session directory.
              </p>
            </div>
          ) : (
            <div className="prose-chat">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{planMarkdown}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const btn: CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface-overlay)",
  color: "var(--gb-ink)",
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
};

const kbd: CSSProperties = {
  fontFamily: "ui-monospace, Menlo, monospace",
  fontSize: 11,
  padding: "1px 5px",
  borderRadius: 4,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface-overlay)",
};
