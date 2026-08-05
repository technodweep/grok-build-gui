# Grok Build GUI — Full Feature Parity Plan

**Goal:** Make this desktop app a first-class **GUI for everything you can do with Grok Build**, without reimplementing the agent.

**Last updated:** 2026-08-04  
**Baseline:** Tauri 2 + React/TS GUI speaking ACP over `grok agent stdio` (Grok CLI ≥ 0.2.x).

---

## 1. Principles (non-negotiable)

| # | Principle |
|---|-----------|
| 1 | **Do not reimplement the agent.** Auth, tools, MCP, models, memory, compact, skills, hooks, and session disk format stay in `grok`. |
| 2 | **The GUI is the pager.** Everything the TUI pager owns (chrome, navigation, panels, settings UX) is rebuilt as desktop UI. |
| 3 | **ACP first.** Prefer standard ACP (`session/*`, `fs/*`, `terminal/*`, config options). Use `x.ai/*` only when discovered at `initialize` / runtime; degrade gracefully. |
| 4 | **Agent slash as fallback.** If a feature is agent-owned and advertised in `available_commands`, ship a thin UI that runs it as a prompt *and* a dedicated surface when UX needs it. |
| 5 | **Feature-detect, never hard-crash.** Missing capabilities → hide or disable controls with a short reason. |
| 6 | **Safety defaults.** Ask mode by default; yolo/auto are explicit. FS sandbox stays on for client `fs/*`. |

---

## 2. Architecture reminder

```
┌─────────────────────────────────────────────────────────────┐
│  GUI (React)                                                │
│  Chat · Composer · Dashboard · Settings · Extensions · …    │
└──────────────────────────┬──────────────────────────────────┘
                           │ Tauri invoke + events
┌──────────────────────────▼──────────────────────────────────┐
│  Rust host                                                  │
│  ACP client · terminal host · fs host · config readers      │
└──────────────────────────┬──────────────────────────────────┘
                           │ JSON-RPC stdio (ACP)
┌──────────────────────────▼──────────────────────────────────┐
│  grok agent stdio                                           │
│  Tools · MCP · Skills · Sessions · Models · Memory · …      │
└─────────────────────────────────────────────────────────────┘
```

**Parity means:** every user-visible Grok Build *workflow* has a GUI path.  
**Parity does not mean:** pixel-perfect TUI keybindings, or a second agent.

---

## 3. Status legend

| Status | Meaning |
|--------|---------|
| **Done** | Shipped in this repo at useful quality |
| **Partial** | Exists but missing depth vs TUI |
| **Gap** | Not built yet |
| **Agent-only** | Logic lives in agent; GUI needs thin or rich shell |
| **N/A** | Terminal-pager-only concept (re-map to desktop pattern) |

---

## 4. Feature inventory — what we have vs full Grok Build

### 4.1 Core chat & turns

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| Streaming agent messages | **Done** | `agent_message_chunk` |
| Thinking blocks | **Done** | Collapsible |
| Tool calls + updates | **Partial** | Cards + diffs; more content types still |
| Plans (live entries) | **Partial** | Cards + sticky strip; no plan-mode lifecycle |
| Cancel / Stop turn | **Done** | `session/cancel` + local waiter unblock |
| Permission prompts | **Done** | Modal; allow once / always / deny |
| Yolo (always approve) | **Done** | Connect flag + settings |
| Auto permission mode | **Gap** | TUI `/auto` + Shift+Tab cycle |
| Prompt queue | **Done** | |
| Multiline composer | **Done** | |
| Prompt history ↑/↓ | **Partial** | No fuzzy `/history` panel |
| `@` file attach | **Done** | Fuzzy + small-file embed |
| Drag-drop files | **Done** | |
| Image / media chips in prompt | **Gap** | Capability `image` often false; still plan UI for when true |
| Export conversation | **Done** | File + clipboard |
| Copy last reply | **Partial** | Last only; TUI supports Nth + path |
| Find in scrollback | **Partial** | Basic find; no jump/timeline |
| Virtualized scrollback | **Done** | |
| Stream batching | **Done** | |
| Markdown / code highlight | **Partial** | Markdown yes; syntax highlight no |
| Fold / expand blocks | **Gap** | Tools, thoughts, groups |
| Compact UI density | **Gap** | `/compact-mode` |
| Timestamps on messages | **Gap** | `/timestamps` |
| Raw markdown toggle | **Gap** | |
| Turn navigation (prev/next user turn) | **Gap** | Desktop keys, not vim-required |

