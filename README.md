# KayG

<img src="assets/branding/kayg-logo.svg" alt="KayG logo" width="160" />

[A Technodweep company](https://www.technodweep.com/)

KayG is an independent, open-source desktop GUI from [Technodweep](https://www.technodweep.com/), compatible with the [Grok Build CLI](https://docs.x.ai/build/overview). If you are looking for a Grok desktop experience on Linux, macOS, or Windows, KayG provides a native **Tauri 2** client that connects to `grok agent stdio` over the [Agent Client Protocol (ACP)](https://agentclientprotocol.com).

The CLI agent remains the brain (auth, tools, MCP, sessions). This app is the visual shell.

> [!IMPORTANT]
> KayG is an independent community project. It is not affiliated with, endorsed by, or sponsored by xAI. Grok and Grok Build are trademarks of xAI.

## Features

- Chat with streaming replies, thinking, tool cards, plans, and elicitation
- Permissions (Ask / Auto / Always), plan mode, compact / rewind / fork
- Sessions: resume / rename / delete; multi-agent dashboard
- Composer: `/` commands, `@` files, image attach, queue, fuzzy history
- Hubs: Extensions (MCP/skills/plugins), Agents, Tasks, Memory, Account, Rules
- Agent terminals (live panel + tool-card embed), workflows / loops / goals
- Memory (`/remember`, browse, flush/dream) and media (`/imagine` gallery)
- Project AGENTS.md editor + custom model endpoints in `config.toml`
- Context & usage, find-in-scrollback, raw markdown, themes
- Login / logout / doctor / sandbox profile without the TUI

Docs:

- **[Changelog](CHANGELOG.md)** — v0.1.0 notes
- **[Full feature parity plan](docs/full-parity-plan.md)** — phases A–I inventory
- **[Multi-repository workspaces plan](docs/multi-repo-workspaces-plan.md)** — optional workspace dashboard, UI wireframes, runtime architecture, and delivery phases
- [Architecture](docs/architecture.md)
- [Shipped ACP surface checklist](docs/acp-surface.md)
- [Packaging](docs/packaging.md)

## Requirements

### Runtime

- **Grok CLI ≥ 0.2.x** on `PATH` (or `~/.grok/bin/grok`)
- Authenticated (`grok` once in a terminal, or `XAI_API_KEY`)

```bash
curl -fsSL https://x.ai/cli/install.sh | bash
grok --version
```

### Build (Linux)

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
  patchelf libayatana-appindicator3-dev build-essential \
  curl wget file libssl-dev libxdo-dev pkg-config
```

### Toolchain

- Rust stable (`rustup`)
- Node.js **≥ 22**
- `pnpm`

## Develop

```bash
pnpm install --dir apps/desktop
pnpm dev          # uses ./scripts/dev.sh (sets GTK/WebKit env if needed)
```

If `pnpm dev` fails with `gdk-3.0 was not found` / `pkg-config`, install Tauri Linux deps:

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
  patchelf libayatana-appindicator3-dev build-essential \
  libssl-dev libxdo-dev pkg-config
```

Or run with the helper (uses `~/.local/tauri-deps` when system `-dev` packages are missing):

```bash
./scripts/dev.sh
```

**WebKit blank window (Linux):** the app sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` by default. Prefer `127.0.0.1` for the Vite dev URL (already configured).

### Local CI

```bash
./scripts/ci-local.sh
# or
pnpm ci
```

## Package

```bash
# Linux (from repo root)
./scripts/build-linux.sh
# artifacts: target/release/bundle/{deb,appimage,rpm}/

# macOS
cd apps/desktop && pnpm tauri build --bundles app,dmg

# Windows
cd apps/desktop && pnpm tauri build --bundles nsis,msi
```

Full packaging notes: [docs/packaging.md](docs/packaging.md).

Release tags `v*` trigger GitHub Actions to build **Linux + macOS + Windows** packages and publish a Release.

## Layout

```
apps/desktop/          Tauri app (React UI + src-tauri)
docs/                  Architecture, ACP checklist, packaging
scripts/               Local CI + Linux build helpers
.github/workflows/     CI + release
```

## Configuration

| Env | Meaning |
|-----|---------|
| `GROK_HOME` | Override Grok config/session root (default `~/.grok`) |
| `GROK_BINARY` | Path to `grok` binary |
| `XAI_API_KEY` | API key auth (optional if browser auth exists) |
| `RUST_LOG` | Tracing filter (e.g. `info,kayg_lib=debug`) |

GUI settings (theme, binary override, last project) live in `~/.grok/gui/settings.json`.

## Safety

- Default permission mode is **ask** (no `--always-approve` unless you enable yolo).
- Client FS handlers are sandboxed to the session project directory.
- Settings → “Always approve tools” opts into yolo for new/resume connections.

## License

MIT — see [LICENSE](LICENSE).
