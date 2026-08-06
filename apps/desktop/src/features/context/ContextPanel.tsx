import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { getSessionSignals, sendPrompt } from "../../shared/api";
import {
  buildUsageSummary,
  estimateContextCategories,
  scaleCategoriesToUsed,
} from "../../shared/contextEstimate";
import { nextId, useAppStore } from "../../shared/store";
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

type Tab = "context" | "usage";

export function ContextPanel() {
  const open = useAppStore((s) => s.contextOpen);
  const setOpen = useAppStore((s) => s.setContextOpen);
  const session = useAppStore((s) => s.session);
  const signals = useAppStore((s) => s.signals);
  const setSignals = useAppStore((s) => s.setSignals);
  const modelId = useAppStore((s) => s.modelId);
  const lastTokens = useAppStore((s) => s.lastTokens);
  const lastUsage = useAppStore((s) => s.lastUsage);
  const items = useAppStore((s) => s.items);
  const env = useAppStore((s) => s.env);
  const status = useAppStore((s) => s.status);
  const busy = useAppStore((s) => s.busy);
  const setBusy = useAppStore((s) => s.setBusy);
  const pushItem = useAppStore((s) => s.pushItem);
  const setError = useAppStore((s) => s.setError);
  const terminals = useAppStore((s) => s.terminals);
  const setAccountOpen = useAppStore((s) => s.setAccountOpen);
  const setAccountTab = useAppStore((s) => s.setAccountTab);
  const [error, setLocalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("context");
  const [usageRunning, setUsageRunning] = useState(false);

  const refresh = useCallback(async () => {
    if (!session?.sessionId) {
      setLocalError("No active session");
      return;
    }
    setLoading(true);
    setLocalError(null);
    try {
      const s = await getSessionSignals(session.sessionId);
      setSignals(s);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [session?.sessionId, setSignals]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open || !session?.sessionId) return;
    const id = window.setInterval(() => {
      void getSessionSignals(session.sessionId)
        .then(setSignals)
        .catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(id);
  }, [open, session?.sessionId, setSignals]);

  const s: SessionSignals | null = signals;
  const used = s?.contextTokensUsed ?? lastTokens ?? 0;
  const windowTok = s?.contextWindowTokens ?? 0;
  const free = s?.freeTokens ?? (windowTok > 0 ? Math.max(0, windowTok - used) : 0);
  const pct =
    s?.usagePercent ?? (windowTok > 0 ? (used / windowTok) * 100 : 0);

  const categories = useMemo(() => {
    const raw = estimateContextCategories(items);
    return used > 0 ? scaleCategoriesToUsed(raw, used) : raw;
  }, [items, used]);

  const catTotal = categories.reduce((a, c) => a + c.tokens, 0);

  const usage = useMemo(
    () => buildUsageSummary(signals, lastUsage, lastTokens, modelId),
    [signals, lastUsage, lastTokens, modelId],
  );

  const runAgentUsage = async () => {
    if (!session || status !== "ready") {
      setError("Connect a session first");
      return;
    }
    setUsageRunning(true);
    pushItem({
      id: nextId(),
      kind: "system",
      text: "Fetching account usage via agent /usage…",
    });
    try {
      setBusy(true);
      await sendPrompt("/usage");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setUsageRunning(false);
    }
  };

  if (!open) return null;

  return (
    <div className="gb-modal-backdrop" onClick={() => setOpen(false)}>
      <div
        className="gb-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560, maxHeight: "min(88vh, 720px)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Context & usage</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={ghost} onClick={() => void refresh()} disabled={loading}>
              {loading ? "…" : "Refresh"}
            </button>
            <button type="button" style={ghost} onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {(
            [
              ["context", "Context"],
              ["usage", "Usage"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                borderRadius: 999,
                border: "1px solid var(--gb-border)",
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                background: tab === id ? "var(--gb-accent)" : "var(--gb-surface-overlay)",
                color: tab === id ? "#0c0e12" : "var(--gb-ink)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {error ? (
          <p style={{ color: "var(--gb-warning)", fontSize: 13, marginTop: 12 }}>{error}</p>
        ) : null}

        {tab === "context" ? (
          <>
            <section style={{ marginTop: 16 }}>
              <div style={sectionLabel}>Context window</div>
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
            </section>

            <section style={{ marginTop: 18 }}>
              <div style={sectionLabel}>
                Categories{" "}
                <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                  (estimated from scrollback
                  {used ? ", scaled to signals used" : ""})
                </span>
              </div>
              {categories.length === 0 ? (
                <p style={{ margin: 0, fontSize: 12, color: "var(--gb-ink-muted)" }}>
                  No scrollback content yet to categorize.
                </p>
              ) : (
                <>
                  <div style={stackRow}>
                    {categories.map((c) => (
                      <span
                        key={c.id}
                        title={`${c.label}: ~${fmt(c.tokens)} tok`}
                        style={{
                          ...stackSeg,
                          flex: Math.max(c.tokens, 1),
                          background: c.color,
                        }}
                      />
                    ))}
                    {windowTok > 0 && free > 0 ? (
                      <span
                        title={`Free: ${fmt(free)}`}
                        style={{
                          ...stackSeg,
                          flex: Math.max(free, 1),
                          background: "var(--gb-surface-overlay)",
                        }}
                      />
                    ) : null}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    {categories.map((c) => {
                      const share = catTotal > 0 ? (c.tokens / catTotal) * 100 : 0;
                      return (
                        <div
                          key={c.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 12,
                            padding: "3px 0",
                          }}
                        >
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 2,
                              background: c.color,
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ flex: 1, color: "var(--gb-ink-muted)" }}>{c.label}</span>
                          <span
                            style={{
                              fontFamily: "ui-monospace, Menlo, monospace",
                              color: "var(--gb-ink)",
                            }}
                          >
                            ~{fmt(c.tokens)}
                            <span style={{ color: "var(--gb-ink-muted)" }}>
                              {" "}
                              ({share.toFixed(0)}%)
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>

            <section style={{ marginTop: 20 }}>
              <div style={sectionLabel}>Session</div>
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
                  {lastUsage.cachedReadTokens != null ? (
                    <Row
                      label="Cached read"
                      value={lastUsage.cachedReadTokens.toLocaleString()}
                    />
                  ) : null}
                  {lastUsage.reasoningTokens != null ? (
                    <Row
                      label="Reasoning tokens"
                      value={lastUsage.reasoningTokens.toLocaleString()}
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
              <Row label="Duration" value={s ? `${s.sessionDurationSeconds}s` : "—"} />
            </section>

            <section style={{ marginTop: 16 }}>
              <div style={sectionLabel}>Latency & edits</div>
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
                value={s ? `+${s.agentLinesAdded} / −${s.agentLinesRemoved}` : "—"}
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
                <div style={sectionLabel}>Tools used</div>
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
              Window totals from <code>signals.json</code>. Category bars are best-effort from
              local scrollback (chars÷4), scaled to used tokens when known — not agent-internal
              prompt accounting.
            </p>
          </>
        ) : (
          <>
            <section style={{ marginTop: 16 }}>
              <div style={sectionLabel}>Account & billing</div>
              <Row label="Auth" value={env?.authPresent ? "signed in" : "not detected"} />
              <Row label="Email" value={env?.authEmail || "—"} />
              <Row label="Mode" value={env?.authMode || "—"} />
              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  style={{
                    ...ghost,
                    background: "var(--gb-accent)",
                    color: "#0c0e12",
                    borderColor: "var(--gb-accent)",
                    fontWeight: 600,
                  }}
                  disabled={usageRunning || busy || status !== "ready"}
                  onClick={() => void runAgentUsage()}
                >
                  {usageRunning ? "Running /usage…" : "Run agent /usage"}
                </button>
                <button
                  type="button"
                  style={ghost}
                  onClick={() => {
                    setAccountTab("account");
                    setAccountOpen(true);
                  }}
                >
                  Account hub
                </button>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--gb-ink-muted)" }}>
                Plan quotas and spend stream into chat via agent <code>/usage</code>. Privacy /
                ZDR: Account → Privacy.
              </p>
            </section>

            <section style={{ marginTop: 20 }}>
              <div style={sectionLabel}>This session</div>
              <Row label="Model" value={usage.model || "—"} />
              <Row label="Turns" value={String(usage.sessionTurns || "—")} />
              <Row label="Tool calls" value={String(usage.sessionToolCalls || "—")} />
              <Row
                label="Context used"
                value={
                  usage.contextWindow
                    ? `${fmt(usage.contextUsed)} / ${fmt(usage.contextWindow)} (${usage.usagePercent.toFixed(1)}%)`
                    : usage.contextUsed
                      ? fmt(usage.contextUsed)
                      : "—"
                }
              />
              <Row
                label="Duration"
                value={usage.durationSec ? `${usage.durationSec}s` : "—"}
              />
              <Row
                label="Avg response"
                value={
                  usage.avgResponseMs
                    ? `${(usage.avgResponseMs / 1000).toFixed(2)}s`
                    : "—"
                }
              />
              <Row
                label="Files touched"
                value={usage.filesTouched ? String(usage.filesTouched) : "—"}
              />
              <Row
                label="Lines +/−"
                value={
                  usage.linesAdded || usage.linesRemoved
                    ? `+${usage.linesAdded} / −${usage.linesRemoved}`
                    : "—"
                }
              />
              <Row
                label="Live terminals"
                value={
                  terminals.length
                    ? `${terminals.filter((t) => t.running).length} running / ${terminals.length}`
                    : "0"
                }
              />
            </section>

            <section style={{ marginTop: 16 }}>
              <div style={sectionLabel}>Last turn (API)</div>
              {usage.lastTurn ? (
                <>
                  <Row
                    label="Input"
                    value={
                      usage.lastTurn.inputTokens != null
                        ? fmt(usage.lastTurn.inputTokens)
                        : "—"
                    }
                  />
                  <Row
                    label="Output"
                    value={
                      usage.lastTurn.outputTokens != null
                        ? fmt(usage.lastTurn.outputTokens)
                        : "—"
                    }
                  />
                  <Row
                    label="Cached read"
                    value={
                      usage.lastTurn.cachedReadTokens != null
                        ? fmt(usage.lastTurn.cachedReadTokens)
                        : "—"
                    }
                  />
                  <Row
                    label="Reasoning"
                    value={
                      usage.lastTurn.reasoningTokens != null
                        ? fmt(usage.lastTurn.reasoningTokens)
                        : "—"
                    }
                  />
                  <Row
                    label="Total"
                    value={
                      usage.lastTurn.totalTokens != null
                        ? fmt(usage.lastTurn.totalTokens)
                        : "—"
                    }
                  />
                  <Row
                    label="API time"
                    value={
                      usage.lastTurn.apiDurationMs != null
                        ? `${(usage.lastTurn.apiDurationMs / 1000).toFixed(2)}s`
                        : "—"
                    }
                  />
                  <Row
                    label="Model calls"
                    value={
                      usage.lastTurn.modelCalls != null
                        ? String(usage.lastTurn.modelCalls)
                        : "—"
                    }
                  />
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 12, color: "var(--gb-ink-muted)" }}>
                  No turn usage yet — complete a prompt to populate{" "}
                  <code>turn_completed</code> stats.
                </p>
              )}
            </section>

            <section style={{ marginTop: 16 }}>
              <div style={sectionLabel}>Context fill</div>
              <div style={pctBar(usage.usagePercent)} />
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: "var(--gb-ink-muted)",
                  fontFamily: "ui-monospace, Menlo, monospace",
                }}
              >
                {usage.usagePercent.toFixed(1)}% of window
              </div>
            </section>
          </>
        )}
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
  height: 10,
  borderRadius: 4,
  overflow: "hidden",
  border: "1px solid var(--gb-border)",
};

const stackSeg: CSSProperties = {
  minWidth: 2,
  height: "100%",
};

const sectionLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--gb-ink-muted)",
  marginBottom: 8,
};
