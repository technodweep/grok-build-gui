# Changelog

All notable changes to **KayG** are documented here.

## [0.1.0] — 2026-08-05

First public-ready desktop release: full TUI/product parity plan phases **A–I**, plus post-plan project config and polish.

### Highlights

- **ACP client** over `grok agent stdio` (Grok CLI ≥ 0.2.x) — no second agent
- Chat with streaming, thinking, tools, plans, permissions, elicitation
- Sessions: new / resume / rename / delete / multi-agent dashboard
- Hubs: Extensions, Agents, Tasks/automation, Memory & media, Account & safety, Project rules & models, Help

### Features (by area)

#### Chat & session power

- Compact / rewind / fork / copy Nth reply / export
- Plan mode + plan.md viewer + elicitation forms
- Context & usage panel, timeline, fold/expand, timestamps
- Raw markdown toggle (`/raw`), find-in-scrollback with jump + highlight
- Fuzzy prompt history (preview, copy, delete, persisted)

#### Extensions & agents

- MCP enable/disable/add/remove + doctor tools list
- Skills, plugins, marketplace, hooks, folder trust
- Agents & personas CRUD, live subagents panel

#### Automation

- Terminal kill/release + complete notifications
- Loops, goals, workflows, deep research launch UI

#### Memory & media

- Remember / browse / flush / dream
- Imagine gallery, inline media, prompt image attach (ACP image blocks)

#### Account & safety

- Login (browser OAuth / device code), logout, verify
- Privacy (retention meta, telemetry toggle), sandbox profile, doctor
- Permission Ask / Auto / Always

#### Project config

- AGENTS.md / rules editor (project + `~/.grok/rules`)
- Custom `[model.*]` endpoints + default model

#### Terminals in chat

- Tool cards embed live terminal tails with Open / Kill / Release

### Quality

- Unit tests (Rust + vitest)
- Optional live agent integration: `KAYG_INTEGRATION=1`
- Modal a11y (focus trap, Esc, ARIA)
- CI: typecheck, tests, clippy; release matrix Linux / macOS / Windows
- Optional signing secrets documented for notarization / Authenticode

### Requirements

- **Grok CLI ≥ 0.2.x** installed separately
- Auth via `grok login` or API key

### Install

See [docs/packaging.md](docs/packaging.md). Tag `v*` triggers GitHub Actions multi-platform packages.
