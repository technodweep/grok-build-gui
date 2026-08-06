import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  addMcpServer,
  getExtensionsHub,
  getGrokConfigPath,
  mcpDoctor,
  pluginInstall,
  pluginSetEnabled,
  pluginUninstall,
  removeMcpServer,
  setHookEnabled,
  setMcpServerEnabled,
  setProjectTrust,
  setSkillDisabled,
} from "../../shared/api";
import { useAppStore } from "../../shared/store";
import type {
  ExtensionsHub,
  MarketplacePlugin,
  McpDoctorReport,
  McpServerInfo,
  PluginInfo,
  SkillInfo,
} from "../../shared/types";

type Tab = "mcp" | "skills" | "plugins" | "marketplace" | "hooks" | "trust";

export function ExtensionsModal() {
  const open = useAppStore((s) => s.extensionsOpen);
  const setOpen = useAppStore((s) => s.setExtensionsOpen);
  const preferredTab = useAppStore((s) => s.extensionsTab);
  const setPreferredTab = useAppStore((s) => s.setExtensionsTab);
  const projectCwd = useAppStore((s) => s.projectCwd);
  const session = useAppStore((s) => s.session);
  const setError = useAppStore((s) => s.setError);

  const [tab, setTab] = useState<Tab>(preferredTab);
  const [hub, setHub] = useState<ExtensionsHub | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  // Add MCP form
  const [addOpen, setAddOpen] = useState(false);
  const [mcpName, setMcpName] = useState("");
  const [mcpTransport, setMcpTransport] = useState<"stdio" | "http">("stdio");
  const [mcpCommand, setMcpCommand] = useState("");
  const [mcpArgs, setMcpArgs] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");

  const cwd = projectCwd || session?.cwd || null;

  const refresh = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const h = await getExtensionsHub(cwd);
      setHub(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [cwd, setError]);

  useEffect(() => {
    if (open) {
      setFilter("");
      setTab(preferredTab);
      void refresh();
    }
  }, [open, refresh, preferredTab]);

  const q = filter.trim().toLowerCase();

  const mcpServers = useMemo(() => {
    const list = hub?.overview.mcpServers ?? [];
    if (!q) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.command ?? "").toLowerCase().includes(q) ||
        (s.url ?? "").toLowerCase().includes(q),
    );
  }, [hub, q]);

  const skills = useMemo(() => {
    const list = hub?.overview.skills ?? [];
    if (!q) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q) ||
        s.source.toLowerCase().includes(q),
    );
  }, [hub, q]);

  const plugins = useMemo(() => {
    const list = hub?.plugins ?? [];
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q),
    );
  }, [hub, q]);

  const market = useMemo(() => {
    const list = hub?.marketplacePlugins ?? [];
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q),
    );
  }, [hub, q]);

  const hooks = useMemo(() => {
    const list = hub?.hooks ?? [];
    if (!q) return list;
    return list.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.events.some((e) => e.toLowerCase().includes(q)),
    );
  }, [hub, q]);

  if (!open) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openPath = async (path: string) => {
    try {
      const { openPath: open } = await import("@tauri-apps/plugin-opener");
      await open(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onAddMcp = async () => {
    await run(async () => {
      const name = mcpName.trim();
      if (!name) throw new Error("Name required");
      if (mcpTransport === "stdio") {
        await addMcpServer({
          name,
          command: mcpCommand.trim(),
          args: mcpArgs
            .trim()
            .split(/\s+/)
            .filter(Boolean),
        });
      } else {
        await addMcpServer({ name, url: mcpUrl.trim() });
      }
      setAddOpen(false);
      setMcpName("");
      setMcpCommand("");
      setMcpArgs("");
      setMcpUrl("");
      setMsg(`Added MCP server “${name}”. Restart the agent session to load tools.`);
    });
  };

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Extensions</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--gb-ink-muted)" }}>
              MCP · Skills · Plugins · Marketplace · Hooks · Trust
            </p>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" style={ghost} disabled={loading || busy} onClick={() => void refresh()}>
              {loading ? "…" : "Refresh"}
            </button>
            <button
              type="button"
              style={ghost}
              onClick={() =>
                void getGrokConfigPath().then((p) => openPath(p)).catch((e) => setError(String(e)))
              }
            >
              config.toml
            </button>
            <button type="button" style={ghost} onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>

        {hub?.projectCwd ? (
          <div
            style={{
              marginTop: 10,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--gb-border)",
              background: hub.projectTrusted
                ? "rgba(61,214,140,0.08)"
                : "rgba(240,180,41,0.08)",
              fontSize: 12,
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              alignItems: "center",
            }}
          >
            <span>
              Project{" "}
              <code style={{ fontSize: 11 }}>{hub.projectCwd}</code>
              {hub.projectTrusted ? " · trusted" : " · not trusted (project hooks/MCP skipped)"}
            </span>
            <button
              type="button"
              style={ghost}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (!hub.projectCwd) return;
                  if (!hub.projectTrusted) {
                    const ok = window.confirm(
                      `Trust this project folder?\n\n${hub.projectCwd}\n\nThis allows project hooks, MCP, and LSP from this tree (cascades to subdirectories).`,
                    );
                    if (!ok) return;
                  }
                  await setProjectTrust(hub.projectCwd, !hub.projectTrusted);
                  setMsg(
                    hub.projectTrusted
                      ? "Project trust removed."
                      : "Project trusted for hooks / MCP / LSP.",
                  );
                })
              }
            >
              {hub.projectTrusted ? "Revoke trust" : "Trust project"}
            </button>
          </div>
        ) : null}

        {msg ? (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--gb-success)" }}>{msg}</p>
        ) : null}
        {hub?.notes?.length ? (
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--gb-warning)" }}>
            {hub.notes.join(" · ")}
          </p>
        ) : null}

        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          {(
            [
              ["mcp", "MCP"],
              ["skills", "Skills"],
              ["plugins", "Plugins"],
              ["marketplace", "Marketplace"],
              ["hooks", "Hooks"],
              ["trust", "Trust"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setPreferredTab(id);
              }}
              style={{
                borderRadius: 999,
                border: "1px solid var(--gb-border)",
                padding: "4px 10px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                background: tab === id ? "var(--gb-accent)" : "var(--gb-surface-overlay)",
                color: tab === id ? "#0c0e12" : "var(--gb-ink)",
              }}
            >
              {label}
              {id === "mcp" && hub ? ` (${hub.overview.mcpServers.length})` : ""}
              {id === "skills" && hub ? ` (${hub.overview.skills.length})` : ""}
              {id === "plugins" && hub ? ` (${hub.plugins.length})` : ""}
              {id === "marketplace" && hub ? ` (${hub.marketplacePlugins.length})` : ""}
              {id === "hooks" && hub ? ` (${hub.hooks.length})` : ""}
            </button>
          ))}
        </div>

        {tab !== "trust" ? (
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            style={{
              marginTop: 10,
              borderRadius: 8,
              border: "1px solid var(--gb-border)",
              background: "var(--gb-surface)",
              color: "var(--gb-ink)",
              padding: "8px 10px",
              fontSize: 13,
            }}
          />
        ) : null}

        <div style={{ flex: 1, overflowY: "auto", marginTop: 12, minHeight: 200 }}>
          {loading && !hub ? (
            <p style={{ color: "var(--gb-ink-muted)", fontSize: 13 }}>Loading…</p>
          ) : null}

          {tab === "mcp" ? (
            <McpTab
              servers={mcpServers}
              busy={busy}
              addOpen={addOpen}
              setAddOpen={setAddOpen}
              mcpName={mcpName}
              setMcpName={setMcpName}
              mcpTransport={mcpTransport}
              setMcpTransport={setMcpTransport}
              mcpCommand={mcpCommand}
              setMcpCommand={setMcpCommand}
              mcpArgs={mcpArgs}
              setMcpArgs={setMcpArgs}
              mcpUrl={mcpUrl}
              setMcpUrl={setMcpUrl}
              onAdd={() => void onAddMcp()}
              onToggle={(s, enabled) =>
                void run(async () => {
                  await setMcpServerEnabled(s.name, enabled);
                  setMsg(
                    `${s.name} ${enabled ? "enabled" : "disabled"}. Restart agent to apply.`,
                  );
                })
              }
              onRemove={(s) =>
                void run(async () => {
                  if (!window.confirm(`Remove MCP server “${s.name}” from config.toml?`)) return;
                  await removeMcpServer(s.name);
                  setMsg(`Removed ${s.name}.`);
                })
              }
            />
          ) : null}

          {tab === "skills" ? (
            <SkillsTab
              skills={skills}
              busy={busy}
              onToggle={(s, disabled) =>
                void run(async () => {
                  await setSkillDisabled(s.name, disabled);
                  setMsg(`${s.name} ${disabled ? "disabled" : "enabled"}.`);
                })
              }
              onOpen={(s) => void openPath(s.path)}
            />
          ) : null}

          {tab === "plugins" ? (
            <PluginsTab
              plugins={plugins}
              busy={busy}
              onToggle={(p, enabled) =>
                void run(async () => {
                  await pluginSetEnabled(p.name, enabled);
                  setMsg(`${p.name} ${enabled ? "enabled" : "disabled"}.`);
                })
              }
              onUninstall={(p) =>
                void run(async () => {
                  if (!window.confirm(`Uninstall plugin “${p.name}”?`)) return;
                  await pluginUninstall(p.name);
                  setMsg(`Uninstalled ${p.name}.`);
                })
              }
            />
          ) : null}

          {tab === "marketplace" ? (
            <MarketplaceTab
              plugins={market}
              busy={busy}
              onInstall={(p) =>
                void run(async () => {
                  const ok = window.confirm(
                    `Install plugin “${p.name}” with --trust?\n\n${p.description ?? ""}\n\nThis activates the plugin’s hooks, MCP servers, and skills. Only install from sources you trust.`,
                  );
                  if (!ok) return;
                  const out = await pluginInstall(p.name, true);
                  setMsg(out || `Installed ${p.name}. New session picks up the plugin.`);
                })
              }
            />
          ) : null}

          {tab === "hooks" ? (
            <HooksTab
              hooks={hooks}
              busy={busy}
              onToggle={(path, enabled) =>
                void run(async () => {
                  await setHookEnabled(path, enabled);
                  setMsg(enabled ? "Hook enabled." : "Hook disabled (renamed .disabled.json).");
                })
              }
              onOpen={(path) => void openPath(path)}
            />
          ) : null}

          {tab === "trust" ? (
            <TrustTab
              hub={hub}
              busy={busy}
              onTrust={(path, trusted) =>
                void run(async () => {
                  if (trusted) {
                    const ok = window.confirm(
                      `Trust folder?\n\n${path}\n\nAllows project hooks, MCP, and LSP under this path.`,
                    );
                    if (!ok) return;
                  }
                  await setProjectTrust(path, trusted);
                  setMsg(trusted ? "Folder trusted." : "Trust revoked.");
                })
              }
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function McpTab({
  servers,
  busy,
  addOpen,
  setAddOpen,
  mcpName,
  setMcpName,
  mcpTransport,
  setMcpTransport,
  mcpCommand,
  setMcpCommand,
  mcpArgs,
  setMcpArgs,
  mcpUrl,
  setMcpUrl,
  onAdd,
  onToggle,
  onRemove,
}: {
  servers: McpServerInfo[];
  busy: boolean;
  addOpen: boolean;
  setAddOpen: (v: boolean) => void;
  mcpName: string;
  setMcpName: (v: string) => void;
  mcpTransport: "stdio" | "http";
  setMcpTransport: (v: "stdio" | "http") => void;
  mcpCommand: string;
  setMcpCommand: (v: string) => void;
  mcpArgs: string;
  setMcpArgs: (v: string) => void;
  mcpUrl: string;
  setMcpUrl: (v: string) => void;
  onAdd: () => void;
  onToggle: (s: McpServerInfo, enabled: boolean) => void;
  onRemove: (s: McpServerInfo) => void;
}) {
  const setError = useAppStore((s) => s.setError);
  const [doctor, setDoctor] = useState<McpDoctorReport | null>(null);
  const [doctorBusy, setDoctorBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const runDoctor = async (name?: string) => {
    setDoctorBusy(true);
    try {
      const r = await mcpDoctor(name ?? null);
      setDoctor(r);
      if (name) setExpanded(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDoctorBusy(false);
    }
  };

  const toolsFor = (name: string) =>
    doctor?.servers.find((s) => s.name === name || s.name.toLowerCase() === name.toLowerCase());

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
        <p style={hint}>
          Servers from <code>[mcp_servers.*]</code> in config.toml. Toggle writes{" "}
          <code>enabled</code>; restart the agent to reload tools. Use doctor to list live tools.
        </p>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            style={ghost}
            disabled={doctorBusy || busy}
            onClick={() => void runDoctor()}
            title="grok mcp doctor --json"
          >
            {doctorBusy ? "Probing…" : "Doctor / tools"}
          </button>
          <button type="button" style={primary} onClick={() => setAddOpen(!addOpen)}>
            {addOpen ? "Cancel" : "Add server"}
          </button>
        </div>
      </div>
      {doctor?.summary ? (
        <p style={{ ...hint, color: "var(--gb-ink)" }}>{doctor.summary}</p>
      ) : null}

      {addOpen ? (
        <div
          style={{
            border: "1px solid var(--gb-border)",
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            background: "var(--gb-surface)",
          }}
        >
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button
              type="button"
              style={chip(mcpTransport === "stdio")}
              onClick={() => setMcpTransport("stdio")}
            >
              stdio
            </button>
            <button
              type="button"
              style={chip(mcpTransport === "http")}
              onClick={() => setMcpTransport("http")}
            >
              HTTP
            </button>
          </div>
          <label style={fieldLabel}>
            Name
            <input style={input} value={mcpName} onChange={(e) => setMcpName(e.target.value)} placeholder="my-server" />
          </label>
          {mcpTransport === "stdio" ? (
            <>
              <label style={fieldLabel}>
                Command
                <input
                  style={input}
                  value={mcpCommand}
                  onChange={(e) => setMcpCommand(e.target.value)}
                  placeholder="npx"
                />
              </label>
              <label style={fieldLabel}>
                Args (space-separated)
                <input
                  style={input}
                  value={mcpArgs}
                  onChange={(e) => setMcpArgs(e.target.value)}
                  placeholder="-y @modelcontextprotocol/server-filesystem /path"
                />
              </label>
            </>
          ) : (
            <label style={fieldLabel}>
              URL
              <input
                style={input}
                value={mcpUrl}
                onChange={(e) => setMcpUrl(e.target.value)}
                placeholder="https://mcp.example.com/api"
              />
            </label>
          )}
          <button type="button" style={{ ...primary, marginTop: 8 }} disabled={busy} onClick={onAdd}>
            Save to config.toml
          </button>
        </div>
      ) : null}

      {servers.length === 0 ? (
        <p style={hint}>No MCP servers configured.</p>
      ) : (
        <ul style={list}>
          {servers.map((s) => {
            const diag = toolsFor(s.name);
            const open = expanded === s.name;
            return (
              <li
                key={s.name}
                style={{
                  ...listItem,
                  flexDirection: "column",
                  alignItems: "stretch",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: s.enabled ? "var(--gb-success)" : "var(--gb-ink-muted)",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                    <div style={meta}>
                      {s.transport}
                      {s.command ? ` · ${s.command}` : ""}
                      {s.url ? ` · ${s.url}` : ""}
                      {diag
                        ? ` · ${diag.toolCount} tool(s)${diag.status ? ` · ${diag.status}` : ""}`
                        : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    style={ghost}
                    disabled={doctorBusy}
                    onClick={() => {
                      if (open) setExpanded(null);
                      else void runDoctor(s.name);
                    }}
                  >
                    {open ? "Hide tools" : "Tools"}
                  </button>
                  <button
                    type="button"
                    style={ghost}
                    disabled={busy}
                    onClick={() => onToggle(s, !s.enabled)}
                  >
                    {s.enabled ? "Disable" : "Enable"}
                  </button>
                  <button type="button" style={dangerBtn} disabled={busy} onClick={() => onRemove(s)}>
                    Remove
                  </button>
                </div>
                {open ? (
                  <div
                    style={{
                      marginLeft: 16,
                      padding: 10,
                      borderRadius: 8,
                      border: "1px solid var(--gb-border)",
                      background: "var(--gb-bg)",
                      fontSize: 12,
                    }}
                  >
                    {diag?.error ? (
                      <div style={{ color: "var(--gb-danger)", marginBottom: 6 }}>{diag.error}</div>
                    ) : null}
                    {diag?.tools?.length ? (
                      <ul style={{ margin: 0, paddingLeft: 16 }}>
                        {diag.tools.map((t) => (
                          <li key={t.name} style={{ marginBottom: 4 }}>
                            <code style={{ color: "var(--gb-accent)" }}>{t.name}</code>
                            {t.description ? (
                              <span style={{ color: "var(--gb-ink-muted)" }}>
                                {" "}
                                — {t.description}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ color: "var(--gb-ink-muted)" }}>
                        {doctorBusy
                          ? "Probing server…"
                          : "No tools reported. Server may be offline, disabled, or doctor schema differs."}
                      </div>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SkillsTab({
  skills,
  busy,
  onToggle,
  onOpen,
}: {
  skills: SkillInfo[];
  busy: boolean;
  onToggle: (s: SkillInfo, disabled: boolean) => void;
  onOpen: (s: SkillInfo) => void;
}) {
  if (skills.length === 0) {
    return <p style={hint}>No skills found under user / bundled / project roots.</p>;
  }
  return (
    <ul style={{ ...list, maxHeight: "none" }}>
      {skills.map((s) => (
        <li key={`${s.source}-${s.name}-${s.path}`} style={listItem}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
              <span style={{ fontSize: 10, color: "var(--gb-ink-muted)" }}>{s.source}</span>
              {s.disabled ? (
                <span style={{ fontSize: 10, color: "var(--gb-warning)" }}>disabled</span>
              ) : null}
            </div>
            {s.description ? <div style={meta}>{s.description}</div> : null}
            <div style={{ ...meta, fontSize: 10 }}>{s.path}</div>
          </div>
          <button type="button" style={ghost} onClick={() => onOpen(s)}>
            Open
          </button>
          <button
            type="button"
            style={ghost}
            disabled={busy}
            onClick={() => onToggle(s, !s.disabled)}
          >
            {s.disabled ? "Enable" : "Disable"}
          </button>
        </li>
      ))}
    </ul>
  );
}

function PluginsTab({
  plugins,
  busy,
  onToggle,
  onUninstall,
}: {
  plugins: PluginInfo[];
  busy: boolean;
  onToggle: (p: PluginInfo, enabled: boolean) => void;
  onUninstall: (p: PluginInfo) => void;
}) {
  if (plugins.length === 0) {
    return (
      <p style={hint}>
        No plugins installed. Browse the Marketplace tab or run{" "}
        <code>grok plugin install &lt;name&gt; --trust</code>.
      </p>
    );
  }
  return (
    <ul style={list}>
      {plugins.map((p) => (
        <li key={p.name} style={listItem}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              {p.name}
              {p.version ? (
                <span style={{ fontWeight: 400, color: "var(--gb-ink-muted)", marginLeft: 6 }}>
                  {p.version}
                </span>
              ) : null}
            </div>
            {p.description ? <div style={meta}>{p.description}</div> : null}
          </div>
          <button
            type="button"
            style={ghost}
            disabled={busy}
            onClick={() => onToggle(p, !p.enabled)}
          >
            {p.enabled ? "Disable" : "Enable"}
          </button>
          <button type="button" style={dangerBtn} disabled={busy} onClick={() => onUninstall(p)}>
            Uninstall
          </button>
        </li>
      ))}
    </ul>
  );
}

function MarketplaceTab({
  plugins,
  busy,
  onInstall,
}: {
  plugins: MarketplacePlugin[];
  busy: boolean;
  onInstall: (p: MarketplacePlugin) => void;
}) {
  if (plugins.length === 0) {
    return (
      <p style={hint}>
        No marketplace cache yet. Sources come from <code>[[marketplace.sources]]</code> in
        config.toml; the CLI refreshes them on use.
      </p>
    );
  }
  return (
    <ul style={list}>
      {plugins.map((p) => (
        <li key={p.name} style={listItem}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
              {p.category ? (
                <span style={{ fontSize: 10, color: "var(--gb-ink-muted)" }}>{p.category}</span>
              ) : null}
              {p.installed ? (
                <span style={{ fontSize: 10, color: "var(--gb-success)" }}>installed</span>
              ) : null}
            </div>
            {p.description ? (
              <div style={{ ...meta, whiteSpace: "normal" }}>
                {p.description.slice(0, 200)}
                {p.description.length > 200 ? "…" : ""}
              </div>
            ) : null}
            {p.marketplace ? <div style={{ ...meta, fontSize: 10 }}>{p.marketplace}</div> : null}
          </div>
          <button
            type="button"
            style={primary}
            disabled={busy || p.installed}
            onClick={() => onInstall(p)}
          >
            {p.installed ? "Installed" : "Install"}
          </button>
        </li>
      ))}
    </ul>
  );
}

function HooksTab({
  hooks,
  busy,
  onToggle,
  onOpen,
}: {
  hooks: import("../../shared/types").HookInfo[];
  busy: boolean;
  onToggle: (path: string, enabled: boolean) => void;
  onOpen: (path: string) => void;
}) {
  if (hooks.length === 0) {
    return (
      <p style={hint}>
        No hook JSON files under <code>~/.grok/hooks</code> or project{" "}
        <code>.grok/hooks</code>. See the Grok hooks guide for file format.
      </p>
    );
  }
  return (
    <ul style={list}>
      {hooks.map((h) => (
        <li key={h.path} style={listItem}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{h.name}</span>
              <span style={{ fontSize: 10, color: "var(--gb-ink-muted)" }}>{h.scope}</span>
              {!h.trusted ? (
                <span style={{ fontSize: 10, color: "var(--gb-warning)" }}>untrusted</span>
              ) : null}
              {!h.enabled ? (
                <span style={{ fontSize: 10, color: "var(--gb-ink-muted)" }}>off</span>
              ) : null}
            </div>
            <div style={meta}>
              {h.events.length ? h.events.join(", ") : "events unknown"}
            </div>
          </div>
          <button type="button" style={ghost} onClick={() => onOpen(h.path)}>
            Open
          </button>
          <button
            type="button"
            style={ghost}
            disabled={busy}
            onClick={() => onToggle(h.path, !h.enabled)}
          >
            {h.enabled ? "Disable" : "Enable"}
          </button>
        </li>
      ))}
    </ul>
  );
}

function TrustTab({
  hub,
  busy,
  onTrust,
}: {
  hub: ExtensionsHub | null;
  busy: boolean;
  onTrust: (path: string, trusted: boolean) => void;
}) {
  const folders = hub?.trustedFolders ?? [];
  return (
    <div>
      <p style={hint}>
        Folder trust gates project hooks, MCP, and LSP. Stored in{" "}
        <code>~/.grok/trusted_folders.toml</code>. Global <code>~/.grok/hooks</code> always runs.
      </p>
      {hub?.projectCwd ? (
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            style={primary}
            disabled={busy}
            onClick={() => onTrust(hub.projectCwd!, !hub.projectTrusted)}
          >
            {hub.projectTrusted ? "Revoke trust for current project" : "Trust current project"}
          </button>
        </div>
      ) : (
        <p style={hint}>Open a project session to trust its cwd from here.</p>
      )}
      {folders.length === 0 ? (
        <p style={hint}>No trusted folders recorded yet.</p>
      ) : (
        <ul style={list}>
          {folders.map((f) => (
            <li key={f.path} style={listItem}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontFamily: "ui-monospace, Menlo, monospace" }}>
                {f.path}
              </div>
              <button
                type="button"
                style={dangerBtn}
                disabled={busy}
                onClick={() => onTrust(f.path, false)}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
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

const input: CSSProperties = {
  width: "100%",
  marginTop: 4,
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface-raised)",
  color: "var(--gb-ink)",
  padding: "8px 10px",
  fontSize: 13,
  boxSizing: "border-box",
};

const fieldLabel: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  marginTop: 8,
  color: "var(--gb-ink-muted)",
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
