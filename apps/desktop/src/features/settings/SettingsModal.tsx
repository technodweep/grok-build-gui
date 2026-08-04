import { useEffect, useState, type CSSProperties } from "react";
import { getEnvironment, getGuiSettings, setGuiSettings } from "../../shared/api";
import { useAppStore } from "../../shared/store";
import { applyTheme, THEME_OPTIONS, type ThemeId } from "../../shared/theme";
import type { GuiSettings } from "../../shared/types";

export function SettingsModal() {
  const open = useAppStore((s) => s.settingsOpen);
  const setOpen = useAppStore((s) => s.setSettingsOpen);
  const setAlwaysApprove = useAppStore((s) => s.setAlwaysApprove);
  const setEnv = useAppStore((s) => s.setEnv);
  const setError = useAppStore((s) => s.setError);
  const alwaysApprove = useAppStore((s) => s.alwaysApprove);

  const [theme, setTheme] = useState<ThemeId>("dark");
  const [fontSize, setFontSize] = useState(14);
  const [binaryOverride, setBinaryOverride] = useState("");
  const [lastCwd, setLastCwd] = useState("");
  const [yolo, setYolo] = useState(alwaysApprove);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void getGuiSettings().then((s: GuiSettings) => {
      const t = (s.theme as ThemeId) || "dark";
      setTheme(t === "light" || t === "dim" ? t : "dark");
      setFontSize(s.fontSize ?? 14);
      setBinaryOverride(s.binaryOverride ?? "");
      setLastCwd(s.lastProjectCwd ?? "");
      setYolo(!!s.alwaysApprove);
    });
  }, [open]);

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
      };
      await setGuiSettings(settings);
      setAlwaysApprove(yolo);
      applyTheme(theme, fontSize);
      // Refresh env with new binary override
      const env = await getEnvironment(binaryOverride.trim() || null);
      setEnv(env);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="gb-modal-backdrop" onClick={() => setOpen(false)}>
      <div className="gb-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Settings</h2>
          <button type="button" style={ghost} onClick={() => setOpen(false)}>
            Close
          </button>
        </div>

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
                  background: theme === t.id ? "var(--gb-accent)" : "var(--gb-surface-overlay)",
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
      </div>
    </div>
  );
}

const section: CSSProperties = { marginTop: 16 };
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
