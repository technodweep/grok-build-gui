import { useEffect, useState, type CSSProperties } from "react";
import { connectAgent, getGuiSettings } from "../../shared/api";
import { nextId, useAppStore } from "../../shared/store";
import type { EnvironmentInfo } from "../../shared/types";
import { SessionList } from "./SessionList";

async function pickDirectory(): Promise<string | null> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Open project folder",
    });
    return typeof selected === "string" ? selected : null;
  } catch (e) {
    console.error("folder picker failed", e);
    return null;
  }
}

export function Welcome({ env }: { env: EnvironmentInfo }) {
  const projectCwd = useAppStore((s) => s.projectCwd);
  const setProjectCwd = useAppStore((s) => s.setProjectCwd);
  const alwaysApprove = useAppStore((s) => s.alwaysApprove);
  const setAlwaysApprove = useAppStore((s) => s.setAlwaysApprove);
  const setSession = useAppStore((s) => s.setSession);
  const setStatus = useAppStore((s) => s.setStatus);
  const setError = useAppStore((s) => s.setError);
  const clearScroll = useAppStore((s) => s.clearScroll);
  const pushItem = useAppStore((s) => s.pushItem);
  const setView = useAppStore((s) => s.setView);
  const error = useAppStore((s) => s.error);
  const [connecting, setConnecting] = useState(false);

  // Restore last project + yolo from ~/.grok/gui/settings.json
  useEffect(() => {
    void getGuiSettings()
      .then((s) => {
        if (s.lastProjectCwd && !projectCwd) {
          setProjectCwd(s.lastProjectCwd);
        }
        if (typeof s.alwaysApprove === "boolean") {
          setAlwaysApprove(s.alwaysApprove);
        }
      })
      .catch(() => {
        /* ignore */
      });
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickFolder = async () => {
    const selected = await pickDirectory();
    if (selected) setProjectCwd(selected);
  };

  const onConnect = async () => {
    if (!projectCwd) {
      setError("Choose a project folder first");
      return;
    }
    setConnecting(true);
    setStatus("connecting");
    setError(null);
    clearScroll();
    try {
      const session = await connectAgent({
        cwd: projectCwd,
        alwaysApprove,
      });
      setSession(session);
      setStatus("ready");
      setView("chat");
      pushItem({
        id: nextId(),
        kind: "system",
        text: `Connected · session ${session.sessionId.slice(0, 8)}… · ${session.cwd}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("error");
      setError(msg);
      pushItem({ id: nextId(), kind: "system", text: msg, level: "error" });
    } finally {
      setConnecting(false);
    }
  };

  // Inline styles so UI stays visible even if Tailwind fails to apply in WebKit.
  const page: CSSProperties = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    padding: 32,
    background: "#0c0e12",
    color: "#e8ecf4",
    overflow: "auto",
  };
  const card: CSSProperties = {
    width: "100%",
    maxWidth: 512,
    borderRadius: 12,
    border: "1px solid #2a3140",
    background: "#141820",
    padding: 20,
    textAlign: "left",
  };
  const input: CSSProperties = {
    flex: 1,
    borderRadius: 8,
    border: "1px solid #2a3140",
    background: "#0c0e12",
    color: "#e8ecf4",
    padding: "8px 12px",
    fontFamily: "ui-monospace, Menlo, monospace",
    fontSize: 13,
  };
  const btn: CSSProperties = {
    borderRadius: 8,
    border: "1px solid #2a3140",
    background: "#1a1f2a",
    color: "#e8ecf4",
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: 14,
  };
  const primary: CSSProperties = {
    ...btn,
    width: "100%",
    background: "#7c9cff",
    color: "#0c0e12",
    border: "none",
    fontWeight: 600,
    padding: "10px 12px",
    opacity: !env.found || connecting || !projectCwd ? 0.4 : 1,
  };

  return (
    <div style={page}>
      <div style={{ maxWidth: 512, textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>Grok Build</h1>
        <p style={{ marginTop: 8, color: "#8b95a8", fontSize: 14, lineHeight: 1.5 }}>
          Desktop GUI for Grok Build. Spawns <code style={{ color: "#7c9cff" }}>grok agent stdio</code>{" "}
          and streams ACP sessions into a native chat shell.
        </p>
      </div>

      {error ? (
        <div
          style={{
            ...card,
            borderColor: "rgba(240,113,120,0.5)",
            background: "rgba(240,113,120,0.08)",
            color: "#f07178",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      {!env.found ? (
        <div style={{ ...card, borderColor: "rgba(240,180,41,0.45)", background: "rgba(240,180,41,0.08)" }}>
          <p style={{ margin: 0, fontWeight: 600, color: "#f0b429" }}>Grok CLI not found</p>
          <p style={{ marginTop: 8, color: "#8b95a8", fontSize: 13 }}>
            Install the CLI, then restart this app:
          </p>
          <pre
            style={{
              marginTop: 8,
              overflow: "auto",
              borderRadius: 8,
              background: "#0c0e12",
              padding: 12,
              color: "#e8ecf4",
              fontSize: 12,
            }}
          >
            curl -fsSL https://x.ai/cli/install.sh | bash
          </pre>
          <p style={{ marginTop: 8, color: "#8b95a8", fontSize: 13 }}>
            Looking under PATH and <code>~/.grok/bin/grok</code>. Grok home:{" "}
            <code>{env.grokHome}</code>
          </p>
        </div>
      ) : (
        <div style={card}>
          <div style={{ fontSize: 13, color: "#8b95a8", marginBottom: 16 }}>
            <div>
              Binary: <span style={{ color: "#e8ecf4", fontFamily: "monospace" }}>{env.binaryPath}</span>
            </div>
            {env.binaryVersion ? <div style={{ marginTop: 4 }}>Version: {env.binaryVersion}</div> : null}
            <div style={{ marginTop: 4 }}>
              Auth:{" "}
              {env.authPresent ? (
                <span style={{ color: "#3dd68c" }}>detected</span>
              ) : (
                <span style={{ color: "#f0b429" }}>
                  not found — run <code>grok</code> once to sign in
                </span>
              )}
            </div>
          </div>

          <label style={{ display: "block", marginBottom: 6, fontSize: 11, color: "#8b95a8", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Project folder
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={input}
              value={projectCwd}
              onChange={(e) => setProjectCwd(e.target.value)}
              placeholder="/path/to/project"
            />
            <button type="button" style={btn} onClick={() => void pickFolder()}>
              Browse
            </button>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, fontSize: 13, color: "#8b95a8" }}>
            <input
              type="checkbox"
              checked={alwaysApprove}
              onChange={(e) => setAlwaysApprove(e.target.checked)}
            />
            Always approve tools (yolo) — skip permission prompts
          </label>

          <button
            type="button"
            style={{ ...primary, marginTop: 16 }}
            disabled={!env.found || connecting || !projectCwd}
            onClick={() => void onConnect()}
          >
            {connecting ? "Connecting…" : "Open new session"}
          </button>
        </div>
      )}

      {env.found ? (
        <SessionList projectCwd={projectCwd} alwaysApprove={alwaysApprove} />
      ) : null}
    </div>
  );
}
