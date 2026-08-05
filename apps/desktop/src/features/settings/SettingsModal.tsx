import { useEffect, useState, type CSSProperties } from "react";
import {
  getEnvironment,
  getGrokConfigOverview,
  getGuiSettings,
  setGuiSettings,
} from "../../shared/api";
import { useAppStore } from "../../shared/store";
import { applyTheme, THEME_OPTIONS, type ThemeId } from "../../shared/theme";
import type { GrokConfigOverview, GuiSettings } from "../../shared/types";

type Tab = "gui" | "grok";

export function SettingsModal() {
  const open = useAppStore((s) => s.settingsOpen);
  const setOpen = useAppStore((s) => s.setSettingsOpen);
  const setAlwaysApprove = useAppStore((s) => s.setAlwaysApprove);
  const setMultilineMode = useAppStore((s) => s.setMultilineMode);
  const setCompactMode = useAppStore((s) => s.setCompactMode);
  const setShowTimestamps = useAppStore((s) => s.setShowTimestamps);
  const setEnv = useAppStore((s) => s.setEnv);
  const setError = useAppStore((s) => s.setError);
  const alwaysApprove = useAppStore((s) => s.alwaysApprove);
  const multilineModeStore = useAppStore((s) => s.multilineMode);
  const compactModeStore = useAppStore((s) => s.compactMode);
  const showTimestampsStore = useAppStore((s) => s.showTimestamps);
  const projectCwd = useAppStore((s) => s.projectCwd);
  const session = useAppStore((s) => s.session);

  const [tab, setTab] = useState<Tab>("gui");
  const [theme, setTheme] = useState<ThemeId>("dark");
  const [fontSize, setFontSize] = useState(14);
  const [binaryOverride, setBinaryOverride] = useState("");
  const [lastCwd, setLastCwd] = useState("");
  const [yolo, setYolo] = useState(alwaysApprove);
  const [multiline, setMultiline] = useState(multilineModeStore);
  const [compact, setCompact] = useState(compactModeStore);
  const [timestamps, setTimestamps] = useState(showTimestampsStore);
  const [saving, setSaving] = useState(false);
  const [grok, setGrok] = useState<GrokConfigOverview | null>(null);
  const [grokLoading, setGrokLoading] = useState(false);
  const [grokErr, setGrokErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void getGuiSettings().then((s: GuiSettings) => {
      const t = (s.theme as ThemeId) || "dark";
      setTheme(t === "light" || t === "dim" ? t : "dark");
      setFontSize(s.fontSize ?? 14);
      setBinaryOverride(s.binaryOverride ?? "");
      setLastCwd(s.lastProjectCwd ?? "");
      setYolo(!!s.alwaysApprove);
      setMultiline(!!s.multilineMode);
      setCompact(!!s.compactMode);
      setTimestamps(!!s.showTimestamps);
    });
  }, [open]);

  useEffect(() => {
    if (!open || tab !== "grok") return;
    setGrokLoading(true);
    setGrokErr(null);
    const cwd = projectCwd || session?.cwd || null;
    void getGrokConfigOverview(cwd)
      .then(setGrok)
      .catch((e) => setGrokErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setGrokLoading(false));
  }, [open, tab, projectCwd, session?.cwd]);

  if (!open) return null;

  const onSave = async () => {
    setSaving(true);
    try {
      const settings: GuiSettings = {
        lastProjectCwd: lastCwd || null,
        alwaysApprove: yolo,
        binaryOverride: binaryOverride.trim() || null,
        theme,
        fontSize,
        multilineMode: multiline,
        compactMode: compact,
        showTimestamps: timestamps,
      };
      await setGuiSettings(settings);
      setAlwaysApprove(yolo);
      setMultilineMode(multiline);
      setCompactMode(compact);
      setShowTimestamps(timestamps);
      applyTheme(theme, fontSize, compact);
      const env = await getEnvironment(binaryOverride.trim() || null);
      setEnv(env);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const openConfigFile = async () => {
    try {
      const path =
        grok?.configPath ??
        (await import("../../shared/api").then((m) => m.getGrokConfigPath()));
      if (!path) {
        setError("Config path unknown");
        return;
      }
      const { openPath } = await import("@tauri-apps/plugin-opener");
      await openPath(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="gb-modal-backdrop" onClick={() => setOpen(false)}>
      <div
        className="gb-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560, maxHeight: "85vh", display: "flex", flexDirection: "column" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Settings</h2>
          <button type="button" style={ghost} onClick={() => setOpen(false)}>
            Close
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {(
            [
              ["gui", "App"],
              ["grok", "Grok config"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                ...chip,
                background: tab === id ? "var(--gb-accent)" : "var(--gb-surface-overlay)",
                color: tab === id ? "var(--gb-surface)" : "var(--gb-ink)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", marginTop: 8, minHeight: 0 }}>
          {tab === "gui" ? (
            <>
              <section style={section}>
                <label style={label}>Theme</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {THEME_OPTIONS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTheme(t.id);
                        applyTheme(t.id, fontSize);
                      }}
                      style={{
                        ...chip,
                        background:
                          theme === t.id ? "var(--gb-accent)" : "var(--gb-surface-overlay)",
                        color: theme === t.id ? "var(--gb-surface)" : "var(--gb-ink)",
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </section>

              <section style={section}>
                <label style={label}>Font size ({fontSize}px)</label>
                <input
                  type="range"
                  min={12}
                  max={18}
                  value={fontSize}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setFontSize(n);
                    applyTheme(theme, n);
                  }}
                  style={{ width: "100%" }}
                />
              </section>

              <section style={section}>
                <label style={label}>
                  <input
                    type="checkbox"
                    checked={yolo}
                    onChange={(e) => setYolo(e.target.checked)}
                  />{" "}
                  Always approve tools (yolo) for new sessions
                </label>
                <p style={hint}>
                  Interactive sessions still respect this only when you open/resume with it enabled.
                </p>
              </section>

              <section style={section}>
                <label style={label}>
                  <input
                    type="checkbox"
                    checked={multiline}
                    onChange={(e) => setMultiline(e.target.checked)}
                  />{" "}
                  Multiline composer (Enter = newline)
                </label>
                <p style={hint}>
                  When on: Enter inserts a newline, Ctrl/Cmd+Enter sends. Toggle with{" "}
                  <code>/multiline</code>.
                </p>
              </section>

              <section style={section}>
                <label style={label}>
                  <input
                    type="checkbox"
                    checked={compact}
                    onChange={(e) => {
                      setCompact(e.target.checked);
                      applyTheme(theme, fontSize, e.target.checked);
                    }}
                  />{" "}
                  Compact chat density
                </label>
                <p style={hint}>
                  Tighter padding in the scrollback. Toggle with <code>/compact-mode</code>.
                </p>
              </section>

              <section style={section}>
                <label style={label}>
                  <input
                    type="checkbox"
                    checked={timestamps}
                    onChange={(e) => setTimestamps(e.target.checked)}
                  />{" "}
                  Show message timestamps
                </label>
                <p style={hint}>
                  Display local time on each scroll item. Toggle with <code>/timestamps</code>.
                </p>
              </section>

              <section style={section}>
                <label style={label}>Grok binary path (optional)</label>
                <input
                  style={input}
                  value={binaryOverride}
                  onChange={(e) => setBinaryOverride(e.target.value)}
                  placeholder="~/.grok/bin/grok or absolute path"
                />
                <p style={hint}>Leave empty to use PATH / ~/.grok/bin/grok detection.</p>
              </section>

              <section style={section}>
                <label style={label}>Last project folder</label>
                <input style={{ ...input, opacity: 0.8 }} value={lastCwd} readOnly />
              </section>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                <button type="button" style={ghost} onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="button" style={primary} disabled={saving} onClick={() => void onSave()}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </>
          ) : (
            <GrokConfigTab
              grok={grok}
              loading={grokLoading}
              error={grokErr}
              onRefresh={() => {
                setGrokLoading(true);
                setGrokErr(null);
                const cwd = projectCwd || session?.cwd || null;
                void getGrokConfigOverview(cwd)
                  .then(setGrok)
                  .catch((e) => setGrokErr(e instanceof Error ? e.message : String(e)))
                  .finally(() => setGrokLoading(false));
              }}
              onOpenFile={() => void openConfigFile()}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function GrokConfigTab({
  grok,
  loading,
  error,
  onRefresh,
  onOpenFile,
}: {
  grok: GrokConfigOverview | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenFile: () => void;
}) {
  if (loading && !grok) {
    return <p style={{ color: "var(--gb-ink-muted)", fontSize: 13 }}>Loading Grok config…</p>;
  }
  if (error && !grok) {
    return <p style={{ color: "var(--gb-danger)", fontSize: 13 }}>{error}</p>;
  }
  if (!grok) return null;

  return (
    <div>
      <p style={hint}>
        Read-only overview of the Grok CLI config the agent uses. Edit{" "}
        <code>config.toml</code> for MCP, models, and skills — the agent reloads on its own.
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button type="button" style={ghost} onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
        <button type="button" style={primary} onClick={onOpenFile}>
          Open config.toml
        </button>
      </div>

      <section style={section}>
        <div style={sectionTitle}>Paths</div>
        <Row
          label="Config"
          value={grok.configExists ? grok.configPath : `${grok.configPath} (missing)`}
        />
        {grok.parseError ? (
          <p style={{ color: "var(--gb-danger)", fontSize: 12 }}>{grok.parseError}</p>
        ) : null}
      </section>

      <section style={section}>
        <div style={sectionTitle}>Session defaults</div>
        <Row label="Default model" value={grok.defaultModel || "—"} />
        <Row label="Permission mode" value={grok.permissionMode || "—"} />
        <Row
          label="Auto-compact"
          value={
            grok.autoCompactPercent != null ? `${grok.autoCompactPercent}%` : "—"
          }
        />
      </section>

      <section style={section}>
        <div style={sectionTitle}>
          MCP servers ({grok.mcpServers.length})
        </div>
        {grok.mcpServers.length === 0 ? (
          <p style={hint}>
            None in config.toml. Add <code>[mcp_servers.name]</code> sections to enable tools.
          </p>
        ) : (
          <ul style={list}>
            {grok.mcpServers.map((s) => (
              <li key={s.name} style={listItem}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: s.enabled ? "var(--gb-success)" : "var(--gb-ink-muted)",
                    flexShrink: 0,
                  }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--gb-ink-muted)",
                      fontFamily: "ui-monospace, Menlo, monospace",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={s.command || s.url || ""}
                  >
                    {s.transport}
                    {s.command ? ` · ${s.command}` : ""}
                    {s.url ? ` · ${s.url}` : ""}
                    {!s.enabled ? " · disabled" : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={section}>
        <div style={sectionTitle}>Skills ({grok.skills.length})</div>
        {grok.skills.length === 0 ? (
          <p style={hint}>No SKILL.md packages found under user/bundled/project roots.</p>
        ) : (
          <ul style={{ ...list, maxHeight: 220, overflowY: "auto" }}>
            {grok.skills.slice(0, 80).map((s) => (
              <li key={`${s.source}-${s.name}-${s.path}`} style={listItem}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                    <span style={{ fontSize: 10, color: "var(--gb-ink-muted)" }}>{s.source}</span>
                    {s.disabled ? (
                      <span style={{ fontSize: 10, color: "var(--gb-warning)" }}>disabled</span>
                    ) : null}
                  </div>
                  {s.description ? (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--gb-ink-muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.description}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {grok.skills.length > 80 ? (
          <p style={hint}>Showing first 80 of {grok.skills.length}.</p>
        ) : null}
      </section>

      {grok.marketplaceSources.length > 0 ? (
        <section style={section}>
          <div style={sectionTitle}>Marketplace</div>
          <ul style={list}>
            {grok.marketplaceSources.map((m) => (
              <li key={m} style={{ ...listItem, fontSize: 12, color: "var(--gb-ink-muted)" }}>
                {m}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "5px 0",
        borderBottom: "1px solid var(--gb-border)",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--gb-ink-muted)" }}>{label}</span>
      <span
        style={{
          fontFamily: "ui-monospace, Menlo, monospace",
          textAlign: "right",
          wordBreak: "break-all",
        }}
      >
        {value}
      </span>
    </div>
  );
}

const section: CSSProperties = { marginTop: 16 };
const sectionTitle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--gb-ink-muted)",
  marginBottom: 6,
};
const label: CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "var(--gb-ink-muted)",
  marginBottom: 6,
  fontWeight: 600,
};
const hint: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 12,
  color: "var(--gb-ink-muted)",
};
const input: CSSProperties = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface)",
  color: "var(--gb-ink)",
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: "ui-monospace, Menlo, monospace",
};
const chip: CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  padding: "6px 12px",
  fontSize: 13,
  cursor: "pointer",
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
const primary: CSSProperties = {
  borderRadius: 8,
  border: "none",
  background: "var(--gb-accent)",
  color: "var(--gb-surface)",
  padding: "6px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
const list: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};
const listItem: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface)",
};
