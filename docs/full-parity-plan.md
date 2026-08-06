# Grok Build GUI — Full Feature Parity Plan

**Goal:** Make this desktop app a first-class **GUI for everything you can do with Grok Build**, without reimplementing the agent.

**Last updated:** 2026-08-05  
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
| Plans (live entries) | **Done** | Cards + sticky strip + plan.md viewer |
| Cancel / Stop turn | **Done** | `session/cancel` + local waiter unblock |
| Permission prompts | **Done** | Modal; allow once / always / deny |
| Yolo (always approve) | **Done** | Connect flag + settings |
| Auto permission mode | **Done** | `/auto` + status bar mode cycle |
| Prompt queue | **Done** | |
| Multiline composer | **Done** | |
| Prompt history ↑/↓ | **Partial** | No fuzzy `/history` panel |
| `@` file attach | **Done** | Fuzzy + small-file embed |
| Drag-drop files | **Done** | |
| Image / media chips in prompt | **Done** | Image picker + drag-drop; ACP image blocks when readable |
| Export conversation | **Done** | File + clipboard |
| Copy last reply | **Partial** | Last only; TUI supports Nth + path |
| Find in scrollback | **Partial** | Basic find; no jump/timeline |
| Virtualized scrollback | **Done** | |
| Stream batching | **Done** | |
| Markdown / code highlight | **Done** | GFM + fence highlighter |
| Fold / expand blocks | **Done** | Tools/thoughts + fold/expand all |
| Compact UI density | **Done** | `/compact-mode` + settings |
| Timestamps on messages | **Done** | `/timestamps` + settings |
| Raw markdown toggle | **Gap** | |
| Turn navigation (prev/next user turn) | **Done** | Alt+↑/↓ + timeline |

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
| Plan mode enter/exit | **Done** | `/plan`, permission UX for enter/exit_plan_mode |
| View / edit plan file | **Done** | `plan.md` viewer/editor + exit-plan approval modal |
| Ask-user questions (elicitation) | **Done** | ACP `elicitation/create` form + URL modals |
| Mode cycle (Normal / Plan / Yolo) | **Done** | Status bar: Ask · Auto · Plan · Yolo |
| Permission mode: auto | **Done** | Via mode cycle + `/auto` |

### 4.4 Context, usage, monitoring

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| Context window bar | **Done** | From signals + last tokens + categories |
| Full `/context` categories | **Done** | Best-effort from scrollback scaled to used |
| Session info panel | **Done** | Context panel |
| Live turn usage | **Done** | `turn_completed.usage` |
| Account `/usage` billing | **Partial** | Usage tab + agent `/usage` |
| Background tasks panel | **Done** | Automation hub + terminal kill/release |
| Workflows dashboard | **Done** | Launch/control + `/workflows` |
| Doctor / health | **Done** | `grok doctor --json` panel + `/doctor` |

### 4.5 Terminals

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| ACP terminal host | **Done** | create/output/wait/kill/release |
| Live terminal panel | **Partial** | Output yes; PTY input/interactive less |
| Terminal in tool cards | **Gap** | Embed terminalId content |
| Background command roster | **Done** | Automation Tasks tab + terminal panel |

### 4.6 Extensions: MCP, skills, plugins, hooks

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| Config overview (read-only) | **Done** | Settings → Grok config |
| Open config.toml | **Done** | |
| MCP list / enable-disable UI | **Done** | Extensions hub + TOML edit |
| MCP detail / tools list | **Partial** | Transport/command; live tools later |
| Skills browser | **Done** | Detail + disable + open path |
| Plugins install/uninstall | **Done** | CLI + trust confirm |
| Marketplace browser | **Done** | marketplace-cache catalog |
| Hooks manager | **Done** | List/toggle + trust gate |
| Project trust UX | **Done** | trusted_folders.toml |

### 4.7 Agents, personas, subagents

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| Live subagent strip | **Done** | Open/stop, isolation badges, poll |
| Subagent detail / attach | **Done** | Switch to child when on roster |
| Config agents modal | **Done** | `/agents` CRUD for user agents |
| Personas modal | **Done** | `/personas` list + edit user personas |
| Spawn UI (type, isolation) | **Partial** | Agent spawns; GUI shows isolation |

### 4.8 Memory

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| `/remember` quick note | **Done** | Modal + `/remember` client slash |
| Memory browser | **Done** | Disk list under `~/.grok/memory` + preview |
| Flush / dream | **Done** | Confirmed buttons → agent slash |

### 4.9 Media

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| `/imagine` | **Done** | Media modal + client slash + gallery |
| `/imagine-video` | **Done** | Same; video player component |
| Inline image display in chat | **Done** | Markdown img + bare path harvest |

### 4.10 Automation: loops, goals, workflows, research

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| `/loop` scheduler | **Done** | Automation Loops tab + client slash |
| `/goal` autonomous goals | **Done** | Automation Goals tab + client slash |
| `/workflow` launch/control | **Gap** | |
| `/workflows` run dashboard | **Gap** | |
| `/deep-research` | **Gap** | Launch + progress + report |

### 4.11 Account & auth

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| Detect local auth | **Done** | |
| Verify cached token | **Done** | `authenticate` |
| Login (browser OIDC) | **Done** | `grok login` OAuth + device code from GUI |
| Logout | **Done** | `grok logout` + env refresh |
| Privacy / data settings | **Done** | Auth meta + telemetry + agent `/privacy` |

