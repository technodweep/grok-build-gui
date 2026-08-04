# Grok Build GUI

Native desktop GUI for [Grok Build](https://x.ai) — a **Tauri 2** app that spawns `grok agent stdio` and speaks the [Agent Client Protocol (ACP)](https://agentclientprotocol.com).

The CLI agent remains the brain (auth, tools, MCP, sessions). This app is the visual shell.

## Features

- Chat with streaming replies, thinking, tool cards, and plans
- Interactive permission prompts (or yolo mode)
- Session browser: resume / rename / delete from `~/.grok/sessions`
- Composer: `/` commands, `@` file attach, prompt queue
- Multi-agent dashboard: dispatch, pin, switch, stop
- Agent terminal host (ACP `terminal/*`) with live output panel
- Model & reasoning-effort picker (`session/set_model` / `session/set_mode`)
- Reconnect after agent crash (resume or new session; scrollback kept)
- Colored diffs, drag-and-drop file attach, `/rename` / `/delete`
- Prompt history (↑/↓), export to file, disconnect notifications
- Themes (dark / dim / light), settings, shortcuts cheatsheet

See [docs/architecture.md](docs/architecture.md) and [docs/acp-surface.md](docs/acp-surface.md) for the full surface map.

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
| `RUST_LOG` | Tracing filter (e.g. `info,grok_build_gui_lib=debug`) |

GUI settings (theme, binary override, last project) live in `~/.grok/gui/settings.json`.

## Safety

- Default permission mode is **ask** (no `--always-approve` unless you enable yolo).
- Client FS handlers are sandboxed to the session project directory.
- Settings → “Always approve tools” opts into yolo for new/resume connections.

## License

MIT — see [LICENSE](LICENSE).
