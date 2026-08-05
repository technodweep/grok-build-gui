# Architecture

Grok Build GUI is a **Tauri 2** desktop client that talks to the existing **Grok CLI agent** over the [Agent Client Protocol (ACP)](https://agentclientprotocol.com).

```
UI (React)  ──invoke/events──►  Rust (Tauri)  ──JSON-RPC stdio──►  grok agent stdio
```

## Principles

1. **Do not reimplement the agent.** Auth, tools, MCP, models, memory, compact, and session persistence stay in `grok`.
2. **The GUI is the pager.** Scrollback, composer, dashboard chrome, themes, and desktop shortcuts live here.
3. **ACP is the contract.** Prefer standard methods (`initialize`, `session/*`, `fs/*`, `terminal/*`) and feature-detect `x.ai/*` extensions.

## Full parity roadmap

See **[full-parity-plan.md](./full-parity-plan.md)** for the complete Grok Build feature inventory, gap analysis, and phased build plan (A–I).

Shipped surface checklist: **[acp-surface.md](./acp-surface.md)**.

## Crates / packages

| Path | Role |
|------|------|
| `apps/desktop` | Tauri app (frontend + `src-tauri`) |
| `apps/desktop/src-tauri/src/acp` | Spawn agent, JSON-RPC loop, permission/fs/terminal handlers |
| `apps/desktop/src-tauri/src/config` | `GROK_HOME`, binary detection, GUI settings, config overview |
| `apps/desktop/src-tauri/src/session` | Disk session index, history, signals, subagents |
| `apps/desktop/src` | React UI (chat, welcome, composer, dashboard, settings) |

## Runtime flow

1. App starts → `get_environment` detects `grok` binary and auth.
2. User picks a project folder → `connect_agent` spawns `grok agent stdio`.
3. Client sends `initialize`, best-effort `authenticate`, then `session/new` (or `session/load`) with absolute `cwd`.
4. `send_prompt` issues `session/prompt`; agent streams `session/update` notifications.
5. Rust emits `session://update` (and related) events; React appends message/tool/thought items.
6. Agent may call `session/request_permission`, `fs/*`, or `terminal/*`; Rust hosts those client capabilities.
7. Cancel sends `session/cancel` and unblocks local prompt waiters so the UI can stop immediately.

## Permission default

Interactive GUI defaults to **ask** (no `--always-approve`). Users can enable yolo on the welcome screen or in settings. Permission UI supports allow once / always / deny.
