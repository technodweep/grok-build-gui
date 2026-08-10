import { useEffect, useState, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getSessionPlan, respondPermission } from "../../shared/api";
import { useAppStore } from "../../shared/store";
import type { PermissionRequest } from "../../shared/types";

function toolSummary(req: PermissionRequest): string {
  const tc = req.toolCall;
  if (!tc) return "Tool permission required";
  const title = tc.title || tc.kind || "Tool call";
  const locs = (tc.locations ?? [])
    .map((l) => (typeof l === "string" ? l : l.path))
    .filter(Boolean)
    .join(", ");
  return locs ? `${title} · ${locs}` : String(title);
}

function toolDetail(req: PermissionRequest): string | null {
  const tc = req.toolCall;
  if (!tc?.rawInput) return null;
  try {
    return typeof tc.rawInput === "string"
      ? tc.rawInput
      : JSON.stringify(tc.rawInput, null, 2).slice(0, 1500);
  } catch {
    return String(tc.rawInput);
  }
}

function toolBlob(req: PermissionRequest): string {
  const tc = req.toolCall;
  if (!tc) return "";
  let meta = "";
  try {
    meta = JSON.stringify(tc._meta ?? tc["x.ai"] ?? "");
  } catch {
    meta = "";
  }
  let raw = "";
  try {
    raw =
      typeof tc.rawInput === "string"
        ? tc.rawInput
        : JSON.stringify(tc.rawInput ?? "");
  } catch {
    raw = "";
  }
  return `${tc.title ?? ""} ${tc.kind ?? ""} ${tc.toolCallId ?? ""} ${meta} ${raw}`.toLowerCase();
}

function isExitPlan(req: PermissionRequest): boolean {
  const blob = toolBlob(req);
  return (
    blob.includes("exit_plan_mode") ||
    blob.includes("exit plan mode") ||
    blob.includes("exit-plan") ||
    blob.includes("submit for approval") ||
    blob.includes("plan approval")
  );
}

function isEnterPlan(req: PermissionRequest): boolean {
  const blob = toolBlob(req);
  return (
    blob.includes("enter_plan_mode") ||
    blob.includes("enter plan mode") ||
    blob.includes("enter-plan")
  );
}

function pickOption(
  options: PermissionRequest["options"],
  prefer: "allow" | "deny",
): string {
  if (prefer === "allow") {
    const once = options.find(
      (o) =>
        o.optionId === "allow-once" ||
        o.optionId === "allow_once" ||
        o.kind === "allow_once" ||
        /allow/i.test(o.name) && !/always/i.test(o.name),
    );
    if (once) return once.optionId;
    const any = options.find((o) => /allow/i.test(o.optionId) || /allow/i.test(o.name));
    if (any) return any.optionId;
  } else {
    const deny = options.find(
      (o) =>
        o.optionId === "reject" ||
        o.optionId === "deny" ||
        o.kind === "reject_once" ||
        /deny|reject/i.test(o.name),
    );
    if (deny) return deny.optionId;
  }
  return options[0]?.optionId ?? (prefer === "allow" ? "allow-once" : "reject");
}

