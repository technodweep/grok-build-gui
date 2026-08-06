# ACP surface checklist

Track **shipped** surface area. For the full “everything Grok Build can do” roadmap (gaps + phases), see **[full-parity-plan.md](./full-parity-plan.md)**.

Update this checklist as features land.

## Core (PR2)

- [x] Spawn `grok agent stdio`
- [x] `initialize` + client capabilities (`fs` read/write, `terminal`)
- [x] `session/new`
- [x] `session/prompt`
- [x] `session/cancel` notification
- [x] Stream `session/update` → UI
  - [x] `agent_message_chunk`
  - [x] `agent_thought_chunk`
  - [x] `tool_call` / `tool_call_update` (basic)
- [x] `fs/read_text_file` / `fs/write_text_file` (basic, no path policy yet)
- [x] Interactive `session/request_permission`

## Permissions & tools (PR3)

- [x] Permission modal (allow once / always / deny)
- [x] Diff-ish rendering for tool output / edit tools
- [x] Plan / TODO (`plan` updates)
- [x] Path sandbox for client FS handlers

## Sessions (PR4)

- [x] Disk index of `~/.grok/sessions/**/summary.json`
- [x] Resume / load session (`session/load` + history hydrate from `updates.jsonl`)
- [x] New / home / delete / rename
- [x] Persist last project cwd (`~/.grok/gui/settings.json`)

## Composer (PR5)

- [x] Slash command palette (agent-advertised + client `/new` `/home` `/clear` `/cancel` `/export`)
- [x] `@` file fuzzy picker + path attachments
- [x] Prompt queue while a turn is running
- [x] Small-file content embedded as ACP resource blocks

## Dashboard (PR6)

- [x] Multi-session roster on one agent process
- [x] Dispatch / open / pin / rename / stop / close / delete
- [x] Per-session scrollback when switching
- [x] `/dashboard` client command + status bar entry
- [x] Subagent strip (disk `subagents/` + live tool-call detection)
- [x] Desktop notifications on permission prompts

## Polish (PR7)

- [x] Themes (dark / dim / light) + font size
- [x] Shortcuts cheatsheet (`?` / Ctrl+/ / `/shortcuts`)
- [x] Settings panel (theme, yolo default, binary override)
- [x] Status indicators (model id, last totalTokens)
- [x] Embedded terminal ACP methods (`terminal/create|output|wait_for_exit|kill|release`)
- [x] Terminal panel UI (`/terminal`, status bar toggle, live `terminal://update`)
- [x] Context / session-info panel from `signals.json` (`/context`, `/status`)
- [x] Model & reasoning effort (`session/set_model`, `session/set_mode`, `/model`, `/effort`, status bar picker)
- [x] `/copy` last agent reply
- [x] Reconnect banner (keep scrollback on agent crash; Resume / New session)
- [x] Colored unified-diff tool output
- [x] Drag-and-drop file attachments on composer
- [x] Client `/rename` `/title` `/delete` for active session
- [x] Prompt history recall (`↑`/`↓` on empty input, `/history`)
- [x] Export conversation to file (`/export` save dialog; `/export clipboard`)
- [x] Desktop notification when agent disconnects mid-session
- [x] Stream update batching (rAF) + virtualized scrollback
- [x] ACP `session/list` merged with disk session browser
- [x] Live turn usage from `turn_completed` (+ context panel)
- [x] Richer tool cards (ACP `content` diff blocks)
- [x] Auth verify (`authenticate` cached_token) + email display on welcome
- [x] Settings → Grok config overview (MCP servers, skills, marketplace, open config.toml)
- [x] Scrollback find (`Ctrl+F` / `/find`)
- [x] Multiline composer mode (`/multiline`, settings)
- [x] Sticky plan progress strip
- [x] Unit tests: fs_policy, grok_config parse, ACP protocol helpers
- [x] Phase A: `/compact`, `/rewind`/`/undo`, `/fork` (agent slash + local rewind)
- [x] Phase A: history search panel (`/history`)
- [x] Phase A: `/copy [n] [path]`
- [x] Phase A: auto-compact system banners
- [x] Phase B: `/plan`, `/view-plan`, plan.md viewer/editor
- [x] Phase B: enter/exit plan mode permission UX
- [x] Phase B: ACP `elicitation/create` form + URL modals (+ initialize capabilities)
- [x] Phase B: status bar mode cycle Ask · Auto · Plan · Yolo
- [x] Phase B: `/auto`, `/always-approve` client commands
- [x] Phase C: context categories + usage tab (`/context`, `/usage`)
- [x] Phase C: syntax highlight in agent markdown fences
- [x] Phase C: fold/expand tools & thinking
- [x] Phase C: compact density + timestamps settings
- [x] Phase C: turn jump (Alt+↑/↓) + timeline outline
- [x] Phase D: Extensions hub (MCP / skills / plugins / marketplace / hooks / trust)
- [x] Phase D: Safe config.toml MCP & skills edits (`toml_edit`)
- [x] Phase D: `grok plugin` install/uninstall/enable with trust prompts
- [x] Phase D: Folder trust store UI (`trusted_folders.toml`)
- [x] Phase E: Subagent panel open/stop + isolation badges
- [x] Phase E: Agents & personas manager (`/agents`, `/personas`)
- [x] Phase E: User agent/persona save-delete under `~/.grok`
- [x] Phase F: Automation hub (tasks/loops/goals/workflows/research)
- [x] Phase F: `kill_terminal` / `release_terminal` host commands
- [x] Phase F: Terminal complete desktop notifications
- [x] Phase G: Memory browser (`~/.grok/memory`) + remember / flush / dream
- [x] Phase G: Config `[memory].enabled` toggle + session `/memory on|off`
- [x] Phase G: Imagine gallery + `/imagine` / `/imagine-video`
- [x] Phase G: Inline media in chat + prompt image attach (ACP image blocks)

## Packaging (PR8)

- [x] Tauri bundle targets: deb, AppImage, rpm (+ macOS app/dmg, Windows nsis/msi)
- [x] CI: frontend typecheck/build + cargo test/clippy/fmt
- [x] Release workflow on `v*` tags (Linux + macOS + Windows matrix)
- [x] Local scripts: `scripts/ci-local.sh`, `scripts/build-linux.sh`
- [x] Docs: `docs/packaging.md`, min Grok CLI ≥ 0.2.x
- [x] macOS / Windows bundle config + CI jobs
