import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { respondElicitation } from "../../shared/api";
import { useAppStore } from "../../shared/store";
import type { ElicitationProperty, ElicitationRequest } from "../../shared/types";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function defaultValues(req: ElicitationRequest): Record<string, unknown> {
  const props = req.requestedSchema?.properties ?? {};
  const out: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(props)) {
    if (prop && typeof prop === "object" && "default" in prop && prop.default !== undefined) {
      out[key] = prop.default;
    } else if (prop?.type === "boolean") {
      out[key] = false;
    } else if (prop?.type === "array") {
      out[key] = [];
    } else {
      out[key] = "";
    }
  }
  return out;
}

function fieldLabel(key: string, prop: ElicitationProperty): string {
  return prop.title || key;
}

export function ElicitationModal() {
  const queue = useAppStore((s) => s.elicitations);
  const dequeue = useAppStore((s) => s.dequeueElicitation);
  const setError = useAppStore((s) => s.setError);
  const current = queue[0];
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [urlConsent, setUrlConsent] = useState(false);

  useEffect(() => {
    if (!current) return;
    setValues(defaultValues(current));
    setUrlConsent(false);
    setBusy(false);
  }, [current?.requestId]);

  const required = useMemo(
    () => new Set(current?.requestedSchema?.required ?? []),
    [current],
  );

  if (!current) return null;

  const mode = (current.mode ?? "form").toLowerCase();
  const isUrl = mode === "url";
  const props = current.requestedSchema?.properties ?? {};
  const keys = Object.keys(props);

  const missingRequired = keys.filter((k) => {
    if (!required.has(k)) return false;
    const v = values[k];
    if (v == null) return true;
    if (typeof v === "string" && !v.trim()) return true;
    if (Array.isArray(v) && v.length === 0) return true;
    return false;
  });

  const respond = async (outcome: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await respondElicitation({
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

  const onAccept = async () => {
    if (isUrl) {
      if (!urlConsent || !current.url) return;
      try {
        await openUrl(current.url);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      await respond({ action: "accept" });
      return;
    }
    if (missingRequired.length > 0) {
      setError(`Required: ${missingRequired.join(", ")}`);
      return;
    }
    // Coerce empty strings for optional fields; parse numbers.
    const content: Record<string, unknown> = {};
    for (const [k, prop] of Object.entries(props)) {
      let v = values[k];
      if (prop?.type === "number" || prop?.type === "integer") {
        if (v === "" || v == null) {
          if (required.has(k)) continue;
          continue;
        }
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(n)) {
          setError(`Invalid number for ${k}`);
          return;
        }
        v = prop.type === "integer" ? Math.trunc(n) : n;
      }
      if (prop?.type === "boolean") {
        v = !!v;
      }
      if (v === "" && !required.has(k)) continue;
      content[k] = v;
    }
    await respond({ action: "accept", content });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 55,
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
          border: "1px solid var(--gb-border)",
          background: "var(--gb-surface-raised)",
          color: "var(--gb-ink)",
          padding: 20,
          boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
          maxHeight: "min(85vh, 720px)",
          overflow: "auto",
        }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--gb-accent)",
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          {isUrl ? "Authorization required" : "Question from agent"}
          {queue.length > 1 ? ` · ${queue.length} pending` : ""}
        </div>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
          {current.message?.trim() || (isUrl ? "Open external URL" : "Please answer")}
        </h2>

        {isUrl ? (
          <div style={{ marginTop: 14 }}>
            <p style={{ margin: 0, fontSize: 13, color: "var(--gb-ink-muted)" }}>
              The agent wants to open this URL in your browser. Review the host carefully before
              consenting.
            </p>
            <pre
              style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 8,
                border: "1px solid var(--gb-border)",
                background: "var(--gb-surface)",
                fontSize: 12,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {current.url || "(no url)"}
            </pre>
            <p style={{ fontSize: 12, color: "var(--gb-warning)", margin: "8px 0 0" }}>
              Host: <strong>{current.url ? hostOf(current.url) : "—"}</strong>
            </p>
            <label
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                marginTop: 12,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={urlConsent}
                onChange={(e) => setUrlConsent(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>I consent to open this URL in my browser</span>
            </label>
          </div>
        ) : (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            {keys.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--gb-ink-muted)" }}>
                No form fields provided. You can still accept or decline.
              </p>
            ) : (
              keys.map((key) => {
                const prop = props[key] ?? {};
                const req = required.has(key);
                return (
                  <Field
                    key={key}
                    name={key}
                    prop={prop}
                    required={req}
                    value={values[key]}
                    onChange={(v) => setValues((prev) => ({ ...prev, [key]: v }))}
                  />
                );
              })
            )}
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 18,
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            disabled={busy}
            onClick={() => void respond({ action: "cancel" })}
            style={secondaryBtn}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void respond({ action: "decline" })}
            style={{
              ...secondaryBtn,
              background: "rgba(240,113,120,0.12)",
              color: "var(--gb-danger)",
            }}
          >
            Decline
          </button>
          <button
            type="button"
            disabled={busy || (isUrl && !urlConsent)}
            onClick={() => void onAccept()}
            style={{
              ...primaryBtn,
              opacity: busy || (isUrl && !urlConsent) ? 0.55 : 1,
            }}
          >
            {isUrl ? "Open & accept" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  name,
  prop,
  required,
  value,
  onChange,
}: {
  name: string;
  prop: ElicitationProperty;
  required: boolean;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = fieldLabel(name, prop);
  const enumVals = prop.enum;
  const isBool = prop.type === "boolean";
  const isNumber = prop.type === "number" || prop.type === "integer";
  const isMulti =
    prop.type === "array" &&
    (Array.isArray(prop.items?.enum) || prop.items?.type === "string");

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
      <span style={{ fontWeight: 600 }}>
        {label}
        {required ? <span style={{ color: "var(--gb-danger)" }}> *</span> : null}
      </span>
      {prop.description ? (
        <span style={{ fontSize: 12, color: "var(--gb-ink-muted)" }}>{prop.description}</span>
      ) : null}
      {isBool ? (
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          style={{ width: 18, height: 18 }}
        />
      ) : enumVals && enumVals.length > 0 ? (
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        >
          <option value="">— select —</option>
          {enumVals.map((opt) => (
            <option key={String(opt)} value={String(opt)}>
              {String(opt)}
            </option>
          ))}
        </select>
      ) : isMulti && Array.isArray(prop.items?.enum) ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {(prop.items?.enum ?? []).map((opt) => {
            const arr = Array.isArray(value) ? (value as unknown[]) : [];
            const checked = arr.map(String).includes(String(opt));
            return (
              <label
                key={String(opt)}
                style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = new Set(arr.map(String));
                    if (e.target.checked) next.add(String(opt));
                    else next.delete(String(opt));
                    onChange([...next]);
                  }}
                />
                {String(opt)}
              </label>
            );
          })}
        </div>
      ) : (
        <input
          type={isNumber ? "number" : prop.format === "email" ? "email" : "text"}
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
          min={prop.minimum}
          max={prop.maximum}
          maxLength={prop.maxLength}
          style={inputStyle}
        />
      )}
    </label>
  );
}

const inputStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface)",
  color: "var(--gb-ink)",
  padding: "8px 10px",
  fontSize: 13,
};

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
