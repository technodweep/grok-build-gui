import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  cancelLiveSession,
  deleteAgentDef,
  deletePersonaDef,
  getAgentsCatalog,
  listSessionSubagents,
  saveAgentDef,
  savePersonaDef,
  switchSession,
} from "../../shared/api";
import { useAppStore } from "../../shared/store";
import type { AgentDef, AgentsCatalog, PersonaDef, SubagentInfo } from "../../shared/types";

type Tab = "agents" | "personas" | "live";

function isSubActive(s: SubagentInfo): boolean {
  const st = (s.status ?? "").toLowerCase();
  if (s.live) return true;
  if (!st) return true; // unknown → treat as possibly active
  if (st.includes("complete") || st.includes("done") || st.includes("success")) return false;
  if (st.includes("fail") || st.includes("error") || st.includes("cancel")) return false;
  return (
    st.includes("run") ||
    st.includes("work") ||
    st.includes("active") ||
    st.includes("progress") ||
    st.includes("pending")
  );
}

const DEFAULT_AGENT_BODY = `---
name: my-agent
description: Custom agent
prompt_mode: full
permission_mode: default
model: inherit
---

You are a helpful agent. Complete the assigned task thoroughly.
`;

const DEFAULT_PERSONA_BODY = `description = "Short description for the catalog"
instructions = """
You are a focused specialist. Prefer precise answers with file paths.
"""
# model = "grok-4.5"
# reasoning_effort = "medium"
# default_isolation = "none"
`;

