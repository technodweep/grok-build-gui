#!/usr/bin/env bash
# Build Grok Build GUI Linux packages (deb / AppImage / rpm via Tauri).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="${HOME}/.cargo/bin:${PATH}"

# Optional local prefix (user-space webkit headers) — same as dev setup.
if [[ -d "${HOME}/.local/tauri-deps/root" ]]; then
  ROOT_DEPS="${HOME}/.local/tauri-deps/root"
  LINKDIR="${HOME}/.local/tauri-deps/liblinks"
  export PKG_CONFIG_PATH="${ROOT_DEPS}/usr/lib/x86_64-linux-gnu/pkgconfig:${ROOT_DEPS}/usr/share/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
  export C_INCLUDE_PATH="${ROOT_DEPS}/usr/include${C_INCLUDE_PATH:+:$C_INCLUDE_PATH}"
  export CPLUS_INCLUDE_PATH="${ROOT_DEPS}/usr/include${CPLUS_INCLUDE_PATH:+:$CPLUS_INCLUDE_PATH}"
  if [[ -d "$LINKDIR" ]]; then
    export LIBRARY_PATH="${LINKDIR}:/usr/lib/x86_64-linux-gnu${LIBRARY_PATH:+:$LIBRARY_PATH}"
    export RUSTFLAGS="${RUSTFLAGS:-} -C link-arg=-L${LINKDIR} -C link-arg=-L/usr/lib/x86_64-linux-gnu"
  fi
fi

# Prefer Node 22 via fnm when available.
if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env)"
  fnm use 22 2>/dev/null || true
fi

echo "==> Frontend deps"
pnpm install --dir apps/desktop

echo "==> Tauri release build (Linux bundles)"
(
  cd apps/desktop
  pnpm tauri build --bundles deb,appimage,rpm
)

echo "==> Packages"
find target/release/bundle -type f \( -name '*.deb' -o -name '*.AppImage' -o -name '*.rpm' \) 2>/dev/null || true
echo "Done. Artifacts under target/release/bundle/"
