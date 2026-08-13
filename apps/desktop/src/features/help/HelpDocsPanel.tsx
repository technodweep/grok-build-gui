import { useEffect, useState, type CSSProperties } from "react";
import { ModalShell } from "../../shared/ModalShell";
import { useAppStore } from "../../shared/store";

type SectionId =
  | "overview"
  | "chat"
  | "sessions"
  | "permissions"
  | "extensions"
  | "automation"
  | "memory"
  | "account"
  | "keyboard"
  | "online";

const SECTIONS: { id: SectionId; title: string; body: string }[] = [
  {
    id: "overview",
    title: "What is KayG?",
    body: `KayG is an independent, open-source desktop client compatible with the Grok Build CLI. It does not reimplement the agent — it speaks ACP over \`grok agent stdio\`.

Install the CLI separately (\`curl -fsSL https://x.ai/cli/install.sh | bash\`), then open a project folder from the welcome screen.

KayG is a community project and is not affiliated with, endorsed by, or sponsored by xAI. Grok and Grok Build are trademarks of xAI.`,
  },
  {
    id: "chat",
    title: "Chat & composer",
    body: `• Type normally and press Enter to send (Shift+Enter for newline, or toggle multiline mode).
• \`/\` opens the command palette; \`@\` attaches project files.
• Drag-drop files or use the Image button for picture attachments.
• Stop cancels the current turn. Queue prompts while a turn is running.`,
  },
  {
    id: "sessions",
    title: "Sessions",
    body: `Sessions are stored by the Grok CLI under \`~/.grok/sessions/\`. Resume from the welcome list, rename/delete there, or use the multi-agent dashboard for live sessions.

New session: \`/new\`. Home / welcome: \`/home\`.`,
  },
  {
    id: "permissions",
    title: "Permissions & safety",
    body: `Default is **Ask** — approve each tool. Status bar mode chip cycles Ask · Auto · Plan · Yolo. Right-click the chip for Ask / Auto / Always.

Yolo (always approve) is explicit and never the silent default. Client file access stays sandboxed to the project folder.`,
  },
  {
    id: "extensions",
    title: "Extensions",
    body: `Open **Extensions** (or \`/plugins\`) for MCP servers, skills, plugins, marketplace, hooks, and folder trust. Config writes go to \`~/.grok/config.toml\` via safe edits.`,
  },
  {
    id: "automation",
    title: "Automation",
    body: `**Tasks** hub covers agent terminals (kill/release), \`/loop\`, \`/goal\`, workflows, and deep research. Long-running work can notify when terminals finish.`,
  },
  {
    id: "memory",
    title: "Memory & media",
    body: `**Memory** browses \`~/.grok/memory\`, runs \`/remember\`, \`/flush\`, \`/dream\`, and \`/imagine\`. Enable memory in config or with \`/memory on\` in a session.`,
  },
  {
    id: "account",
    title: "Account & sandbox",
    body: `**Account** handles login (\`grok login\`), logout, privacy flags, sandbox profile, doctor diagnostics, and permission mode.

Sandbox profile changes apply to new agent sessions. GUI fs/* sandbox is always project-scoped.`,
  },
  {
    id: "keyboard",
    title: "Keyboard shortcuts",
    body: `• Ctrl+, settings · Ctrl+/ shortcuts cheatsheet
• Ctrl+F find in scrollback · Alt+↑/↓ jump user turns
• Esc stop turn / close modal
• Full list: \`/shortcuts\``,
  },
  {
    id: "online",
    title: "Online docs",
    body: `Official Build docs: https://docs.x.ai/build/overview

Grok CLI user guide lives under \`~/.grok/docs/user-guide/\` when the CLI is installed.

In a live session you can also run agent \`/docs\` for built-in how-to guides.`,
  },
];

const btn: CSSProperties = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid var(--gb-border)",
  background: "var(--gb-surface)",
  color: "var(--gb-ink)",
  cursor: "pointer",
  textAlign: "left",
};

export function HelpDocsPanel() {
  const open = useAppStore((s) => s.helpOpen);
  const setOpen = useAppStore((s) => s.setHelpOpen);
  const [section, setSection] = useState<SectionId>("overview");

  useEffect(() => {
    if (open) setSection("overview");
  }, [open]);

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  const openOnline = async () => {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl("https://docs.x.ai/build/overview");
    } catch {
      window.open("https://docs.x.ai/build/overview", "_blank");
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={() => setOpen(false)}
      title="Help & docs"
      description="In-app guide for KayG and its Grok Build CLI workflows"
      wide
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(140px, 200px) 1fr",
          gap: 12,
          minHeight: 320,
        }}
      >
        <nav
          aria-label="Help sections"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            borderRight: "1px solid var(--gb-border)",
            paddingRight: 8,
          }}
        >
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              style={{
                ...btn,
                borderColor:
                  section === s.id ? "var(--gb-accent-dim)" : "var(--gb-border)",
                color: section === s.id ? "var(--gb-accent)" : "var(--gb-ink)",
                fontWeight: section === s.id ? 600 : 400,
              }}
              aria-current={section === s.id ? "page" : undefined}
              onClick={() => setSection(s.id)}
            >
              {s.title}
            </button>
          ))}
          <button type="button" style={{ ...btn, marginTop: 8 }} onClick={() => void openOnline()}>
            Open online docs ↗
          </button>
        </nav>
        <article style={{ minWidth: 0 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 15 }}>{current.title}</h2>
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.55,
              color: "var(--gb-ink)",
              whiteSpace: "pre-wrap",
            }}
          >
            {current.body}
          </div>
        </article>
      </div>
    </ModalShell>
  );
}
