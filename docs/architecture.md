# Architecture

Grok Build GUI is a **Tauri 2** desktop client that talks to the existing **Grok CLI agent** over the [Agent Client Protocol (ACP)](https://agentclientprotocol.com).

```
UI (React)  ──invoke/events──►  Rust (Tauri)  ──JSON-RPC stdio──►  grok agent stdio
```

## Principles

1. **Do not reimplement the agent.** Auth, tools, MCP, models, and session persistence stay in `grok`.
2. **The GUI is the pager.** Scrollback, composer, dashboard chrome, themes, and desktop shortcuts live here.
3. **ACP is the contract.** Prefer standard methods (`initialize`, `session/*`) and feature-detect `x.ai/*` extensions.

## Crates / packages

| Path | Role |
|------|------|
| `apps/desktop` | Tauri app (frontend + `src-tauri`) |
| `apps/desktop/src-tauri/src/acp` | Spawn agent, JSON-RPC loop, permission/fs handlers |
| `apps/desktop/src-tauri/src/config` | `GROK_HOME`, binary detection |
| `apps/desktop/src` | React UI (chat, welcome, composer) |

## Runtime flow

1. App starts → `get_environment` detects `grok` binary and auth.
2. User picks a project folder → `connect_agent` spawns `grok agent stdio`.
3. Client sends `initialize` then `session/new` with absolute `cwd`.
4. `send_prompt` issues `session/prompt`; agent streams `session/update` notifications.
5. Rust emits `session://update` events; React appends message/tool/thought items.
6. Agent may call `session/request_permission` or `fs/*`; Rust handles (MVP auto-allow permissions).

## Permission default

Interactive GUI defaults to **ask** (no `--always-approve`). Users can enable yolo on the welcome screen. Permission UI (approve/deny) lands in PR3; MVP auto-selects `allow-once` after emitting the event.