export function PermissionModal() {
  const permissions = useAppStore((s) => s.permissions);
  const dequeuePermission = useAppStore((s) => s.dequeuePermission);
  const setError = useAppStore((s) => s.setError);
  const session = useAppStore((s) => s.session);
  const setSessionMode = useAppStore((s) => s.setSessionMode);
  const setPlanOpen = useAppStore((s) => s.setPlanOpen);
  const setDraft = useAppStore((s) => s.setDraft);
  const setPlanMarkdown = useAppStore((s) => s.setPlanMarkdown);
  const [busy, setBusy] = useState(false);
  const [planMd, setPlanMd] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [reviseNote, setReviseNote] = useState("");

  const current = permissions[0];
  const exitPlan = current ? isExitPlan(current) : false;
  const enterPlan = current ? isEnterPlan(current) : false;

  useEffect(() => {
    if (!current || !exitPlan) {
      setPlanMd(null);
      setReviseNote("");
      return;
    }
    const sid = current.sessionId || session?.sessionId;
    if (!sid) return;
    setPlanLoading(true);
    void getSessionPlan(sid)
      .then((md) => {
        setPlanMd(md);
        if (md) setPlanMarkdown(md);
      })
      .catch(() => setPlanMd(null))
      .finally(() => setPlanLoading(false));
  }, [current?.requestId, exitPlan, session?.sessionId, setPlanMarkdown]);

  if (!current) return null;

  const options =
    current.options?.length > 0
      ? current.options
      : [
          { optionId: "allow-once", name: "Allow once" },
          { optionId: "allow-always", name: "Allow always" },
          { optionId: "reject", name: "Deny" },
        ];

  const onChoose = async (optionId: string, after?: () => void) => {
    if (busy) return;
    setBusy(true);
    try {
      await respondPermission({
        requestId: current.requestId,
        optionId,
      });
      if (enterPlan && /allow/i.test(optionId)) {
        setSessionMode("plan");
      }
      if (exitPlan && /allow/i.test(optionId)) {
        setSessionMode("ask");
      }
      dequeuePermission();
      after?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      dequeuePermission();
    } finally {
      setBusy(false);
    }
  };

  if (exitPlan) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.55)",
          padding: 16,
        }}
      >
        <div
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
            {permissions.length > 1 ? ` · ${permissions.length} pending` : ""}
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
              <p style={{ margin: 0, color: "var(--gb-ink-muted)" }}>Loading plan.md…</p>
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
            Revision notes (optional — sent if you request changes)
            <textarea
              value={reviseNote}
              onChange={(e) => setReviseNote(e.target.value)}
              rows={2}
              placeholder="What should change in the plan?"
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
                void onChoose(pickOption(options, "deny"), () => {
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
                void onChoose(pickOption(options, "deny"), () => {
                  setSessionMode("plan");
                  const note = reviseNote.trim();
                  if (note) {
                    setDraft(note);
                  } else {
                    setDraft("Please revise the plan: ");
                  }
                })
              }
              style={btnStyle(false, false)}
            >
              Request changes
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void onChoose(pickOption(options, "allow"), () => {
                  setSessionMode("ask");
                  // Comments ride the next user turn (permission option has no free-text channel).
                  if (reviseNote.trim()) {
                    setDraft(reviseNote.trim());
                  }
                })
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

  // Enter plan mode — slightly clearer chrome; same option buttons.
  const detail = toolDetail(current);
  const header = enterPlan ? "Enter plan mode" : "Permission required";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          borderRadius: 12,
          border: "1px solid #2a3140",
          background: "#141820",
          color: "#e8ecf4",
          padding: 20,
          boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: enterPlan ? "#7c9cff" : "#f0b429",
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          {header}
          {permissions.length > 1 ? ` · ${permissions.length} pending` : ""}
        </div>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          {enterPlan
            ? "Agent wants to enter plan mode (read-only exploration)"
            : toolSummary(current)}
        </h2>
        {enterPlan ? (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "#8b95a8" }}>
            Plan mode explores the codebase and writes a plan before editing code. File edits other
            than plan.md are blocked until you approve exiting plan mode.
          </p>
        ) : null}
        {current.toolCall?.kind && !enterPlan ? (
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#8b95a8" }}>
            kind: {String(current.toolCall.kind)}
          </p>
        ) : null}
        {detail ? (
          <pre
            style={{
              marginTop: 12,
              maxHeight: 160,
              overflow: "auto",
              borderRadius: 8,
              border: "1px solid #2a3140",
              background: "#0c0e12",
              padding: 10,
              fontSize: 11,
              color: "#8b95a8",
              whiteSpace: "pre-wrap",
            }}
          >
            {detail}
          </pre>
        ) : null}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 16,
            justifyContent: "flex-end",
          }}
        >
          {options.map((opt) => {
            const id = opt.optionId;
            const isDeny =
              id === "reject" ||
              id === "deny" ||
              opt.kind === "reject_once" ||
              opt.kind === "reject_always";
            const isAlways =
              id === "allow-always" ||
              id === "allow_always" ||
              opt.kind === "allow_always";
            return (
              <button
                key={id}
                type="button"
                disabled={busy}
                onClick={() => void onChoose(id)}
                style={{
                  borderRadius: 8,
                  border: "1px solid #2a3140",
                  padding: "8px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: busy ? "wait" : "pointer",
                  background: isDeny
                    ? "rgba(240,113,120,0.15)"
                    : isAlways
                      ? "#4a6fd4"
                      : "#7c9cff",
                  color: isDeny ? "#f07178" : "#0c0e12",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {enterPlan && !isDeny
                  ? isAlways
                    ? "Always allow plan mode"
                    : "Enter plan mode"
                  : opt.name || id}
              </button>
            );
          })}
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
