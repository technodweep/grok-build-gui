# Architecture

Grok Build GUI is a **Tauri 2** desktop client that talks to the existing **Grok CLI agent** over the [Agent Client Protocol (ACP)](https://agentclientprotocol.com).

```
UI (React)  ──invoke/events──►  Rust (Tauri)  ──JSON-RPC stdio──►  grok agent stdio
```

## Principles

1. **Do not reimplement the agent.** Auth, tools, MCP, models, memory, compact, skills, hooks, and session disk format stay in `grok`.
2. **The GUI is the pager.** Scrollback, composer, dashboard chrome, themes, and desktop shortcuts live here.
3. **ACP is the contract.** Prefer standard methods (`initialize`, `session/*`, `fs/*`, `terminal/*`) and feature-detect `x.ai/*` extensions.
4. **Agent slash as fallback.** When ACP lacks a surface, thin UI runs agent slash commands (`/remember`, `/loop`, …).
5. **Feature-detect, never hard-crash.** Missing capabilities hide or disable controls.
6. **Safety defaults.** Ask mode by default; yolo/auto are explicit. Client `fs/*` stays project-sandboxed.

## Full parity roadmap

See **[full-parity-plan.md](./full-parity-plan.md)** for the complete Grok Build feature inventory and phases **A–I** (implemented through release quality).

See **[multi-repo-workspaces-plan.md](./multi-repo-workspaces-plan.md)** for the proposed optional multi-repository workspace dashboard, repository-scoped runtime design, safety boundaries, UI wireframes, and implementation phases.

Shipped surface checklist: **[acp-surface.md](./acp-surface.md)**.  
Packaging & signing: **[packaging.md](./packaging.md)**.

## Crates / packages

| Path | Role |
|------|------|
| `apps/desktop` | Tauri app (frontend + `src-tauri`) |
| `apps/desktop/src-tauri/src/acp` | Spawn agent, JSON-RPC loop, permission/fs/terminal handlers |
| `apps/desktop/src-tauri/src/config` | Home/binary detect, GUI settings, extensions, agents, memory, account/sandbox/doctor |
| `apps/desktop/src-tauri/src/session` | Disk session index, history, signals, subagents, plan.md |
| `apps/desktop/src` | React UI (chat, hubs, composer, dashboard, settings) |
| `apps/desktop/src/shared` | Store, API, export, stream batch, a11y, media helpers |
| `apps/desktop/src-tauri/tests` | Optional live-agent integration (`GROK_GUI_INTEGRATION=1`) |

## Runtime flow

1. App starts → `get_environment` detects `grok` binary and auth.
2. User picks a project folder → `connect_agent` spawns `grok agent stdio`.
3. Client sends `initialize`, best-effort `authenticate`, then `session/new` (or `session/load`) with absolute `cwd`.
4. `send_prompt` issues `session/prompt` (text and/or image/resource blocks); agent streams `session/update`.
5. Rust emits `session://update` (and related) events; React appends message/tool/thought items.
6. Agent may call `session/request_permission`, `elicitation/create`, `fs/*`, or `terminal/*`; Rust hosts those capabilities.
7. Cancel sends `session/cancel` and unblocks local prompt waiters so the UI can stop immediately.

## Major UI hubs

| Hub | Slash | Role |
|-----|-------|------|
| Extensions | `/plugins` | MCP, skills, plugins, hooks, trust |
| Agents | `/agents` | User agents/personas + live subagents |
| Tasks | `/tasks` | Terminals, loops, goals, workflows, research |
| Memory | `/memory` | Remember, browse, flush/dream, imagine |
| Account | `/account` | Login/logout, privacy, sandbox, doctor, permissions |
| Help | `/docs` | In-app guide + online docs link |
| Project | `/rules` | AGENTS.md / rules + custom models |

## Permission default

Interactive GUI defaults to **ask** (no `--always-approve`). Users can choose Ask / Auto / Always on the welcome screen or Account → Permissions. Status bar cycles Ask · Auto · Plan · Yolo (right-click → three-way).

## Testing

| Layer | Command |
|-------|---------|
| Rust unit | `cargo test -p grok-build-gui` |
| Frontend helpers | `pnpm --dir apps/desktop test` |
| Live agent | `GROK_GUI_INTEGRATION=1 cargo test -p grok-build-gui --test integration_agent` |
| Local CI mirror | `./scripts/ci-local.sh` |