### 4.2 Sessions

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| New session | **Done** | |
| Resume from disk | **Done** | `session/load` + history hydrate |
| Session list (disk) | **Done** | |
| Session list (ACP `session/list`) | **Done** | Merged with disk |
| Rename / delete | **Done** | |
| Home / welcome | **Done** | |
| Multi-session dashboard | **Done** | Dispatch, pin, switch, stop, close |
| Subagent strip | **Partial** | Disk + live heuristic; no full subagent workspace |
| Fork session | **Gap** | Probe `session/fork` / `x.ai/*`; UI + history clone |
| Rewind / undo turns | **Gap** | ACP or `x.ai/rewind/*` when present |
| Compact conversation | **Partial** | Agent slash may work; need dedicated UX + status |
| Auto-compact indicator | **Partial** | Events exist (`auto_compact_*`); surface them |
| Reconnect after crash | **Done** | |
| Leader process multi-client | **Gap** | Optional later (`--leader`) |

### 4.3 Model, mode, effort

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| Model picker | **Done** | `session/set_model` + picker |
| Effort levels | **Done** | `session/set_mode` for effort |
| Plan mode enter/exit | **Gap** | Tools `enter_plan_mode` / `exit_plan_mode` + UI |
| View / edit plan file | **Gap** | Read `plan.md` in session dir; approval UI |
| Ask-user questions (elicitation) | **Gap** | ACP elicitation forms |
| Mode cycle (Normal / Plan / Yolo) | **Gap** | Status bar control |
| Permission mode: auto | **Gap** | |

### 4.4 Context, usage, monitoring

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| Context window bar | **Partial** | From signals + last tokens |
| Full `/context` categories | **Gap** | Needs agent data or derived estimate |
| Session info panel | **Partial** | |
| Live turn usage | **Done** | `turn_completed.usage` |
| Account `/usage` billing | **Gap** | Agent/API surface TBD |
| Background tasks panel | **Gap** | Monitor `run_terminal_command` background + tools |
| Workflows dashboard | **Gap** | `/workflows` parity UI |
| Doctor / health | **Gap** | `/doctor` as agent run + structured panel |

### 4.5 Terminals

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| ACP terminal host | **Done** | create/output/wait/kill/release |
| Live terminal panel | **Partial** | Output yes; PTY input/interactive less |
| Terminal in tool cards | **Gap** | Embed terminalId content |
| Background command roster | **Gap** | |

### 4.6 Extensions: MCP, skills, plugins, hooks

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| Config overview (read-only) | **Done** | Settings → Grok config |
| Open config.toml | **Done** | |
| MCP list / enable-disable UI | **Gap** | Edit TOML or agent APIs safely |
| MCP detail / tools list | **Gap** | Prefer agent discovery events |
| Skills browser | **Partial** | List only |
| Plugins install/uninstall | **Gap** | Marketplace + trust |
| Marketplace browser | **Gap** | |
| Hooks manager | **Gap** | Trust model critical |
| Project trust UX | **Gap** | |

### 4.7 Agents, personas, subagents

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| Live subagent strip | **Partial** | |
| Subagent detail / attach | **Gap** | Open child session view |
| Config agents modal | **Gap** | `/config-agents` → file + UI |
| Personas modal | **Gap** | |
| Spawn UI (type, isolation) | **Gap** | Optional; agent can spawn |

### 4.8 Memory

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| `/remember` quick note | **Gap** | Thin prompt + confirmation |
| Memory browser | **Gap** | On/off + list when enabled |
| Flush / dream | **Gap** | Agent-backed actions |

