import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  authenticateAgent,
  getAuthAccount,
  getEnvironment,
  getPrivacyConfig,
  getSandboxStatus,
  grokDoctor,
  grokLogin,
  grokLogout,
  sendPrompt,
  setSandboxProfile,
  setTelemetryEnabled,
} from "../../shared/api";
import { activateModalA11y } from "../../shared/modalA11y";
import { nextId, useAppStore } from "../../shared/store";
import type {
  AuthAccountInfo,
  CliActionResult,
  DoctorReport,
  PermissionPolicy,
  PrivacyConfig,
  SandboxStatus,
  SessionMode,
} from "../../shared/types";

type Tab = "account" | "privacy" | "sandbox" | "doctor" | "safety";

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

function policyFromSession(m: SessionMode): PermissionPolicy {
  if (m === "yolo") return "always";
  if (m === "auto") return "auto";
  return "ask";
}

export function AccountSafetyModal() {
  const open = useAppStore((s) => s.accountOpen);
  const setOpen = useAppStore((s) => s.setAccountOpen);
  const preferredTab = useAppStore((s) => s.accountTab);
  const setPreferredTab = useAppStore((s) => s.setAccountTab);
  const env = useAppStore((s) => s.env);
  const setEnv = useAppStore((s) => s.setEnv);
  const setError = useAppStore((s) => s.setError);
  const status = useAppStore((s) => s.status);
  const busy = useAppStore((s) => s.busy);
  const setBusy = useAppStore((s) => s.setBusy);
  const pushItem = useAppStore((s) => s.pushItem);
  const sessionMode = useAppStore((s) => s.sessionMode);
  const setSessionMode = useAppStore((s) => s.setSessionMode);
  const setAlwaysApprove = useAppStore((s) => s.setAlwaysApprove);
  const alwaysApprove = useAppStore((s) => s.alwaysApprove);

  const [tab, setTab] = useState<Tab>(preferredTab);
  const [account, setAccount] = useState<AuthAccountInfo | null>(null);
  const [privacy, setPrivacy] = useState<PrivacyConfig | null>(null);
  const [sandbox, setSandbox] = useState<SandboxStatus | null>(null);
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loginLog, setLoginLog] = useState<string | null>(null);
  const [sandboxPick, setSandboxPick] = useState("off");
  const panelRef = useRef<HTMLDivElement>(null);

  const ready = status === "ready";
  const binaryOverride = env?.binaryPath ?? null;

  useEffect(() => {
    if (!open || !panelRef.current) return;
    return activateModalA11y(panelRef.current, { onClose: () => setOpen(false) });
  }, [open, setOpen]);

  const refreshAccount = useCallback(async () => {
    try {
      const [a, p, s, e] = await Promise.all([
        getAuthAccount(),
        getPrivacyConfig(),
        getSandboxStatus(),
        getEnvironment(),
      ]);
      setAccount(a);
      setPrivacy(p);
      setSandbox(s);
      setSandboxPick(s.configProfile || s.effectiveProfile || "off");
      setEnv(e);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [setEnv, setError]);

  useEffect(() => {
    if (open) {
      setTab(preferredTab);
      setMsg(null);
      setLoginLog(null);
      void refreshAccount();
    }
  }, [open, preferredTab, refreshAccount]);

  if (!open) return null;

  const switchTab = (t: Tab) => {
    setTab(t);
    setPreferredTab(t);
  };

  const showResult = (r: CliActionResult) => {
    setMsg(r.summary);
    const log = [r.stdout, r.stderr].filter(Boolean).join("\n").trim();
    if (log) setLoginLog(log.slice(0, 4000));
    if (r.urls.length) {
      setLoginLog((prev) =>
        [`URLs: ${r.urls.join(", ")}`, r.deviceCode ? `Code: ${r.deviceCode}` : "", prev ?? ""]
          .filter(Boolean)
          .join("\n"),
      );
    }
  };

  const onLogin = async (mode: "oauth" | "device") => {
    setWorking(true);
    setMsg(
      mode === "oauth"
        ? "Opening browser for OAuth… complete sign-in in the browser, then wait here."
        : "Starting device-code login… watch for a URL and code below.",
    );
    setLoginLog(null);
    try {
      const r = await grokLogin(mode, binaryOverride);
      showResult(r);
      await refreshAccount();
      if (r.ok) {
        // Best-effort ACP verify
        try {
          await authenticateAgent(binaryOverride);
        } catch {
          /* optional */
        }
      } else if (!r.ok) {
        setError(r.summary);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  const onLogout = async () => {
    if (!window.confirm("Sign out and clear cached Grok credentials?")) return;
    setWorking(true);
    try {
      const r = await grokLogout(binaryOverride);
      showResult(r);
      await refreshAccount();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  const onVerify = async () => {
    setWorking(true);
    try {
      await authenticateAgent(binaryOverride);
      await refreshAccount();
      setMsg("ACP authenticate (cached_token) succeeded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  const onDoctor = async () => {
    setWorking(true);
    setMsg("Running grok doctor…");
    try {
      const report = await grokDoctor(binaryOverride);
      setDoctor(report);
      setMsg(report.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  const onSaveSandbox = async () => {
    setWorking(true);
    try {
      const s = await setSandboxProfile(sandboxPick);
      setSandbox(s);
      setMsg(
        `Config sandbox profile → ${sandboxPick}. Start a new session for the agent process to pick it up.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  const onTelemetry = async (enabled: boolean) => {
    setWorking(true);
    try {
      const p = await setTelemetryEnabled(enabled);
      setPrivacy(p);
      setMsg(`[features].telemetry = ${enabled}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  const applyPermissionPolicy = async (policy: PermissionPolicy) => {
    const nextMode: SessionMode =
      policy === "always" ? "yolo" : policy === "auto" ? "auto" : "ask";
    const prev = sessionMode;
    setSessionMode(nextMode);
    setAlwaysApprove(policy === "always");

    if (!ready) {
      setMsg(
        `Default permission → ${policy} (saved for connect; agent slash needs a live session).`,
      );
      return;
    }

    // Map to agent toggles carefully
    const slash =
      policy === "always"
        ? prev === "yolo"
          ? null
          : "/always-approve"
        : policy === "auto"
          ? prev === "auto"
            ? null
            : "/auto"
          : // ask: turn off yolo/auto if needed
            prev === "yolo"
            ? "/always-approve"
            : prev === "auto"
              ? "/auto"
              : null;

    pushItem({
      id: nextId(),
      kind: "system",
      text: `Permission → ${policy}${slash ? ` (${slash})` : ""}`,
    });
    if (!slash) {
      setMsg(`Permission policy: ${policy}`);
      return;
    }
    try {
      setBusy(true);
      await sendPrompt(slash);
      setMsg(`Permission policy: ${policy}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSessionMode(prev);
    } finally {
      setBusy(false);
    }
  };

  const openUrl = async (url: string) => {
    try {
      const { openUrl: open } = await import("@tauri-apps/plugin-opener");
      await open(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const agentPrivacy = async () => {
    if (!ready) {
      setError("Connect a session to open agent /privacy");
      return;
    }
    try {
      setBusy(true);
      pushItem({ id: nextId(), kind: "system", text: "Opening agent /privacy…" });
      await sendPrompt("/privacy");
      setMsg("Sent /privacy to agent");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const currentPolicy = alwaysApprove
    ? "always"
    : policyFromSession(sessionMode);

  const profiles = Array.from(
    new Set([
      ...(sandbox?.builtinProfiles ?? ["off", "workspace", "read-only", "strict"]),
      ...(sandbox?.customProfiles ?? []),
    ]),
  );

  return (
    <div className="gb-modal-backdrop" onClick={() => setOpen(false)}>
      <div
        ref={panelRef}
        className="gb-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 720,
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
            <div style={{ fontWeight: 700, fontSize: 16 }}>Account & safety</div>
            <div style={{ fontSize: 12, color: "var(--gb-ink-muted)", marginTop: 2 }}>
              Login, privacy, sandbox, doctor, permission mode
            </div>
          </div>
          <button type="button" style={btn} onClick={() => setOpen(false)}>
            Close
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {(
            [
              ["account", "Account"],
              ["privacy", "Privacy"],
              ["sandbox", "Sandbox"],
              ["doctor", "Doctor"],
              ["safety", "Permissions"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              style={tabBtn(tab === id)}
              onClick={() => switchTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {msg ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--gb-success)",
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid var(--gb-border)",
              background: "var(--gb-surface)",
            }}
          >
            {msg}
          </div>
        ) : null}

        <div style={{ overflow: "auto", flex: 1, minHeight: 0 }}>
          {tab === "account" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <section style={card}>
                <div style={sectionTitle}>Status</div>
                <Row
                  label="Signed in"
                  value={
                    account?.present
                      ? account.email || "yes"
                      : account?.apiKeyEnv
                        ? "API key env only"
                        : "no"
                  }
                />
                <Row label="Mode" value={account?.authMode || "—"} />
                <Row label="Name" value={account?.firstName || "—"} />
                <Row label="Team" value={account?.teamId || "—"} />
                <Row label="Expires" value={account?.expiresAt || "—"} />
                <Row label="Issuer" value={account?.oidcIssuer || "—"} />
                <Row label="Auth file" value={account?.authPath || "—"} mono />
              </section>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  style={primary}
                  disabled={working || !env?.found}
                  onClick={() => void onLogin("oauth")}
                >
                  {working ? "…" : "Login (browser)"}
                </button>
                <button
                  type="button"
                  style={btn}
                  disabled={working || !env?.found}
                  onClick={() => void onLogin("device")}
                  title="Device-code flow for headless / remote"
                >
                  Login (device code)
                </button>
                <button
                  type="button"
                  style={btn}
                  disabled={working || !env?.found}
                  onClick={() => void onVerify()}
                >
                  Verify token
                </button>
                <button
                  type="button"
                  style={{ ...btn, color: "var(--gb-danger)" }}
                  disabled={working || !env?.found}
                  onClick={() => void onLogout()}
                >
                  Logout
                </button>
              </div>

              <p style={{ fontSize: 12, color: "var(--gb-ink-muted)", margin: 0 }}>
                Login runs <code>grok login</code> (opens the browser for OAuth). Device
                code prints a URL and code — open the URL on any device. Credentials stay
                in <code>~/.grok/auth.json</code> (agent-owned).
              </p>

              {loginLog ? (
                <pre
                  style={{
                    margin: 0,
                    maxHeight: 160,
                    overflow: "auto",
                    fontSize: 11,
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid var(--gb-border)",
                    background: "var(--gb-bg)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {loginLog}
                </pre>
              ) : null}
            </div>
          ) : null}

          {tab === "privacy" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <section style={card}>
                <div style={sectionTitle}>Coding data (from auth.json)</div>
                <Row
                  label="Retention opt-out"
                  value={
                    account?.codingDataRetentionOptOut == null
                      ? "—"
                      : account.codingDataRetentionOptOut
                        ? "yes (opted out)"
                        : "no (sharing allowed)"
                  }
                />
                <Row
                  label="ZDR"
                  value={
                    account?.zeroDataRetention == null
                      ? "not in auth file"
                      : account.zeroDataRetention
                        ? "enabled"
                        : "off"
                  }
                />
                {account?.privacyNote ? (
                  <p style={{ fontSize: 12, color: "var(--gb-ink-muted)", margin: "8px 0 0" }}>
                    {account.privacyNote}
                  </p>
                ) : null}
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    style={primary}
                    disabled={!ready || busy}
                    onClick={() => void agentPrivacy()}
                  >
                    Agent /privacy
                  </button>
                  <button
                    type="button"
                    style={btn}
                    onClick={() =>
                      void openUrl(
                        "https://docs.x.ai/developers/faq/security#how-to-enable-zdr",
                      )
                    }
                  >
                    ZDR docs
                  </button>
                </div>
              </section>

              <section style={card}>
                <div style={sectionTitle}>Telemetry (config.toml)</div>
                <Row
                  label="[features].telemetry"
                  value={
                    privacy?.telemetryEnabled == null
                      ? "default / unset"
                      : privacy.telemetryEnabled
                        ? "on"
                        : "off"
                  }
                />
                <Row
                  label="trace_upload"
                  value={
                    privacy?.traceUpload == null
                      ? "—"
                      : privacy.traceUpload
                        ? "on"
                        : "off"
                  }
                />
                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    style={btn}
                    disabled={working}
                    onClick={() => void onTelemetry(false)}
                  >
                    Disable telemetry
                  </button>
                  <button
                    type="button"
                    style={btn}
                    disabled={working}
                    onClick={() => void onTelemetry(true)}
                  >
                    Enable telemetry
                  </button>
                </div>
                <p style={{ fontSize: 11, color: "var(--gb-ink-muted)", margin: "8px 0 0" }}>
                  Separate from coding-data retention. Path: {privacy?.configPath}
                </p>
              </section>
            </div>
          ) : null}

          {tab === "sandbox" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <section style={card}>
                <div style={sectionTitle}>Agent process sandbox</div>
                <Row label="Effective" value={sandbox?.effectiveProfile || "off"} />
                <Row label="Config profile" value={sandbox?.configProfile || "—"} />
                <Row label="GROK_SANDBOX" value={sandbox?.envProfile || "—"} />
                <Row
                  label="GUI fs/* sandbox"
                  value={sandbox?.clientFsSandbox ? "on (project cwd)" : "off"}
                />
                <Row
                  label="sandbox.toml"
                  value={
                    sandbox?.sandboxTomlExists
                      ? sandbox.sandboxTomlPath
                      : `${sandbox?.sandboxTomlPath ?? ""} (missing)`
                  }
                  mono
                />
              </section>

              <section style={card}>
                <div style={sectionTitle}>Set config profile</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <select
                    value={sandboxPick}
                    onChange={(e) => setSandboxPick(e.target.value)}
                    style={{
                      borderRadius: 8,
                      border: "1px solid var(--gb-border)",
                      background: "var(--gb-bg)",
                      color: "var(--gb-ink)",
                      padding: "6px 10px",
                      fontSize: 13,
                    }}
                  >
                    {profiles.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    style={primary}
                    disabled={working}
                    onClick={() => void onSaveSandbox()}
                  >
                    Save to config
                  </button>
                  <button
                    type="button"
                    style={btn}
                    onClick={() =>
                      void openUrl("https://docs.x.ai/build")
                    }
                    title="Open docs"
                  >
                    Docs
                  </button>
                </div>
                <ul
                  style={{
                    margin: "10px 0 0",
                    paddingLeft: 18,
                    fontSize: 12,
                    color: "var(--gb-ink-muted)",
                  }}
                >
                  {(sandbox?.notes ?? []).map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </section>
            </div>
          ) : null}

          {tab === "doctor" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  style={primary}
                  disabled={working || !env?.found}
                  onClick={() => void onDoctor()}
                >
                  {working ? "Running…" : "Run grok doctor"}
                </button>
                {doctor ? (
                  <span style={{ fontSize: 12, color: "var(--gb-ink-muted)" }}>
                    {doctor.summary}
                  </span>
                ) : null}
              </div>
              <p style={{ fontSize: 12, color: "var(--gb-ink-muted)", margin: 0 }}>
                Runs <code>grok doctor --json</code> (terminal, clipboard, color, sandbox
                probes). Session-specific issues may also appear via agent{" "}
                <code>/doctor</code>.
              </p>
              {doctor?.findings?.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {doctor.findings.map((f) => (
                    <div
                      key={f.id}
                      style={{
                        ...card,
                        borderColor:
                          f.disposition === "issue"
                            ? "var(--gb-danger)"
                            : f.disposition === "recommendation"
                              ? "var(--gb-warning)"
                              : "var(--gb-border)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          color:
                            f.disposition === "issue"
                              ? "var(--gb-danger)"
                              : "var(--gb-ink-muted)",
                          marginBottom: 4,
                        }}
                      >
                        {f.disposition || "info"} · {f.id}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{f.message}</div>
                      {f.note ? (
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--gb-ink-muted)",
                            marginTop: 4,
                          }}
                        >
                          {f.note}
                        </div>
                      ) : null}
                      {f.remediation ? (
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--gb-accent)",
                            marginTop: 4,
                          }}
                        >
                          {f.remediation}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : doctor ? (
                <div style={{ fontSize: 13, color: "var(--gb-success)" }}>
                  No findings reported.
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "safety" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <section style={card}>
                <div style={sectionTitle}>Tool permission mode</div>
                <p style={{ fontSize: 12, color: "var(--gb-ink-muted)", margin: "0 0 10px" }}>
                  <strong>Ask</strong> prompts every tool (default). <strong>Auto</strong>{" "}
                  uses agent auto-approval rules. <strong>Always</strong> is yolo
                  (skip prompts). Plan mode is separate on the status bar.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(
                    [
                      ["ask", "Ask"],
                      ["auto", "Auto"],
                      ["always", "Always"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      style={{
                        ...btn,
                        borderColor:
                          currentPolicy === id
                            ? id === "always"
                              ? "var(--gb-danger)"
                              : "var(--gb-accent-dim)"
                            : "var(--gb-border)",
                        color:
                          currentPolicy === id
                            ? id === "always"
                              ? "var(--gb-danger)"
                              : "var(--gb-accent)"
                            : "var(--gb-ink)",
                        fontWeight: currentPolicy === id ? 700 : 400,
                      }}
                      disabled={busy || working}
                      onClick={() => void applyPermissionPolicy(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: "var(--gb-ink-muted)" }}>
                  Session mode chip: <strong>{sessionMode}</strong>
                  {alwaysApprove ? " · yolo flag on for reconnect" : ""}
                </div>
              </section>

              <section style={card}>
                <div style={sectionTitle}>Notes</div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    fontSize: 12,
                    color: "var(--gb-ink-muted)",
                  }}
                >
                  <li>GUI never defaults to always-approve on connect.</li>
                  <li>Client fs/* path access stays project-sandboxed.</li>
                  <li>Use Extensions → Trust for folder trust grants.</li>
                </ul>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const card: CSSProperties = {
  border: "1px solid var(--gb-border)",
  borderRadius: 12,
  padding: 14,
  background: "var(--gb-surface)",
};

const sectionTitle: CSSProperties = {
  fontWeight: 600,
  fontSize: 13,
  marginBottom: 8,
};

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        fontSize: 12,
        padding: "3px 0",
        alignItems: "baseline",
      }}
    >
      <span style={{ color: "var(--gb-ink-muted)", minWidth: 120 }}>{label}</span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          wordBreak: "break-all",
          fontFamily: mono ? "ui-monospace, Menlo, monospace" : "inherit",
          fontSize: mono ? 11 : 12,
        }}
      >
        {value}
      </span>
    </div>
  );
}
