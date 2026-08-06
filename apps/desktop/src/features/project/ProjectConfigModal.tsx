import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  deleteCustomModel,
  ensureAgentsMd,
  getCustomModels,
  getProjectRule,
  getProjectRules,
  saveCustomModel,
  saveProjectRule,
  setDefaultModelConfig,
} from "../../shared/api";
import { activateModalA11y } from "../../shared/modalA11y";
import { useAppStore } from "../../shared/store";
import type {
  CustomModelDef,
  CustomModelsCatalog,
  ProjectRuleFile,
  ProjectRulesCatalog,
} from "../../shared/types";

type Tab = "rules" | "models";

const btn: CSSProperties = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface)",
  color: "var(--gb-ink)",
  cursor: "pointer",
};

const tabBtn = (active: boolean): CSSProperties => ({
  ...btn,
  borderColor: active ? "var(--gb-accent-dim)" : "var(--gb-border)",
  color: active ? "var(--gb-accent)" : "var(--gb-ink)",
  fontWeight: active ? 600 : 400,
});

const primary: CSSProperties = {
  ...btn,
  background: "var(--gb-accent)",
  color: "#fff",
  borderColor: "transparent",
};

const input: CSSProperties = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-bg)",
  color: "var(--gb-ink)",
  padding: "6px 10px",
  fontSize: 13,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