### 4.9 Media

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| `/imagine` | **Gap** | Run as agent command + gallery pane |
| `/imagine-video` | **Gap** | Same |
| Inline image display in chat | **Gap** | When content includes images |

### 4.10 Automation: loops, goals, workflows, research

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| `/loop` scheduler | **Gap** | Create/list/cancel jobs UI |
| `/goal` autonomous goals | **Gap** | Status, pause, resume, clear |
| `/workflow` launch/control | **Gap** | |
| `/workflows` run dashboard | **Gap** | |
| `/deep-research` | **Gap** | Launch + progress + report |

### 4.11 Account & auth

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| Detect local auth | **Done** | |
| Verify cached token | **Done** | `authenticate` |
| Login (browser OIDC) | **Gap** | Follow agent auth methods / open browser |
| Logout | **Gap** | ACP logout if advertised |
| Privacy / data settings | **Gap** | |

### 4.12 Configuration & theming

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| GUI theme dark/dim/light | **Done** | |
| Font size | **Done** | |
| Binary override | **Done** | |
| Full TUI theme packs | **N/A→Remap** | Map to desktop theme system |
| Project rules / AGENTS.md editor | **Gap** | Open/edit files; not reimplement engine |
| Sandbox profile UI | **Gap** | Surface config + status |
| Custom models UI | **Gap** | Edit config or models section |

### 4.13 Desktop packaging & quality

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| Linux packages | **Done** | deb / AppImage / rpm |
| macOS / Windows CI matrix | **Done** | Unsigned CI builds |
| Code signing / notarization | **Gap** | Release blockers for public distro |
| Integration tests vs live CLI | **Gap** | `GROK_GUI_INTEGRATION=1` |
| Unit tests (pure Rust) | **Partial** | Expand coverage |
| Architecture docs refresh | **Partial** | Some MVP notes outdated |

---

## 5. Implementation phases

Build in vertical slices that stay shippable. Each phase ends with: checklist update, manual smoke, tests where pure logic exists.

### Phase A — Session power tools (high daily value)

**Outcome:** compact, rewind, fork, richer history feel “first-class.”

| ID | Work item | Approach |
|----|-----------|----------|
| A1 | **Compact UI** | **Done** — status bar + `/compact [note]` → agent slash; refresh signals/context |
| A2 | **Rewind / undo** | **Done** — local scroll cut + agent `/rewind` (no ACP method on current CLI) |
| A3 | **Fork session** | **Done** — `/fork` → agent slash (ACP `session/fork` not exposed yet) |
| A4 | **History search panel** | **Done** — fuzzy modal via `/history` / status bar |
| A5 | **Copy Nth reply + path** | **Done** — `/copy [n] [path]` |
| A6 | **Auto-compact banners** | **Done** — `auto_compact_*` / `compaction_checkpoint` system lines |

**Exit criteria:** User can compact, rewind last turn, fork, and search prompt history without leaving GUI.

**Phase A status (2026-08-04):** Implemented. Note: current Grok CLI does not expose ACP RPCs for compact/rewind/fork; the GUI uses agent slash commands plus local scroll rewind. When native ACP methods appear, swap the host layer without changing UX.

---

### Phase B — Plan mode & elicitation (high quality for big tasks)

| ID | Work item | Approach |
|----|-----------|----------|
| B1 | **Enter plan mode** | Button + `/plan`; approve `enter_plan_mode` permission |
| B2 | **Plan file viewer/editor** | Load/save session `plan.md`; markdown preview |
| B3 | **Exit plan approval** | Modal for `exit_plan_mode` with approve / revise |
| B4 | **Elicitation forms** | ACP `elicitation/create` → dynamic form modal |
| B5 | **Mode cycle control** | Status bar: Ask · Auto · Plan · Yolo |

**Exit criteria:** Full plan-mode loop works end-to-end in the GUI.

---

### Phase C — Context, usage, scrollback power UX

