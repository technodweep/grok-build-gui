import { useEffect, useState, type CSSProperties } from "react";
import {
  getSessionModels,
  setSessionEffort,
  setSessionModel,
} from "../../shared/api";
import { useAppStore } from "../../shared/store";
import type { SessionModelsState } from "../../shared/types";

export function ModelPickerModal() {
  const open = useAppStore((s) => s.modelsOpen);
  const setOpen = useAppStore((s) => s.setModelsOpen);
  const models = useAppStore((s) => s.models);
  const setModels = useAppStore((s) => s.setModels);
  const setError = useAppStore((s) => s.setError);
  const session = useAppStore((s) => s.session);
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState<SessionModelsState | null>(models);

  useEffect(() => {
    if (!open) return;
    void getSessionModels()
      .then((m) => {
        setModels(m);
        setLocal(m);
      })
      .catch(() => {
        const cur = useAppStore.getState().models;
        if (cur) setLocal(cur);
      });
  }, [open, setModels]);

  useEffect(() => {
    if (models) setLocal(models);
  }, [models]);

  if (!open) return null;

  const state = local ?? models;
  const currentId = state?.currentModelId ?? null;
  const currentEffort = state?.currentEffort ?? null;
  const selected = state?.availableModels.find((m) => m.modelId === currentId);
  const efforts = selected?.reasoningEfforts ?? [];

  const applyModel = async (modelId: string) => {
    if (!session) {
      setError("No active session");
      return;
    }
    setBusy(true);
    try {
      const next = await setSessionModel(modelId);
      setModels(next);
      setLocal(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const applyEffort = async (effort: string) => {
    if (!session) {
      setError("No active session");
      return;
    }
    setBusy(true);
    try {
      const next = await setSessionEffort(effort);
      setModels(next);
      setLocal(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gb-modal-backdrop" onClick={() => setOpen(false)}>
      <div className="gb-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Model & effort</h2>
          <button type="button" style={ghost} onClick={() => setOpen(false)}>
            Close
          </button>
        </div>

        {!session ? (
          <p style={{ color: "var(--gb-ink-muted)", fontSize: 13 }}>Connect a session first.</p>
        ) : (
          <>
            <section style={{ marginTop: 16 }}>
              <div style={sectionLabel}>Model</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(state?.availableModels ?? []).length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--gb-ink-muted)", margin: 0 }}>
                    No models advertised by the agent yet.
                    {currentId ? ` Current: ${currentId}` : ""}
                  </p>
                ) : (
                  (state?.availableModels ?? []).map((m) => {
                    const sel = m.modelId === currentId;
                    return (
                      <button
                        key={m.modelId}
                        type="button"
                        disabled={busy}
                        onClick={() => void applyModel(m.modelId)}
                        style={{
                          ...optionBtn,
                          borderColor: sel ? "var(--gb-accent-dim)" : "var(--gb-border)",
                          background: sel
                            ? "var(--gb-surface-overlay)"
                            : "var(--gb-surface)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontWeight: 600 }}>{m.name}</span>
                          <span
                            style={{
                              fontFamily: "ui-monospace, Menlo, monospace",
                              fontSize: 11,
                              color: "var(--gb-ink-muted)",
                            }}
                          >
                            {m.modelId}
                          </span>
                        </div>
                        {m.description ? (
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--gb-ink-muted)",
                              marginTop: 4,
                              textAlign: "left",
                            }}
                          >
                            {m.description}
                          </div>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            {efforts.length > 0 || selected?.supportsReasoningEffort ? (
              <section style={{ marginTop: 18 }}>
                <div style={sectionLabel}>Reasoning effort</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {efforts.map((e) => {
                    const sel = e.id === currentEffort;
                    return (
                      <button
                        key={e.id}
                        type="button"
                        disabled={busy}
                        title={e.description ?? e.label}
                        onClick={() => void applyEffort(e.id)}
                        style={{
                          ...chip,
                          background: sel ? "var(--gb-accent)" : "var(--gb-surface-overlay)",
                          color: sel ? "var(--gb-surface)" : "var(--gb-ink)",
                        }}
                      >
                        {e.label}
                      </button>
                    );
                  })}
                  {efforts.length === 0 ? (
                    <>
                      {["low", "medium", "high"].map((id) => {
                        const sel = id === currentEffort;
                        return (
                          <button
                            key={id}
                            type="button"
                            disabled={busy}
                            onClick={() => void applyEffort(id)}
                            style={{
                              ...chip,
                              background: sel
                                ? "var(--gb-accent)"
                                : "var(--gb-surface-overlay)",
                              color: sel ? "var(--gb-surface)" : "var(--gb-ink)",
                            }}
                          >
                            {id}
                          </button>
                        );
                      })}
                    </>
                  ) : null}
                </div>
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--gb-ink-muted)" }}>
                  Uses ACP <code>session/set_model</code> and <code>session/set_mode</code>.
                  {busy ? " Updating…" : ""}
                </p>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

const sectionLabel: CSSProperties = {
  fontSize: 12,
  color: "var(--gb-ink-muted)",
  marginBottom: 8,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const optionBtn: CSSProperties = {
  borderRadius: 10,
  border: "1px solid var(--gb-border)",
  padding: "10px 12px",
  cursor: "pointer",
  color: "var(--gb-ink)",
  textAlign: "left",
};

const chip: CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  padding: "6px 12px",
  fontSize: 13,
  cursor: "pointer",
  textTransform: "capitalize",
};

const ghost: CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "transparent",
  color: "var(--gb-ink-muted)",
  padding: "6px 12px",
  fontSize: 13,
  cursor: "pointer",
};
