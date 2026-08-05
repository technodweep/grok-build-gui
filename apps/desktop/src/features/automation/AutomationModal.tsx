import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  killTerminal,
  listTerminals,
  releaseTerminal,
  sendPrompt,
} from "../../shared/api";
import { nextId, useAppStore } from "../../shared/store";
import type { AutomationJob, AutomationStatus, TerminalSnapshot } from "../../shared/types";

type Tab = "tasks" | "loops" | "goals" | "workflows" | "research";

const INTERVALS = ["60s", "5m", "15m", "1h", "2h", "1d"] as const;

function statusColor(s: string): string {
  const x = s.toLowerCase();
  if (x.includes("fail") || x.includes("error") || x.includes("cancel"))
    return "var(--gb-danger)";
  if (x.includes("pause")) return "var(--gb-ink-muted)";
  if (x.includes("done") || x.includes("complete") || x === "exit 0")
    return "var(--gb-success)";
  if (x.includes("active") || x.includes("run") || x.includes("work"))
    return "var(--gb-warning)";
  return "var(--gb-ink-muted)";
}

function jobId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function AutomationModal() {
  const open = useAppStore((s) => s.automationOpen);
  const setOpen = useAppStore((s) => s.setAutomationOpen);
  const preferredTab = useAppStore((s) => s.automationTab);
  const setPreferredTab = useAppStore((s) => s.setAutomationTab);
  const jobs = useAppStore((s) => s.automationJobs);
  const upsertJob = useAppStore((s) => s.upsertAutomationJob);
  const updateJob = useAppStore((s) => s.updateAutomationJob);
  const removeJob = useAppStore((s) => s.removeAutomationJob);
  const terminals = useAppStore((s) => s.terminals);
  const setTerminals = useAppStore((s) => s.setTerminals);
  const setTerminalsOpen = useAppStore((s) => s.setTerminalsOpen);
  const setSelectedTerminalId = useAppStore((s) => s.setSelectedTerminalId);
  const status = useAppStore((s) => s.status);
  const busy = useAppStore((s) => s.busy);
  const setBusy = useAppStore((s) => s.setBusy);
  const setError = useAppStore((s) => s.setError);
  const pushItem = useAppStore((s) => s.pushItem);

  const [tab, setTab] = useState<Tab>(preferredTab);
  const [msg, setMsg] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  // Loop form
  const [loopInterval, setLoopInterval] = useState<string>("5m");
  const [loopCustom, setLoopCustom] = useState("");
  const [loopPrompt, setLoopPrompt] = useState("");

  // Goal form
  const [goalText, setGoalText] = useState("");
  const [goalBudget, setGoalBudget] = useState("");

  // Workflow form
  const [wfName, setWfName] = useState("");
  const [wfArgs, setWfArgs] = useState("");

  // Research form
  const [researchQuery, setResearchQuery] = useState("");

  useEffect(() => {
    if (open) {
      setTab(preferredTab);
      setMsg(null);
      void listTerminals().then(setTerminals).catch(() => undefined);
    }
  }, [open, preferredTab, setTerminals]);

  const loops = useMemo(() => jobs.filter((j) => j.kind === "loop"), [jobs]);
  const goals = useMemo(() => jobs.filter((j) => j.kind === "goal"), [jobs]);
  const workflows = useMemo(
    () => jobs.filter((j) => j.kind === "workflow"),
    [jobs],
  );
  const research = useMemo(
    () => jobs.filter((j) => j.kind === "research"),
    [jobs],
  );

  if (!open) return null;

  const ready = status === "ready";

  const runAgent = async (cmd: string, job?: AutomationJob) => {
    if (!ready) {
      setError("Connect a session first");
      return;
    }
    setWorking(true);
    setMsg(null);
    try {
      setBusy(true);
      pushItem({
        id: nextId(),
        kind: "system",
        text: `Automation → ${cmd}`,
      });
      await sendPrompt(cmd);
      if (job) {
        upsertJob({ ...job, lastCommand: cmd, updatedAt: Date.now() });
      }
      setMsg(`Sent: ${cmd}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setWorking(false);
    }
  };

  const onCreateLoop = async () => {
    const interval = (loopCustom.trim() || loopInterval).trim();
    const prompt = loopPrompt.trim();
    if (!prompt) {
      setError("Loop prompt required");
      return;
    }
    const cmd = `/loop ${interval} ${prompt}`;
    const job: AutomationJob = {
      id: jobId("loop"),
      kind: "loop",
      title: prompt.slice(0, 80),
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      detail: `every ${interval}`,
      lastCommand: cmd,
    };
    upsertJob(job);
    await runAgent(cmd, job);
    setLoopPrompt("");
  };

  const onSetGoal = async () => {
    const objective = goalText.trim();
    if (!objective) {
      setError("Goal objective required");
      return;
    }
    const budget = goalBudget.trim();
    const cmd = budget
      ? `/goal ${objective} --budget ${budget}`
      : `/goal ${objective}`;
    const job: AutomationJob = {
      id: jobId("goal"),
      kind: "goal",
      title: objective.slice(0, 100),
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      detail: budget ? `budget ${budget}` : undefined,
      lastCommand: cmd,
    };
    // Only keep one active goal card as primary
    for (const g of goals.filter((x) => x.status === "active")) {
      updateJob(g.id, { status: "unknown", note: "superseded" });
    }
    upsertJob(job);
    await runAgent(cmd, job);
    setGoalText("");
  };

  const onGoalAction = async (action: "status" | "pause" | "resume" | "clear") => {
    const cmd = `/goal ${action}`;
    const active = goals.find((g) => g.status === "active" || g.status === "paused");
    if (active) {
      const statusMap: Record<string, AutomationStatus> = {
        pause: "paused",
        resume: "active",
        clear: "cancelled",
        status: active.status,
      };
      updateJob(active.id, {
        status: statusMap[action] ?? active.status,
        lastCommand: cmd,
      });
    }
    await runAgent(cmd);
  };

  const onLaunchWorkflow = async () => {
    const name = wfName.trim();
    if (!name) {
      setError("Workflow name required");
      return;
    }
    const args = wfArgs.trim();
    const cmd = args ? `/workflow ${name} ${args}` : `/workflow ${name}`;
    const job: AutomationJob = {
      id: jobId("wf"),
      kind: "workflow",
      title: name,
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      detail: args || undefined,
      lastCommand: cmd,
    };
    upsertJob(job);
    await runAgent(cmd, job);
  };

  const onWfControl = async (
    action: "pause" | "resume" | "stop",
    name: string,
  ) => {
    const cmd = `/workflow ${action} ${name}`;
    const job = workflows.find((w) => w.title === name);
    if (job) {
      updateJob(job.id, {
        status:
          action === "pause"
            ? "paused"
            : action === "stop"
              ? "cancelled"
              : "active",
        lastCommand: cmd,
      });
    }
    await runAgent(cmd);
  };

  const onResearch = async () => {
    const q = researchQuery.trim();
    if (!q) {
      setError("Research query required");
      return;
    }
    const cmd = `/deep-research ${q}`;
    const job: AutomationJob = {
      id: jobId("research"),
      kind: "research",
      title: q.slice(0, 100),
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastCommand: cmd,
      note: "Follow progress via agent /workflows; report lands in chat.",
    };
    upsertJob(job);
    await runAgent(cmd, job);
    setResearchQuery("");
  };

  const onKillTerm = async (t: TerminalSnapshot) => {
    try {
      await killTerminal(t.terminalId);
      setMsg(`Killed ${t.terminalId}`);
      const next = await listTerminals();
      setTerminals(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onReleaseTerm = async (t: TerminalSnapshot) => {
    try {
      await releaseTerminal(t.terminalId);
      setMsg(`Released ${t.terminalId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const disabled = working || busy || !ready;

  return (
    <div className="gb-modal-backdrop" onClick={() => setOpen(false)}>
      <div
        className="gb-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 720,
          maxHeight: "min(90vh, 820px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Automation</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--gb-ink-muted)" }}>
              Tasks · Loops · Goals · Workflows · Research
            </p>
          </div>
          <button type="button" style={ghost} onClick={() => setOpen(false)}>
            Close
          </button>
        </div>

        {!ready ? (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--gb-warning)" }}>
            Connect a session to control agent automation. Terminals still list if any exist.
          </p>
        ) : null}
        {msg ? (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--gb-success)" }}>{msg}</p>
        ) : null}

        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          {(
            [
              ["tasks", `Tasks (${terminals.length})`],
              ["loops", `Loops (${loops.length})`],
              ["goals", `Goals (${goals.length})`],
              ["workflows", `Workflows (${workflows.length})`],
              ["research", `Research (${research.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setPreferredTab(id);
              }}
              style={chip(tab === id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", marginTop: 14, minHeight: 200 }}>
          {tab === "tasks" ? (
            <div>
              <p style={hint}>
                ACP agent terminals (background commands). Kill stops the process; Release removes it
                from the host. Open the bottom terminal panel for full output.
              </p>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <button
                  type="button"
                  style={ghost}
                  onClick={() => {
                    setTerminalsOpen(true);
                    setOpen(false);
                  }}
                >
                  Open terminal panel
                </button>
                <button
                  type="button"
                  style={ghost}
                  onClick={() =>
                    void listTerminals().then(setTerminals).catch(() => undefined)
                  }
                >
                  Refresh
                </button>
              </div>
              {terminals.length === 0 ? (
                <p style={hint}>No terminals yet. Background tool runs appear here when created.</p>
              ) : (
                <ul style={list}>
                  {terminals.map((t) => (
                    <li key={t.terminalId} style={listItem}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: t.running
                            ? "var(--gb-warning)"
                            : t.exitCode === 0
                              ? "var(--gb-success)"
                              : "var(--gb-danger)",
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            fontFamily: "ui-monospace, Menlo, monospace",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={t.command}
                        >
                          {t.command}
                        </div>
                        <div style={meta}>
                          {t.running
                            ? "running"
                            : t.signal
                              ? `signal ${t.signal}`
                              : `exit ${t.exitCode ?? "?"}`}
                          {t.cwd ? ` · ${t.cwd}` : ""}
                          {t.truncated ? " · truncated" : ""}
                        </div>
                        {t.output ? (
                          <pre style={tail}>{t.output.slice(-400)}</pre>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        style={ghost}
                        onClick={() => {
                          setSelectedTerminalId(t.terminalId);
                          setTerminalsOpen(true);
                          setOpen(false);
                        }}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        style={dangerBtn}
                        disabled={!t.running}
                        onClick={() => void onKillTerm(t)}
                      >
                        Kill
                      </button>
                      <button
                        type="button"
                        style={ghost}
                        onClick={() => void onReleaseTerm(t)}
                      >
                        Release
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {tab === "loops" ? (
            <div>
              <p style={hint}>
                <code>/loop</code> fires a prompt on an interval (min 60s). Jobs expire after 7 days.
                Cancel via agent tools or stop from chat when the agent reports a job id.
              </p>
              <div style={formBox}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {INTERVALS.map((iv) => (
                    <button
                      key={iv}
                      type="button"
                      style={chip(loopInterval === iv && !loopCustom)}
                      onClick={() => {
                        setLoopInterval(iv);
                        setLoopCustom("");
                      }}
                    >
                      {iv}
                    </button>
                  ))}
                  <input
                    style={{ ...input, width: 88 }}
                    placeholder="custom"
                    value={loopCustom}
                    onChange={(e) => setLoopCustom(e.target.value)}
                    title="e.g. 90s, 10m"
                  />
                </div>
                <textarea
                  style={{ ...input, minHeight: 72, resize: "vertical" }}
                  placeholder="Prompt to run on each tick…"
                  value={loopPrompt}
                  onChange={(e) => setLoopPrompt(e.target.value)}
                />
                <button
                  type="button"
                  style={{ ...primary, marginTop: 8 }}
                  disabled={disabled}
                  onClick={() => void onCreateLoop()}
                >
                  Start loop
                </button>
              </div>
              <JobList
                jobs={loops}
                empty="No loops started from this GUI yet."
                onRemove={removeJob}
                extra={(j) => (
                  <button
                    type="button"
                    style={ghost}
                    disabled={disabled}
                    title="Ask agent to list/cancel scheduled jobs"
                    onClick={() =>
                      void runAgent(
                        "List active /loop and scheduler jobs and cancel any that match: " +
                          j.title.slice(0, 60),
                      )
                    }
                  >
                    Ask cancel
                  </button>
                )}
              />
            </div>
          ) : null}

          {tab === "goals" ? (
            <div>
              <p style={hint}>
                Autonomous <code>/goal</code> runs across rounds with verification. Use status /
                pause / resume / clear to control the active goal.
              </p>
              <div style={formBox}>
                <textarea
                  style={{ ...input, minHeight: 72, resize: "vertical" }}
                  placeholder="Goal objective…"
                  value={goalText}
                  onChange={(e) => setGoalText(e.target.value)}
                />
                <input
                  style={{ ...input, marginTop: 8 }}
                  placeholder="Optional token budget (e.g. 500000)"
                  value={goalBudget}
                  onChange={(e) => setGoalBudget(e.target.value)}
                />
                <button
                  type="button"
                  style={{ ...primary, marginTop: 8 }}
                  disabled={disabled}
                  onClick={() => void onSetGoal()}
                >
                  Set goal
                </button>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {(["status", "pause", "resume", "clear"] as const).map((a) => (
                    <button
                      key={a}
                      type="button"
                      style={ghost}
                      disabled={disabled}
                      onClick={() => void onGoalAction(a)}
                    >
                      /goal {a}
                    </button>
                  ))}
                </div>
              </div>
              <JobList jobs={goals} empty="No goals tracked yet." onRemove={removeJob} />
            </div>
          ) : null}

          {tab === "workflows" ? (
            <div>
              <p style={hint}>
                Launch saved Rhai workflows from <code>.grok/workflows</code> or{" "}
                <code>~/.grok/workflows</code>. Control runs by display name.
              </p>
              <div style={formBox}>
                <input
                  style={input}
                  placeholder="Workflow name (e.g. review-changes)"
                  value={wfName}
                  onChange={(e) => setWfName(e.target.value)}
                />
                <input
                  style={{ ...input, marginTop: 8 }}
                  placeholder='Optional JSON args, e.g. {"target":"origin/main...HEAD"}'
                  value={wfArgs}
                  onChange={(e) => setWfArgs(e.target.value)}
                />
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    style={primary}
                    disabled={disabled}
                    onClick={() => void onLaunchWorkflow()}
                  >
                    Launch
                  </button>
                  <button
                    type="button"
                    style={ghost}
                    disabled={disabled}
                    onClick={() => void runAgent("/workflows")}
                  >
                    Ask /workflows
                  </button>
                </div>
              </div>
              <JobList
                jobs={workflows}
                empty="No workflows launched from this GUI yet."
                onRemove={removeJob}
                extra={(j) => (
                  <>
                    <button
                      type="button"
                      style={ghost}
                      disabled={disabled}
                      onClick={() => void onWfControl("pause", j.title)}
                    >
                      Pause
                    </button>
                    <button
                      type="button"
                      style={ghost}
                      disabled={disabled}
                      onClick={() => void onWfControl("resume", j.title)}
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      style={dangerBtn}
                      disabled={disabled}
                      onClick={() => void onWfControl("stop", j.title)}
                    >
                      Stop
                    </button>
                  </>
                )}
              />
            </div>
          ) : null}

          {tab === "research" ? (
            <div>
              <p style={hint}>
                <code>/deep-research</code> starts a background research workflow. Progress is in
                agent <code>/workflows</code>; the report appears in chat when ready.
              </p>
              <div style={formBox}>
                <textarea
                  style={{ ...input, minHeight: 80, resize: "vertical" }}
                  placeholder="Research query…"
                  value={researchQuery}
                  onChange={(e) => setResearchQuery(e.target.value)}
                />
                <button
                  type="button"
                  style={{ ...primary, marginTop: 8 }}
                  disabled={disabled}
                  onClick={() => void onResearch()}
                >
                  Start deep research
                </button>
              </div>
              <JobList
                jobs={research}
                empty="No research runs started from this GUI yet."
                onRemove={removeJob}
                extra={() => (
                  <button
                    type="button"
                    style={ghost}
                    disabled={disabled}
                    onClick={() => void runAgent("/workflows")}
                  >
                    Check /workflows
                  </button>
                )}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function JobList({
  jobs,
  empty,
  onRemove,
  extra,
}: {
  jobs: AutomationJob[];
  empty: string;
  onRemove: (id: string) => void;
  extra?: (j: AutomationJob) => React.ReactNode;
}) {
  if (jobs.length === 0) {
    return <p style={{ ...hint, marginTop: 12 }}>{empty}</p>;
  }
  return (
    <ul style={{ ...list, marginTop: 12 }}>
      {jobs.map((j) => (
        <li key={j.id} style={listItem}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: statusColor(j.status),
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{j.title}</div>
            <div style={meta}>
              {j.status}
              {j.detail ? ` · ${j.detail}` : ""}
              {" · "}
              {new Date(j.createdAt).toLocaleString()}
            </div>
            {j.note ? <div style={meta}>{j.note}</div> : null}
            {j.lastCommand ? (
              <div
                style={{
                  ...meta,
                  fontFamily: "ui-monospace, Menlo, monospace",
                  fontSize: 10,
                }}
              >
                {j.lastCommand}
              </div>
            ) : null}
          </div>
          {extra?.(j)}
          <button type="button" style={ghost} onClick={() => onRemove(j.id)}>
            Dismiss
          </button>
        </li>
      ))}
    </ul>
  );
}

const ghost: CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "transparent",
  color: "var(--gb-ink-muted)",
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
};

const primary: CSSProperties = {
  ...ghost,
  background: "var(--gb-accent)",
  color: "#0c0e12",
  borderColor: "var(--gb-accent)",
  fontWeight: 600,
};

const dangerBtn: CSSProperties = {
  ...ghost,
  color: "var(--gb-danger)",
  borderColor: "rgba(240,113,120,0.4)",
};

const hint: CSSProperties = {
  margin: "0 0 10px",
  fontSize: 12,
  color: "var(--gb-ink-muted)",
  lineHeight: 1.45,
};

const list: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const listItem: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-start",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface)",
};

const meta: CSSProperties = {
  fontSize: 11,
  color: "var(--gb-ink-muted)",
  marginTop: 2,
};

const formBox: CSSProperties = {
  border: "1px solid var(--gb-border)",
  borderRadius: 8,
  padding: 12,
  background: "var(--gb-surface)",
};

const input: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface-raised)",
  color: "var(--gb-ink)",
  padding: "8px 10px",
  fontSize: 13,
};

const tail: CSSProperties = {
  margin: "6px 0 0",
  maxHeight: 72,
  overflow: "auto",
  fontSize: 10,
  fontFamily: "ui-monospace, Menlo, monospace",
  color: "var(--gb-ink-muted)",
  background: "var(--gb-surface-raised)",
  borderRadius: 6,
  padding: 6,
  whiteSpace: "pre-wrap",
};

function chip(active: boolean): CSSProperties {
  return {
    borderRadius: 999,
    border: "1px solid var(--gb-border)",
    padding: "4px 10px",
    fontSize: 12,
    cursor: "pointer",
    background: active ? "var(--gb-accent)" : "var(--gb-surface-overlay)",
    color: active ? "#0c0e12" : "var(--gb-ink)",
    fontWeight: 600,
  };
}