| ID | Work item | Approach |
|----|-----------|----------|
| C1 | **Full context categories** | Probe agent for category data; else best-effort from signals + tool meta |
| C2 | **Account usage panel** | Agent `/usage` or API; charts for limits |
| C3 | **Syntax highlighting** | Shiki or highlight.js in markdown code fences |
| C4 | **Fold/expand** | Per-item + expand/collapse all tools/thoughts |
| C5 | **Compact density theme** | Tighter CSS spacing toggle |
| C6 | **Timestamps** | Optional per-message timestamps |
| C7 | **Turn jump** | Prev/next user turn shortcuts |
| C8 | **Jump / timeline** | Outline of turns for quick navigation |

**Exit criteria:** Power users can navigate long sessions like the TUI pager.

---

### Phase D — Extensions hub (MCP / skills / plugins / hooks)

| ID | Work item | Approach |
|----|-----------|----------|
| D1 | **Extensions modal** | Tabs: MCP · Skills · Plugins · Marketplace · Hooks (TUI parity) |
| D2 | **MCP enable/disable** | Safe TOML edit or agent config API; restart agent if required |
| D3 | **MCP server editor** | Add stdio/HTTP server form |
| D4 | **Skills browser** | Detail view, disable list, open path |
| D5 | **Plugins install/remove** | Shell out carefully or agent commands + trust prompts |
| D6 | **Marketplace browse** | Read marketplace-cache + install actions |
| D7 | **Hooks manager** | List/toggle; respect project trust |
| D8 | **Project trust UX** | Explicit trust for project hooks/config |

**Exit criteria:** Users rarely need to hand-edit `config.toml` for extensions.

---

### Phase E — Subagents, agents, personas

| ID | Work item | Approach |
|----|-----------|----------|
| E1 | **Subagent panel v2** | Status, type, open child session, cancel child |
| E2 | **Child session view** | Dedicated chat surface or dashboard peek |
| E3 | **Agents manager** | CRUD for `~/.grok/agents` / project agents |
| E4 | **Personas manager** | List bundled + custom; assign to subagents |
| E5 | **Isolation/worktree status** | Show when agent uses worktree isolation |

**Exit criteria:** Multi-agent work is visible and controllable from the GUI.

---

### Phase F — Automation & long-running work

| ID | Work item | Approach |
|----|-----------|----------|
| F1 | **Background tasks panel** | List task IDs, status, output tail, kill |
| F2 | **Terminal panel v2** | Interactive input if agent supports; multi-tab polish |
| F3 | **Scheduler /loop UI** | Create interval jobs; list; cancel |
| F4 | **Goals UI** | Create, status, pause, resume, clear |
| F5 | **Workflows dashboard** | List runs; pause/resume/stop; open result |
| F6 | **Deep research** | Launch + progress + final report card |
| F7 | **Notifications** | Desktop notify on task complete / goal complete |

**Exit criteria:** Long-running agent work is as manageable as in the TUI.

---

### Phase G — Memory & media

| ID | Work item | Approach |
|----|-----------|----------|
| G1 | **Remember note** | Modal → agent `/remember` |
| G2 | **Memory browser** | List/view when memory enabled |
| G3 | **Flush / dream actions** | Buttons with confirmation |
| G4 | **Imagine gallery** | Run `/imagine`; show images in chat |
| G5 | **Imagine video** | Same for video; player component |
| G6 | **Prompt image attach** | When `promptCapabilities.image` true |

**Exit criteria:** Memory and media workflows usable without TUI.

---

### Phase H — Auth, account, safety, sandbox

| ID | Work item | Approach |
|----|-----------|----------|
| H1 | **Login flow** | Open browser / device code from agent auth methods |
| H2 | **Logout** | ACP logout if available |
| H3 | **Privacy panel** | Surface retention / ZDR flags from auth meta |
| H4 | **Sandbox status** | Show profile; link to docs; config toggle |
| H5 | **Permission mode Auto** | Full three-way Ask / Auto / Always |
| H6 | **Doctor panel** | Run diagnostics; structured report |

**Exit criteria:** Onboarding and account management work fully in-app.

---

### Phase I — Desktop polish & release quality

