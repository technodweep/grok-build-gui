#!/usr/bin/env bash
# Launch Grok Build GUI in dev mode with GTK/WebKit build env for this machine.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="${HOME}/.cargo/bin:${HOME}/.grok/bin:${PATH}"

# Node 22 via fnm (optional)
if [[ -x "${HOME}/snap/code/253/.local/share/fnm/fnm" ]]; then
  export PATH="${HOME}/snap/code/253/.local/share/fnm:${PATH}"
fi
if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env)"
  fnm use 22 2>/dev/null || true
fi

# Prefer system pkg-config when -dev packages are installed.
if pkg-config --exists webkit2gtk-4.1 gtk+-3.0 2>/dev/null; then
  echo "Using system WebKit/GTK (pkg-config)"
else
  # Fallback: user-local headers extracted under ~/.local/tauri-deps
  DEPS="${HOME}/.local/tauri-deps"
  if [[ ! -d "${DEPS}/root/usr/lib/x86_64-linux-gnu/pkgconfig" ]]; then
    cat <<'EOF' >&2
ERROR: GTK/WebKit development libraries not found.

Install system packages (recommended):

  sudo apt update
  sudo apt install -y \
    libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
    patchelf libayatana-appindicator3-dev build-essential \
    libssl-dev libxdo-dev pkg-config

Then run:  pnpm dev
  or:      ./scripts/dev.sh

EOF
    exit 1
  fi

  echo "Using local deps at ${DEPS}"
  export PKG_CONFIG_PATH="${DEPS}/root/usr/lib/x86_64-linux-gnu/pkgconfig:${DEPS}/root/usr/share/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
  export C_INCLUDE_PATH="${DEPS}/root/usr/include${C_INCLUDE_PATH:+:$C_INCLUDE_PATH}"
  export CPLUS_INCLUDE_PATH="${DEPS}/root/usr/include${CPLUS_INCLUDE_PATH:+:$CPLUS_INCLUDE_PATH}"
  LINKDIR="${DEPS}/liblinks"
  if [[ -d "$LINKDIR" ]]; then
    export LIBRARY_PATH="${LINKDIR}:/usr/lib/x86_64-linux-gnu:/lib/x86_64-linux-gnu${LIBRARY_PATH:+:$LIBRARY_PATH}"
    export RUSTFLAGS="${RUSTFLAGS:-} -C link-arg=-L${LINKDIR} -C link-arg=-L/usr/lib/x86_64-linux-gnu"
  else
    export LIBRARY_PATH="/usr/lib/x86_64-linux-gnu:/lib/x86_64-linux-gnu${LIBRARY_PATH:+:$LIBRARY_PATH}"
  fi
fi

export DISPLAY="${DISPLAY:-:0}"
export WEBKIT_DISABLE_DMABUF_RENDERER="${WEBKIT_DISABLE_DMABUF_RENDERER:-1}"
export WEBKIT_DISABLE_COMPOSITING_MODE="${WEBKIT_DISABLE_COMPOSITING_MODE:-1}"
export LD_LIBRARY_PATH="/usr/lib/x86_64-linux-gnu:/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

if [[ ! -d apps/desktop/node_modules ]]; then
  echo "Installing frontend deps…"
  pnpm install --dir apps/desktop
fi

echo "Starting tauri dev…"
exec pnpm --dir apps/desktop tauri dev
