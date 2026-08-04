import { useState } from "react";
import { respondPermission } from "../../shared/api";
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

export function PermissionModal() {
  const permissions = useAppStore((s) => s.permissions);
  const dequeuePermission = useAppStore((s) => s.dequeuePermission);
  const setError = useAppStore((s) => s.setError);
  const [busy, setBusy] = useState(false);

  const current = permissions[0];
  if (!current) return null;

  const onChoose = async (optionId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await respondPermission({
        requestId: current.requestId,
        optionId,
      });
      dequeuePermission();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Still dequeue so the UI doesn't get stuck if the agent already timed out.
      dequeuePermission();
    } finally {
      setBusy(false);
    }
  };

  const detail = toolDetail(current);
  const options =
    current.options?.length > 0
      ? current.options
      : [
          { optionId: "allow-once", name: "Allow once" },
          { optionId: "allow-always", name: "Allow always" },
          { optionId: "reject", name: "Deny" },
        ];

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
            color: "#f0b429",
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          Permission required
          {permissions.length > 1 ? ` · ${permissions.length} pending` : ""}
        </div>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          {toolSummary(current)}
        </h2>
        {current.toolCall?.kind ? (
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
                {opt.name || id}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