| ID | Work item | Approach |
|----|-----------|----------|
| I1 | **Integration tests** | Spawn real `grok` when `GROK_GUI_INTEGRATION=1` |
| I2 | **Expand unit tests** | Models parse, session index, export, stream batch helpers |
| I3 | **macOS notarization** | Secrets + docs |
| I4 | **Windows code signing** | |
| I5 | **Auto-update (optional)** | Tauri updater |
| I6 | **Docs refresh** | architecture.md, user-facing help inside app (`/docs` → panel) |
| I7 | **Accessibility** | Focus traps, ARIA on modals, keyboard paths |
| I8 | **i18n (optional)** | Not required for v1 parity |

**Exit criteria:** Release-ready, testable, distributable builds.

---

## 6. Suggested build order (when we implement)

```
A Session power tools
    → B Plan mode & elicitation
    → C Context + scrollback power UX
    → D Extensions hub
    → E Subagents / agents / personas
    → F Automation & workflows
    → G Memory & media
    → H Auth / account / safety
    → I Release quality
```

Rationale: A–C unlock daily coding; D–E unlock team/power config; F–G unlock advanced agent products; H–I make it shippable to others.

---

## 7. Per-item implementation pattern

For each feature, use this template in PRs:

1. **Discovery** — Does ACP / `x.ai/*` / agent slash / disk file provide it?
2. **Host (Rust)** — New command? Event? Config read/write?
3. **UI (React)** — Panel / modal / status control
4. **Safety** — Permissions, trust, confirmations
5. **Fallback** — If capability missing, disable with reason
6. **Tests** — Pure parse/logic unit tests; optional integration
7. **Docs** — Update this plan + `acp-surface.md` checklist

---

## 8. Agent slash mapping strategy

| Kind | GUI strategy |
|------|----------------|
| Pure pager UX (`/find`, `/theme`, folds) | **Native GUI only** (already mostly) |
| Agent state change (`/compact`, `/model`, `/plan`) | **Native control** preferred; slash still works |
| Heavy subsystem (`/plugins`, `/memory`, `/workflows`) | **Dedicated panel** that may invoke agent + read disk |
| Rare / docs (`/tutorial`, `/release-notes`) | **Webview or markdown panel** from `~/.grok/docs` |
| Media (`/imagine`) | **Command + result gallery** |

Client-only commands stay in `CLIENT_COMMANDS`. Agent-advertised commands continue to appear in the palette automatically.

---

## 9. Risk register

| Risk | Mitigation |
|------|------------|
| `x.ai/*` APIs change | Capability discovery; version gate min CLI |
| TOML rewrite corrupts config | Write via backup + validate parse; prefer agent APIs |
| Plugin/hook install is a trust boundary | Explicit trust prompts; never auto-trust project hooks |
| Workflows/goals need long-lived UI | Background panel + notifications; don’t block chat |
| Full vim keybinding set is huge | Desktop defaults first; optional vim pack later |
| Image/video generation is product-gated | Feature-flag UI on capability / model support |

---

## 10. Definition of “full GUI parity”

We call the product **feature-complete for Grok Build** when:

1. Every workflow in sections 4.1–4.12 has status **Done** or an intentional **N/A→Remap** with a desktop equivalent.
2. A user who never opens the TUI can: plan, implement, compact, rewind, manage MCP/skills/plugins, run workflows/goals, use memory/media when enabled, manage auth, and monitor background work.
3. Integration tests cover connect → prompt → permission → cancel → resume on a real CLI.
4. Signed packages exist for the platforms we claim to support.

---

## 11. Tracking

| Doc | Role |
|-----|------|
| **This file** | Master parity plan & phases |
| [`acp-surface.md`](./acp-surface.md) | Shipped checklist (update as items land) |
| [`architecture.md`](./architecture.md) | Runtime design |
| [`packaging.md`](./packaging.md) | Build & release |

When implementing, mark phase items Done here and tick `acp-surface.md`.

---

## 12. Immediate next step

**Start Phase A (Session power tools)** in order:

1. A1 Compact UI  
2. A4 History search panel  
3. A6 Auto-compact banners  
4. A2 Rewind (if ACP method found; else stub + research)  
5. A3 Fork  

Say when to begin Phase A implementation.