export function ProjectConfigModal() {
  const open = useAppStore((s) => s.projectConfigOpen);
  const setOpen = useAppStore((s) => s.setProjectConfigOpen);
  const preferredTab = useAppStore((s) => s.projectConfigTab);
  const setPreferredTab = useAppStore((s) => s.setProjectConfigTab);
  const projectCwd = useAppStore((s) => s.projectCwd);
  const session = useAppStore((s) => s.session);
  const setError = useAppStore((s) => s.setError);

  const cwd = projectCwd || session?.cwd || null;
  const [tab, setTab] = useState<Tab>(preferredTab);
  const [msg, setMsg] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Rules state
  const [rules, setRules] = useState<ProjectRulesCatalog | null>(null);
  const [selected, setSelected] = useState<ProjectRuleFile | null>(null);
  const [editor, setEditor] = useState("");
  const [dirty, setDirty] = useState(false);

  // Models state
  const [catalog, setCatalog] = useState<CustomModelsCatalog | null>(null);
  const [editing, setEditing] = useState<CustomModelDef | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    id: "",
    model: "",
    name: "",
    description: "",
    baseUrl: "",
    apiBackend: "chat_completions",
    apiKey: "",
    envKey: "",
    contextWindow: "",
    temperature: "",
  });

  useEffect(() => {
    if (!open || !panelRef.current) return;
    return activateModalA11y(panelRef.current, { onClose: () => setOpen(false) });
  }, [open, setOpen]);

  const refreshRules = useCallback(async () => {
    try {
      const c = await getProjectRules(cwd);
      setRules(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [cwd, setError]);

  const refreshModels = useCallback(async () => {
    try {
      const c = await getCustomModels();
      setCatalog(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [setError]);

  useEffect(() => {
    if (!open) return;
    setTab(preferredTab);
    setMsg(null);
    setDirty(false);
    setSelected(null);
    setEditor("");
    setCreating(false);
    setEditing(null);
    void refreshRules();
    void refreshModels();
  }, [open, preferredTab, refreshModels, refreshRules]);

  if (!open) return null;

  const switchTab = (t: Tab) => {
    setTab(t);
    setPreferredTab(t);
  };

  const selectRule = async (f: ProjectRuleFile) => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    setSelected(f);
    setDirty(false);
    try {
      const body = await getProjectRule(f.path);
      setEditor(body.content);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onSaveRule = async () => {
    if (!selected) return;
    setWorking(true);
    try {
      await saveProjectRule(selected.path, editor, cwd);
      setDirty(false);
      setMsg(`Saved ${selected.relPath}`);
      await refreshRules();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  const onCreateAgents = async () => {
    if (!cwd) {
      setError("Open a project folder first");
      return;
    }
    setWorking(true);
    try {
      const path = await ensureAgentsMd(cwd);
      setMsg(`Created ${path}`);
      await refreshRules();
      const f = (await getProjectRules(cwd)).files.find((x) => x.path === path);
      if (f) await selectRule(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  const onCreateHomeRule = async () => {
    if (!rules?.homeRulesDir) return;
    const name = window.prompt("Rule file name (e.g. conventions.md)", "conventions.md");
    if (!name?.trim()) return;
    const file = name.trim().endsWith(".md") ? name.trim() : `${name.trim()}.md`;
    const path = `${rules.homeRulesDir.replace(/\/+$/, "")}/${file}`;
    setWorking(true);
    try {
      await saveProjectRule(
        path,
        `# ${file}\n\n<!-- Home-level rule applied to all projects -->\n\n`,
        cwd,
      );
      setMsg(`Created ${path}`);
      await refreshRules();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  const startNewModel = () => {
    setCreating(true);
    setEditing(null);
    setForm({
      id: "my-model",
      model: "",
      name: "",
      description: "",
      baseUrl: "https://api.example.com/v1",
      apiBackend: "chat_completions",
      apiKey: "",
      envKey: "",
      contextWindow: "128000",
      temperature: "",
    });
  };

  const startEditModel = (m: CustomModelDef) => {
    setCreating(false);
    setEditing(m);
    setForm({
      id: m.id,
      model: m.model ?? "",
      name: m.name ?? "",
      description: m.description ?? "",
      baseUrl: m.baseUrl ?? "",
      apiBackend: m.apiBackend ?? "chat_completions",
      apiKey: "",
      envKey: m.envKey ?? "",
      contextWindow: m.contextWindow != null ? String(m.contextWindow) : "",
      temperature: m.temperature != null ? String(m.temperature) : "",
    });
  };

  const onSaveModel = async () => {
    setWorking(true);
    setMsg(null);
    try {
      const saved = await saveCustomModel({
        id: form.id.trim(),
        model: form.model.trim() || null,
        name: form.name.trim() || null,
        description: form.description.trim() || null,
        baseUrl: form.baseUrl.trim() || null,
        apiBackend: form.apiBackend.trim() || null,
        apiKey: form.apiKey.trim() || null,
        envKey: form.envKey.trim() || null,
        contextWindow: form.contextWindow
          ? Number(form.contextWindow)
          : null,
        temperature: form.temperature ? Number(form.temperature) : null,
      });
      setMsg(`Saved [model.${saved.id}]`);
      setCreating(false);
      setEditing(saved);
      setForm((f) => ({ ...f, apiKey: "" }));
      await refreshModels();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  const onDeleteModel = async () => {
    const id = editing?.id ?? form.id;
    if (!id) return;
    if (!window.confirm(`Delete [model.${id}] from config.toml?`)) return;
    setWorking(true);
    try {
      await deleteCustomModel(id);
      setMsg(`Deleted model ${id}`);
      setEditing(null);
      setCreating(false);
      await refreshModels();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  const onSetDefault = async (id: string | null) => {
    setWorking(true);
    try {
      await setDefaultModelConfig(id);
      setMsg(id ? `[models].default = ${id}` : "Cleared [models].default");
      await refreshModels();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  const showEditor = creating || editing != null;

  return (
    <div className="gb-modal-backdrop" onClick={() => setOpen(false)}>
      <div
        ref={panelRef}
        className="gb-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 920,
          width: "94vw",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Project & models</div>
            <div style={{ fontSize: 12, color: "var(--gb-ink-muted)", marginTop: 2 }}>
              AGENTS.md / rules · custom model endpoints
            </div>
          </div>
          <button type="button" style={btn} onClick={() => setOpen(false)} aria-label="Close dialog">
            Close
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button type="button" style={tabBtn(tab === "rules")} onClick={() => switchTab("rules")}>
            Project rules
          </button>
          <button type="button" style={tabBtn(tab === "models")} onClick={() => switchTab("models")}>
            Custom models
          </button>
        </div>

        {msg ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--gb-success)",
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid var(--gb-border)",
            }}
          >
            {msg}
          </div>
        ) : null}

        {tab === "rules" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(180px, 240px) 1fr",
              gap: 12,
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button
                  type="button"
                  style={btn}
                  disabled={!cwd || working}
                  onClick={() => void onCreateAgents()}
                >
                  New AGENTS.md
                </button>
                <button
                  type="button"
                  style={btn}
                  disabled={working}
                  onClick={() => void onCreateHomeRule()}
                >
                  New home rule
                </button>
                <button type="button" style={btn} onClick={() => void refreshRules()}>
                  Refresh
                </button>
              </div>
              {rules?.notes?.map((n, i) => (
                <div key={i} style={{ fontSize: 11, color: "var(--gb-ink-muted)" }}>
                  • {n}
                </div>
              ))}
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  border: "1px solid var(--gb-border)",
                  borderRadius: 10,
                  background: "var(--gb-bg)",
                }}
              >
                {(rules?.files ?? []).length === 0 ? (
                  <div style={{ padding: 12, fontSize: 12, color: "var(--gb-ink-muted)" }}>
                    No rule files found.
                  </div>
                ) : (
                  (rules?.files ?? []).map((f) => (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() => void selectRule(f)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 10px",
                        border: "none",
                        borderBottom: "1px solid var(--gb-border)",
                        background:
                          selected?.path === f.path ? "var(--gb-surface)" : "transparent",
                        color: "var(--gb-ink)",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{f.name}</div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--gb-ink-muted)",
                          fontFamily: "ui-monospace, Menlo, monospace",
                        }}
                      >
                        {f.scope} · {f.relPath}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
              {selected ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <code
                      style={{
                        fontSize: 11,
                        color: "var(--gb-ink-muted)",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={selected.path}
                    >
                      {selected.path}
                    </code>
                    <button
                      type="button"
                      style={primary}
                      disabled={!selected.writable || working || !dirty}
                      onClick={() => void onSaveRule()}
                    >
                      Save
                    </button>
                  </div>
                  <textarea
                    value={editor}
                    onChange={(e) => {
                      setEditor(e.target.value);
                      setDirty(true);
                    }}
                    readOnly={!selected.writable}
                    style={{
                      ...input,
                      flex: 1,
                      minHeight: 280,
                      fontFamily: "ui-monospace, Menlo, monospace",
                      fontSize: 12,
                      lineHeight: 1.45,
                      resize: "vertical",
                    }}
                  />
                </>
              ) : (
                <div
                  style={{
                    flex: 1,
                    display: "grid",
                    placeItems: "center",
                    color: "var(--gb-ink-muted)",
                    fontSize: 13,
                    border: "1px dashed var(--gb-border)",
                    borderRadius: 10,
                  }}
                >
                  Select a rule file, or create AGENTS.md for this project.
                </div>
              )}
            </div>
          </div>
        ) : null}

        {tab === "models" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(160px, 220px) 1fr",
              gap: 12,
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
              <div style={{ fontSize: 12, color: "var(--gb-ink-muted)" }}>
                Default:{" "}
                <strong>{catalog?.defaultModel || "—"}</strong>
              </div>
              <button type="button" style={primary} onClick={startNewModel}>
                Add model
              </button>
              <button type="button" style={btn} onClick={() => void refreshModels()}>
                Refresh
              </button>
              {catalog?.notes?.map((n, i) => (
                <div key={i} style={{ fontSize: 11, color: "var(--gb-ink-muted)" }}>
                  • {n}
                </div>
              ))}
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  border: "1px solid var(--gb-border)",
                  borderRadius: 10,
                  background: "var(--gb-bg)",
                }}
              >
                {(catalog?.models ?? []).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => startEditModel(m)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 10px",
                      border: "none",
                      borderBottom: "1px solid var(--gb-border)",
                      background:
                        editing?.id === m.id ? "var(--gb-surface)" : "transparent",
                      color: "var(--gb-ink)",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{m.name || m.id}</div>
                    <div style={{ fontSize: 10, color: "var(--gb-ink-muted)" }}>
                      {m.model || m.id}
                      {m.hasApiKey ? " · key" : ""}
                      {m.envKey ? ` · env:${m.envKey}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ overflow: "auto", minHeight: 0 }}>
              {showEditor ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Field
                    label="Config id ([model.<id>])"
                    value={form.id}
                    onChange={(v) => setForm((f) => ({ ...f, id: v }))}
                    disabled={!creating}
                    mono
                  />
                  <Field
                    label="API model id"
                    value={form.model}
                    onChange={(v) => setForm((f) => ({ ...f, model: v }))}
                    placeholder="model-id sent to provider"
                  />
                  <Field
                    label="Display name"
                    value={form.name}
                    onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                  />
                  <Field
                    label="Description"
                    value={form.description}
                    onChange={(v) => setForm((f) => ({ ...f, description: v }))}
                  />
                  <Field
                    label="Base URL"
                    value={form.baseUrl}
                    onChange={(v) => setForm((f) => ({ ...f, baseUrl: v }))}
                    placeholder="https://api.example.com/v1"
                    mono
                  />
                  <label style={{ fontSize: 11, color: "var(--gb-ink-muted)" }}>
                    API backend
                    <select
                      value={form.apiBackend}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, apiBackend: e.target.value }))
                      }
                      style={{ ...input, marginTop: 4 }}
                    >
                      <option value="chat_completions">chat_completions</option>
                      <option value="responses">responses</option>
                      <option value="messages">messages (Anthropic)</option>
                    </select>
                  </label>
                  <Field
                    label={
                      editing?.hasApiKey
                        ? "API key (leave blank to keep existing)"
                        : "API key (optional)"
                    }
                    value={form.apiKey}
                    onChange={(v) => setForm((f) => ({ ...f, apiKey: v }))}
                    type="password"
                    mono
                  />
                  <Field
                    label="Env key (e.g. XAI_API_KEY)"
                    value={form.envKey}
                    onChange={(v) => setForm((f) => ({ ...f, envKey: v }))}
                    mono
                  />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <Field
                      label="Context window"
                      value={form.contextWindow}
                      onChange={(v) => setForm((f) => ({ ...f, contextWindow: v }))}
                    />
                    <Field
                      label="Temperature"
                      value={form.temperature}
                      onChange={(v) => setForm((f) => ({ ...f, temperature: v }))}
                    />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <button
                      type="button"
                      style={primary}
                      disabled={working || !form.id.trim()}
                      onClick={() => void onSaveModel()}
                    >
                      Save to config
                    </button>
                    {!creating && editing ? (
                      <>
                        <button
                          type="button"
                          style={btn}
                          disabled={working}
                          onClick={() => void onSetDefault(editing.id)}
                        >
                          Set as default
                        </button>
                        <button
                          type="button"
                          style={{ ...btn, color: "var(--gb-danger)" }}
                          disabled={working}
                          onClick={() => void onDeleteModel()}
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                  </div>
                  <p style={{ fontSize: 11, color: "var(--gb-ink-muted)", margin: 0 }}>
                    Writes <code>[model.{form.id || "…"}]</code> in{" "}
                    <code>{catalog?.configPath}</code>. New sessions pick up{" "}
                    <code>[models].default</code>; switch live with <code>/model</code>.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    height: "100%",
                    minHeight: 200,
                    display: "grid",
                    placeItems: "center",
                    color: "var(--gb-ink-muted)",
                    fontSize: 13,
                    border: "1px dashed var(--gb-border)",
                    borderRadius: 10,
                  }}
                >
                  Select a custom model or add one. Built-in Grok models need no entry.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono,
  type = "text",
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label style={{ fontSize: 11, color: "var(--gb-ink-muted)", display: "block" }}>
      {label}
      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...input,
          marginTop: 4,
          fontFamily: mono ? "ui-monospace, Menlo, monospace" : "inherit",
          opacity: disabled ? 0.7 : 1,
        }}
      />
    </label>
  );
}