### 4.12 Configuration & theming

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| GUI theme dark/dim/light | **Done** | |
| Font size | **Done** | |
| Binary override | **Done** | |
| Full TUI theme packs | **N/A→Remap** | Map to desktop theme system |
| Project rules / AGENTS.md editor | **Gap** | Open/edit files; not reimplement engine |
| Sandbox profile UI | **Done** | Account hub · Sandbox tab |
| Custom models UI | **Gap** | Edit config or models section |

### 4.13 Desktop packaging & quality

| Feature | Status | Notes / approach |
|---------|--------|------------------|
| Linux packages | **Done** | deb / AppImage / rpm |
| macOS / Windows CI matrix | **Done** | Unsigned CI builds |
| Code signing / notarization | **Done** | Docs + optional CI secrets (unsigned by default) |
| Integration tests vs live CLI | **Done** | `GROK_GUI_INTEGRATION=1` + unit tests |
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

**Phase B status (2026-08-05):** Implemented.
- `/plan` / `/view-plan` / `/auto` / `/always-approve` client commands
- Status bar mode chip cycles Ask · Auto · Plan · Yolo (agent slash)
- Plan.md viewer/editor (`get_session_plan` / `save_session_plan`)
- Exit-plan permission modal with plan preview + approve / request changes / quit
- Enter-plan permission chrome
- ACP `elicitation/create` form + URL consent modal; client advertises form+url capabilities
- Sticky plan strip opens plan viewer on click

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

**Phase C status (2026-08-05):** Implemented.
- Context panel category bars (scrollback estimate scaled to `signals.json` used tokens)
- Usage tab: account auth, session/last-turn stats, **Run agent /usage**
- Zero-dep code fence highlighting (JS/TS/Python/Rust/Go/shell/…)
- Fold/expand all tools & thinking (`/fold`, `/expand`, chat toolbar)
- Compact density (`/compact-mode`, settings, `data-density`)
- Optional timestamps (`/timestamps`, settings)
- Turn jump Alt+↑/↓ + toolbar; Timeline panel (`/timeline`, Ctrl+G)

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

**Phase D status (2026-08-05):** Implemented.
- Extensions modal (status bar + `/plugins` / `/mcp` / `/skills` / `/hooks` / `/marketplace`)
- MCP enable/disable/add/remove via `toml_edit` on `~/.grok/config.toml`
- Skills browser + disable list write to `[skills].disabled`
- Plugins: `grok plugin list/install/uninstall/enable/disable` with trust confirm
- Marketplace: browse `~/.grok/marketplace-cache/**/marketplace.json` + install
- Hooks: list user/project JSON; enable via rename `.disabled.json`
- Project trust: read/write `~/.grok/trusted_folders.toml`

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

**Phase E status (2026-08-05):** Implemented.
- Subagents strip: open child (switch session), stop child, isolation/persona badges, poll disk meta
- Live tool stream merges isolation/worktree/childSessionId when present
- Agents modal: Agents · Personas · Live tabs (`/agents`, `/personas`, `/subagents`)
- Discover bundled + user + project agent `.md` and persona `.toml` (+ config.toml personas)
- Save/delete user agents (`~/.grok/agents`) and personas (`~/.grok/personas`); fork readonly copies
- Isolation shown as worktree badge + path when available

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

**Phase F status (2026-08-05):** Implemented.
- Automation hub (`/tasks`, status bar **Tasks**): terminals kill/release + output tail
- Terminal panel: Copy / Kill / Release; note on no ACP stdin
- Loops / Goals / Workflows / Research tabs → agent slash + local job tracking
- Client slash: `/loop`, `/goal`, `/workflow`, `/workflows`, `/deep-research`
- Desktop notify + system banner when terminal transitions running → finished

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

**Phase G status (2026-08-05):** Implemented.
- Memory & media hub (`/memory`, status bar **Memory**): remember, browse, flush/dream, imagine
- Disk browser for `~/.grok/memory` (global / workspace / sessions) + session log delete
- Config toggle `[memory].enabled` + session `/memory on|off`
- Client slash: `/remember`, `/flush`, `/dream`, `/imagine`, `/imagine-video`, `/memory`
- Inline media in chat (markdown images + bare paths); tool image blocks
- Prompt image attach (picker + ACP `type: image` base64 blocks); gallery of chat/disk media

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

**Phase H status (2026-08-05):** Implemented.
- Account & safety hub (`/account`, status bar **Account**): login, logout, verify, privacy, sandbox, doctor, permissions
- Login: `grok login --oauth` / `--device-auth` (blocking, status + URLs/codes surfaced)
- Logout: `grok logout`; privacy from auth.json (retention opt-out, ZDR if present) + telemetry config toggle + agent `/privacy`
- Sandbox: effective profile (env/config), save `[sandbox].profile`, notes on reconnect
- Permission three-way Ask/Auto/Always (Welcome + Account Safety tab; status bar cycle + right-click)
- Doctor: `grok doctor --json` structured findings panel
- Client slash: `/login`, `/logout`, `/privacy`, `/sandbox`, `/doctor`, `/account`

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

**Phase I status (2026-08-05):** Implemented (I8 skipped for v1).
- Integration: `tests/integration_agent.rs` gated by `GROK_GUI_INTEGRATION=1`
- Unit: Rust models/session + vitest for export, text, mediaPaths, toolContent, streamBatch, contextEstimate
- Signing: packaging.md secrets tables; release.yml optional Apple/Windows sign+notarize when secrets present
- Auto-update: documented path only (not enabled)
- Help panel: `/docs` · `/help` · status bar **Help**; architecture.md refresh
- A11y: `modalA11y` focus trap + Esc + ARIA; ModalShell; Settings/Account/Help wired
- CI: frontend `pnpm test`; `ci-local.sh` runs unit + optional integration

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
