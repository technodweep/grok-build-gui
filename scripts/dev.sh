#!/usr/bin/env bash
# Launch Grok Build GUI in dev mode with GTK/WebKit build env for this machine.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="${HOME}/.cargo/bin:${HOME}/.grok/bin:${PATH}"

# Prefer Node ≥ 22 via fnm (official builds). Avoids broken Homebrew Node 19
# that expects libicui18n.so.71 after ICU upgrades.
for FNM_CAND in \
  "${HOME}/.local/share/fnm/fnm" \
  "${HOME}/.fnm/fnm" \
  "${HOME}/snap/code/253/.local/share/fnm/fnm"
do
  if [[ -x "$FNM_CAND" ]]; then
    export PATH="$(dirname "$FNM_CAND"):${PATH}"
    break
  fi
done
if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env)"
  fnm use 22 2>/dev/null || fnm use --install-if-missing 22 2>/dev/null || true
fi

# If still on Homebrew Node linked against an old ICU, put that ICU on the path.
if command -v node >/dev/null 2>&1; then
  if ! node -e "process.exit(0)" 2>/dev/null; then
    for ICU_LIB in \
      "${HOMEBREW_PREFIX:-/home/linuxbrew/.linuxbrew}/Cellar/icu4c/"*/lib \
      /home/linuxbrew/.linuxbrew/Cellar/icu4c/71.1/lib
    do
      if [[ -e "${ICU_LIB}/libicui18n.so.71" ]]; then
        export LD_LIBRARY_PATH="${ICU_LIB}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
        break
      fi
    done
  fi
fi

if ! command -v node >/dev/null 2>&1 || ! node -e "process.exit(0)" 2>/dev/null; then
  cat <<'EOF' >&2
ERROR: Node.js is missing or cannot start (often: libicui18n.so.71 not found).

Your PATH may be using an old Homebrew Node that needs ICU 71.

Fix (recommended) — install Node 22 with fnm:

  curl -fsSL https://fnm.vercel.app/install | bash
  # restart shell or:  eval "$(fnm env)"
  fnm install 22
  fnm use 22
  fnm default 22
  node -v   # should be v22.x

Or upgrade Homebrew Node:

  brew upgrade node

Then re-run:  pnpm dev
EOF
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [[ "${NODE_MAJOR}" -lt 22 ]]; then
  cat <<EOF >&2
ERROR: Node.js ${NODE_MAJOR} is too old (need ≥ 22). Current: $(node -v 2>/dev/null)

  fnm install 22 && fnm use 22 && fnm default 22
  # or: brew upgrade node

EOF
  exit 1
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