export function AgentsModal() {
  const open = useAppStore((s) => s.agentsOpen);
  const setOpen = useAppStore((s) => s.setAgentsOpen);
  const preferredTab = useAppStore((s) => s.agentsTab);
  const setPreferredTab = useAppStore((s) => s.setAgentsTab);
  const projectCwd = useAppStore((s) => s.projectCwd);
  const session = useAppStore((s) => s.session);
  const subagents = useAppStore((s) => s.subagents);
  const setSubagents = useAppStore((s) => s.setSubagents);
  const liveSessions = useAppStore((s) => s.liveSessions);
  const setSession = useAppStore((s) => s.setSession);
  const setStatus = useAppStore((s) => s.setStatus);
  const setView = useAppStore((s) => s.setView);
  const loadScrollForSession = useAppStore((s) => s.loadScrollForSession);
  const setError = useAppStore((s) => s.setError);

  const [tab, setTab] = useState<Tab>(preferredTab);
  const [catalog, setCatalog] = useState<AgentsCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  /** Live tab: hide finished children by default (session history can be long). */
  const [showCompletedSubs, setShowCompletedSubs] = useState(false);

  const [selectedAgent, setSelectedAgent] = useState<AgentDef | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<PersonaDef | null>(null);
  const [editor, setEditor] = useState("");
  const [editName, setEditName] = useState("");
  const [creating, setCreating] = useState(false);

  const cwd = projectCwd || session?.cwd || null;

  const refresh = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const c = await getAgentsCatalog(cwd, true);
      setCatalog(c);
      if (session?.sessionId) {
        const list = await listSessionSubagents(session.sessionId).catch(() => []);
        const live = useAppStore.getState().subagents.filter((s) => s.live);
        const byId = new Map<string, SubagentInfo>();
        for (const d of list) byId.set(d.id, d);
        for (const l of live) {
          const prev = byId.get(l.id);
          byId.set(l.id, prev ? { ...prev, ...l, live: true } : l);
        }
        setSubagents(Array.from(byId.values()));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [cwd, session?.sessionId, setError, setSubagents]);

  useEffect(() => {
    if (open) {
      setFilter("");
      setTab(preferredTab);
      setCreating(false);
      setSelectedAgent(null);
      setSelectedPersona(null);
      void refresh();
    }
  }, [open, preferredTab, refresh]);

  const q = filter.trim().toLowerCase();
  const agents = useMemo(() => {
    const list = catalog?.agents ?? [];
    if (!q) return list;
    return list.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q) ||
        a.source.toLowerCase().includes(q),
    );
  }, [catalog, q]);

  const activeSubCount = useMemo(
    () => subagents.filter(isSubActive).length,
    [subagents],
  );

  const visibleSubs = useMemo(() => {
    const list = showCompletedSubs
      ? subagents
      : subagents.filter((s) => isSubActive(s));
    // Keep active first even after merge.
    return [...list].sort((a, b) => {
      const ar = isSubActive(a) ? 0 : 1;
      const br = isSubActive(b) ? 0 : 1;
      if (ar !== br) return ar - br;
      return b.id.localeCompare(a.id);
    });
  }, [subagents, showCompletedSubs]);

  const personas = useMemo(() => {
    const list = catalog?.personas ?? [];
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        p.source.toLowerCase().includes(q),
    );
  }, [catalog, q]);

  if (!open) return null;

  const selectAgent = (a: AgentDef) => {
    setCreating(false);
    setSelectedPersona(null);
    setSelectedAgent(a);
    setEditName(a.name);
    setEditor(a.body ?? "");
  };

  const selectPersona = (p: PersonaDef) => {
    setCreating(false);
    setSelectedAgent(null);
    setSelectedPersona(p);
    setEditName(p.name);
    setEditor(p.body ?? "");
  };

  const startNewAgent = () => {
    setCreating(true);
    setSelectedAgent(null);
    setSelectedPersona(null);
    setEditName("my-agent");
    setEditor(DEFAULT_AGENT_BODY);
    setTab("agents");
    setPreferredTab("agents");
  };

  const startNewPersona = () => {
    setCreating(true);
    setSelectedAgent(null);
    setSelectedPersona(null);
    setEditName("my-persona");
    setEditor(DEFAULT_PERSONA_BODY);
    setTab("personas");
    setPreferredTab("personas");
  };

  const onSave = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const saveAsAgent =
        tab === "agents" || (!!selectedAgent && !selectedPersona);
      if (saveAsAgent) {
        const saved = await saveAgentDef(editName.trim(), editor);
        setMsg(`Saved agent ${saved.name} → ${saved.path}`);
        setCreating(false);
        await refresh();
        setSelectedAgent(saved);
        setSelectedPersona(null);
      } else {
        const saved = await savePersonaDef(editName.trim(), editor);
        setMsg(`Saved persona ${saved.name} → ${saved.path}`);
        setCreating(false);
        await refresh();
        setSelectedPersona(saved);
        setSelectedAgent(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    setBusy(true);
    try {
      if (selectedAgent && !selectedAgent.readonly && selectedAgent.source === "user") {
        if (!window.confirm(`Delete user agent “${selectedAgent.name}”?`)) return;
        await deleteAgentDef(selectedAgent.name);
        setSelectedAgent(null);
        setMsg("Agent deleted.");
        await refresh();
      } else if (selectedPersona && !selectedPersona.readonly && selectedPersona.source === "user") {
        if (!window.confirm(`Delete user persona “${selectedPersona.name}”?`)) return;
        await deletePersonaDef(selectedPersona.name);
        setSelectedPersona(null);
        setMsg("Persona deleted.");
        await refresh();
      } else {
        setError("Only user-scoped definitions can be deleted from the GUI.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openChild = async (s: SubagentInfo) => {
    if (!s.childSessionId) {
      setError("No child session id");
      return;
    }
    try {
      const st = await switchSession(s.childSessionId);
      loadScrollForSession(s.childSessionId);
      setSession(st);
      setStatus("ready");
      setView("chat");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setView("dashboard");
    }
  };

  const canEdit =
    creating ||
    (selectedAgent && !selectedAgent.readonly && selectedAgent.source === "user") ||
    (selectedPersona && !selectedPersona.readonly && selectedPersona.source === "user");

  const showEditor =
    creating || selectedAgent != null || selectedPersona != null;

  return (
    <div className="gb-modal-backdrop" onClick={() => setOpen(false)}>
      <div
        className="gb-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 860,
          width: "100%",
          maxHeight: "min(92vh, 860px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Agents & personas</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--gb-ink-muted)" }}>
              Session agent types · personas · subagents spawned this session
            </p>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" style={ghost} disabled={loading || busy} onClick={() => void refresh()}>
              {loading ? "…" : "Refresh"}
            </button>
            <button type="button" style={ghost} onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>

        {msg ? (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--gb-success)" }}>{msg}</p>
        ) : null}
        {catalog?.notes?.length ? (
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--gb-warning)" }}>
            {catalog.notes.join(" · ")}
          </p>
        ) : null}

        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          {(
            [
              ["agents", `Agents (${catalog?.agents.length ?? 0})`],
              ["personas", `Personas (${catalog?.personas.length ?? 0})`],
              [
                "live",
                activeSubCount > 0
                  ? `Subagents (${activeSubCount} active · ${subagents.length})`
                  : `Subagents (${subagents.length})`,
              ],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setPreferredTab(id);
                setCreating(false);
              }}
              style={chip(tab === id)}
            >
              {label}
            </button>
          ))}
          {tab === "agents" ? (
            <button type="button" style={primary} onClick={startNewAgent}>
              New agent
            </button>
          ) : null}
          {tab === "personas" ? (
            <button type="button" style={primary} onClick={startNewPersona}>
              New persona
            </button>
          ) : null}
        </div>

        {tab !== "live" ? (
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            style={search}
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginTop: 10,
              flexWrap: "wrap",
            }}
          >
            <p style={{ ...hint, margin: 0, maxWidth: 420 }}>
              Real children the agent spawned this session (saved under the session folder). Not a
              bug if many finished tasks appear — toggle completed to review history.
            </p>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "var(--gb-ink-muted)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <input
                type="checkbox"
                checked={showCompletedSubs}
                onChange={(e) => setShowCompletedSubs(e.target.checked)}
              />
              Show completed ({Math.max(0, subagents.length - activeSubCount)})
            </label>
          </div>
        )}

        <div
          style={{
            flex: 1,
            minHeight: 280,
            marginTop: 12,
            display: "flex",
            gap: 12,
            overflow: "hidden",
          }}
        >
          {tab === "live" ? (
            <div style={{ flex: 1, overflowY: "auto" }}>
              {subagents.length === 0 ? (
                <p style={hint}>
                  No subagents for this session. When the agent spawns children they appear here
                  (and in the chat strip).
                </p>
              ) : visibleSubs.length === 0 ? (
                <p style={hint}>
                  No active subagents. {subagents.length} completed — enable{" "}
                  <strong>Show completed</strong> to list them.
                </p>
              ) : (
                <ul style={list}>
                  {visibleSubs.map((s) => {
                    const onRoster =
                      !!s.childSessionId &&
                      liveSessions.some((x) => x.sessionId === s.childSessionId);
                    const active = isSubActive(s);
                    const iso =
                      s.isolation ||
                      (s.worktreePath ? "worktree" : null);
                    const displayName =
                      s.title || s.name || s.agentType || s.id.slice(0, 8);
                    return (
                      <li key={s.id} style={listItem}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>
                            {displayName}
                            {s.agentType ? (
                              <span
                                style={{
                                  fontWeight: 400,
                                  color: "var(--gb-ink-muted)",
                                  marginLeft: 6,
                                }}
                              >
                                {s.agentType}
                              </span>
                            ) : null}
                          </div>
                          <div style={meta}>
                            <span
                              style={{
                                color: active
                                  ? "var(--gb-warning)"
                                  : (s.status ?? "").toLowerCase().includes("fail")
                                    ? "var(--gb-danger)"
                                    : "var(--gb-success)",
                              }}
                            >
                              {s.status || (active ? "running" : "completed")}
                            </span>
                            {s.persona ? ` · persona ${s.persona}` : ""}
                            {iso ? ` · isolation ${iso}` : ""}
                            {s.modelId ? ` · ${s.modelId}` : ""}
                            {s.live ? " · live stream" : ""}
                            {onRoster ? " · on roster" : ""}
                            {" · "}
                            <span title={s.id} style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>
                              {s.id.slice(0, 8)}…
                            </span>
                          </div>
                          {s.worktreePath ? (
                            <div style={{ ...meta, fontSize: 10 }} title={s.worktreePath}>
                              worktree: {s.worktreePath}
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          style={ghost}
                          disabled={!s.childSessionId}
                          onClick={() => void openChild(s)}
                          title="Open child session if still on the agent roster"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          style={dangerBtn}
                          disabled={!s.childSessionId || !active}
                          onClick={() =>
                            void cancelLiveSession(s.childSessionId!)
                              .then(() => setMsg(`Cancelled ${s.childSessionId!.slice(0, 8)}…`))
                              .catch((e) =>
                                setError(e instanceof Error ? e.message : String(e)),
                              )
                          }
                          title={
                            active
                              ? "Cancel running child"
                              : "Already finished — nothing to stop"
                          }
                        >
                          Stop
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : (
            <>
              <div
                style={{
                  width: showEditor ? 280 : "100%",
                  flexShrink: 0,
                  overflowY: "auto",
                  borderRight: showEditor ? "1px solid var(--gb-border)" : undefined,
                  paddingRight: showEditor ? 8 : 0,
                }}
              >
                <ul style={list}>
                  {(tab === "agents" ? agents : personas).map((item) => {
                    const isAgent = tab === "agents";
                    const a = item as AgentDef;
                    const p = item as PersonaDef;
                    const name = isAgent ? a.name : p.name;
                    const selected = isAgent
                      ? selectedAgent?.name === a.name && selectedAgent?.path === a.path
                      : selectedPersona?.name === p.name && selectedPersona?.path === p.path;
                    return (
                      <li key={`${item.source}-${item.path}`}>
                        <button
                          type="button"
                          onClick={() =>
                            isAgent ? selectAgent(a) : selectPersona(p)
                          }
                          style={{
                            ...listItem,
                            width: "100%",
                            textAlign: "left",
                            cursor: "pointer",
                            borderColor: selected ? "var(--gb-accent)" : "var(--gb-border)",
                            background: selected
                              ? "rgba(124,156,255,0.1)"
                              : "var(--gb-surface)",
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{name}</span>
                              <span style={{ fontSize: 10, color: "var(--gb-ink-muted)" }}>
                                {item.source}
                              </span>
                              {item.readonly ? (
                                <span style={{ fontSize: 10, color: "var(--gb-ink-muted)" }}>
                                  ro
                                </span>
                              ) : null}
                            </div>
                            <div style={meta}>
                              {isAgent
                                ? a.description?.slice(0, 100) || a.permissionMode || a.model || "—"
                                : p.description?.slice(0, 100) ||
                                  p.defaultIsolation ||
                                  p.model ||
                                  "—"}
                            </div>
                            {!isAgent && p.defaultIsolation ? (
                              <div style={{ ...meta, color: "var(--gb-warning)", fontSize: 10 }}>
                                default isolation: {p.defaultIsolation}
                              </div>
                            ) : null}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {(tab === "agents" ? agents : personas).length === 0 ? (
                  <p style={hint}>No matches.</p>
                ) : null}
              </div>

              {showEditor ? (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 0,
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <label style={{ fontSize: 12, color: "var(--gb-ink-muted)", flexShrink: 0 }}>
                      Name
                    </label>
                    <input
                      style={{ ...input, flex: 1 }}
                      value={editName}
                      disabled={!canEdit && !creating}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--gb-ink-muted)" }}>
                    {selectedAgent?.path ||
                      selectedPersona?.path ||
                      (tab === "agents"
                        ? catalog?.userAgentsDir
                        : catalog?.userPersonasDir) ||
                      ""}
                    {canEdit ? "" : " · read-only (copy into a user definition to edit)"}
                  </div>
                  <textarea
                    value={editor}
                    onChange={(e) => setEditor(e.target.value)}
                    readOnly={!canEdit && !creating}
                    spellCheck={false}
                    style={{
                      flex: 1,
                      minHeight: 220,
                      borderRadius: 8,
                      border: "1px solid var(--gb-border)",
                      background: "var(--gb-surface)",
                      color: "var(--gb-ink)",
                      padding: 10,
                      fontFamily: "ui-monospace, Menlo, monospace",
                      fontSize: 12,
                      resize: "vertical",
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    {!creating &&
                    ((selectedAgent && selectedAgent.readonly) ||
                      (selectedPersona && selectedPersona.readonly)) ? (
                      <button
                        type="button"
                        style={ghost}
                        onClick={() => {
                          setCreating(true);
                          setEditName(
                            (selectedAgent?.name || selectedPersona?.name || "custom") + "-copy",
                          );
                          setMsg("Editing a copy under ~/.grok — Save to create.");
                        }}
                      >
                        Fork to user
                      </button>
                    ) : null}
                    {(selectedAgent?.source === "user" || selectedPersona?.source === "user") &&
                    !creating ? (
                      <button type="button" style={dangerBtn} disabled={busy} onClick={() => void onDelete()}>
                        Delete
                      </button>
                    ) : null}
                    <button
                      type="button"
                      style={primary}
                      disabled={busy || (!canEdit && !creating)}
                      onClick={() => void onSave()}
                    >
                      {busy ? "Saving…" : "Save to ~/.grok"}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1, color: "var(--gb-ink-muted)", fontSize: 13, padding: 12 }}>
                  Select an entry to preview. Bundled definitions are read-only; create or fork into{" "}
                  <code>~/.grok/agents</code> / <code>~/.grok/personas</code> to customize.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
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
  margin: 0,
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
  alignItems: "center",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface)",
};

const meta: CSSProperties = {
  fontSize: 11,
  color: "var(--gb-ink-muted)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  marginTop: 2,
};

const search: CSSProperties = {
  marginTop: 10,
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface)",
  color: "var(--gb-ink)",
  padding: "8px 10px",
  fontSize: 13,
};

const input: CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface)",
  color: "var(--gb-ink)",
  padding: "6px 10px",
  fontSize: 13,
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
