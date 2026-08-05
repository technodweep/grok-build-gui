import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { getSessionSignals } from "../../shared/api";
import { useAppStore } from "../../shared/store";
import type { SessionSignals } from "../../shared/types";

function fmt(n: number): string {
  return n.toLocaleString();
}

function pctBar(percent: number): CSSProperties {
  const p = Math.min(100, Math.max(0, percent));
  const color =
    p >= 85 ? "var(--gb-danger)" : p >= 60 ? "var(--gb-warning)" : "var(--gb-success)";
  return {
    height: 10,
    borderRadius: 999,
    background: `linear-gradient(90deg, ${color} ${p}%, var(--gb-surface-overlay) ${p}%)`,
    border: "1px solid var(--gb-border)",
  };
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "6px 0",
        borderBottom: "1px solid var(--gb-border)",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--gb-ink-muted)" }}>{label}</span>
      <span
        style={{
          fontFamily: "ui-monospace, Menlo, monospace",
          color: "var(--gb-ink)",
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function ContextPanel() {
  const open = useAppStore((s) => s.contextOpen);
  const setOpen = useAppStore((s) => s.setContextOpen);
  const session = useAppStore((s) => s.session);
  const signals = useAppStore((s) => s.signals);
  const setSignals = useAppStore((s) => s.setSignals);
  const modelId = useAppStore((s) => s.modelId);
  const lastTokens = useAppStore((s) => s.lastTokens);
  const lastUsage = useAppStore((s) => s.lastUsage);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!session?.sessionId) {
      setError("No active session");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const s = await getSessionSignals(session.sessionId);
      setSignals(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session?.sessionId, setSignals]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  // Light poll while open so the panel stays fresh during a long turn.
  useEffect(() => {
    if (!open || !session?.sessionId) return;
    const id = window.setInterval(() => {
      void getSessionSignals(session.sessionId)
        .then(setSignals)
        .catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(id);
  }, [open, session?.sessionId, setSignals]);

  if (!open) return null;

  const s: SessionSignals | null = signals;
  const used = s?.contextTokensUsed ?? lastTokens ?? 0;
  const windowTok = s?.contextWindowTokens ?? 0;
  const free = s?.freeTokens ?? (windowTok > 0 ? Math.max(0, windowTok - used) : 0);
  const pct =
    s?.usagePercent ??
    (windowTok > 0 ? (used / windowTok) * 100 : 0);

  return (
    <div className="gb-modal-backdrop" onClick={() => setOpen(false)}>
      <div className="gb-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Context & session</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={ghost} onClick={() => void refresh()} disabled={loading}>
              {loading ? "…" : "Refresh"}
            </button>
            <button type="button" style={ghost} onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>

        {error ? (
          <p style={{ color: "var(--gb-warning)", fontSize: 13, marginTop: 12 }}>{error}</p>
        ) : null}

        <section style={{ marginTop: 16 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--gb-ink-muted)",
              marginBottom: 8,
            }}
          >
            Context window
          </div>
          <div style={pctBar(pct)} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 8,
              fontSize: 12,
              color: "var(--gb-ink-muted)",
              fontFamily: "ui-monospace, Menlo, monospace",
            }}
          >
            <span>
              {fmt(used)} used
              {windowTok ? ` · ${pct.toFixed(1)}%` : ""}
            </span>
            <span>
              {windowTok ? `${fmt(free)} free / ${fmt(windowTok)}` : "window unknown"}
            </span>
          </div>
          {/* Category-style breakdown from available signals */}
          <div style={{ marginTop: 12 }}>
            <div style={stackRow}>
              <span style={{ ...stackSeg, flex: Math.max(used, 1), background: "var(--gb-accent)" }} />
              <span
                style={{
                  ...stackSeg,
                  flex: Math.max(free, 1),
                  background: "var(--gb-surface-overlay)",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: "var(--gb-ink-muted)" }}>
              <span>
                <span style={{ color: "var(--gb-accent)" }}>■</span> used
              </span>
              <span>
                <span style={{ color: "var(--gb-ink-muted)" }}>■</span> free
              </span>
            </div>
          </div>
        </section>

        <section style={{ marginTop: 20 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--gb-ink-muted)",
              marginBottom: 4,
            }}
          >
            Session
          </div>
          <Row label="Session" value={session?.sessionId?.slice(0, 13) + "…" || "—"} />
          <Row label="Model" value={s?.primaryModelId || modelId || "—"} />
          {lastUsage ? (
            <>
              <Row
                label="Last turn in/out"
                value={`${lastUsage.inputTokens?.toLocaleString() ?? "—"} / ${lastUsage.outputTokens?.toLocaleString() ?? "—"}`}
              />
              <Row
                label="Last turn total"
                value={
                  lastUsage.totalTokens != null
                    ? lastUsage.totalTokens.toLocaleString()
                    : lastTokens != null
                      ? lastTokens.toLocaleString()
                      : "—"
                }
              />
              {lastUsage.apiDurationMs != null ? (
                <Row
                  label="Last turn API"
                  value={`${(lastUsage.apiDurationMs / 1000).toFixed(2)}s`}
                />
              ) : null}
            </>
          ) : null}
          <Row label="Turns" value={s ? String(s.turnCount) : "—"} />
          <Row
            label="Messages"
            value={
              s
                ? `${s.userMessageCount} user · ${s.assistantMessageCount} assistant`
                : "—"
            }
          />
          <Row label="Tool calls" value={s ? String(s.toolCallCount) : "—"} />
          <Row label="Errors" value={s ? String(s.errorCount) : "—"} />
          <Row label="Compactions" value={s ? String(s.compactionCount) : "—"} />
          <Row
            label="Duration"
            value={s ? `${s.sessionDurationSeconds}s` : "—"}
          />
        </section>

        <section style={{ marginTop: 16 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--gb-ink-muted)",
              marginBottom: 4,
            }}
          >
            Latency & edits
          </div>
          <Row
            label="Avg TTFT"
            value={s?.avgTimeToFirstTokenMs ? `${s.avgTimeToFirstTokenMs} ms` : "—"}
          />
          <Row
            label="Avg response"
            value={s?.avgResponseTimeMs ? `${s.avgResponseTimeMs} ms` : "—"}
          />
          <Row
            label="Agent lines"
            value={
              s
                ? `+${s.agentLinesAdded} / −${s.agentLinesRemoved}`
                : "—"
            }
          />
          <Row
            label="Files touched"
            value={
              s
                ? `agent ${s.agentFilesTouched} · human ${s.humanFilesTouched} · total ${s.totalFilesTouched}`
                : "—"
            }
          />
        </section>

        {s?.toolsUsed?.length ? (
          <section style={{ marginTop: 16 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "var(--gb-ink-muted)",
                marginBottom: 6,
              }}
            >
              Tools used
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {s.toolsUsed.map((t) => (
                <span
                  key={t}
                  style={{
                    fontSize: 11,
                    fontFamily: "ui-monospace, Menlo, monospace",
                    padding: "2px 8px",
                    borderRadius: 999,
                    border: "1px solid var(--gb-border)",
                    background: "var(--gb-surface)",
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <p style={{ marginTop: 16, fontSize: 11, color: "var(--gb-ink-muted)" }}>
          Data from session <code>signals.json</code> on disk (same source as TUI{" "}
          <code>/context</code> / <code>/session-info</code>). Full prompt-category breakdown is
          agent-internal; this panel shows window use and session stats.
        </p>
      </div>
    </div>
  );
}

const ghost: CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "transparent",
  color: "var(--gb-ink-muted)",
  padding: "6px 12px",
  fontSize: 13,
  cursor: "pointer",
};

const stackRow: CSSProperties = {
  display: "flex",
  height: 8,
  borderRadius: 4,
  overflow: "hidden",
  border: "1px solid var(--gb-border)",
};

const stackSeg: CSSProperties = {
  minWidth: 2,
  height: "100%",
};
