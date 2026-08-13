#!/usr/bin/env bash
# Run the same checks as GitHub Actions CI (locally).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="${HOME}/.cargo/bin:${PATH}"

if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env)"
  fnm use 22 2>/dev/null || true
fi

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

echo "==> Frontend typecheck"
pnpm install --dir apps/desktop
pnpm --dir apps/desktop exec tsc --noEmit

echo "==> Frontend unit tests"
pnpm --dir apps/desktop test

echo "==> Frontend build"
pnpm --dir apps/desktop build

echo "==> cargo fmt"
cargo fmt -p kayg -- --check

echo "==> cargo test"
cargo test -p kayg

if [[ "${KAYG_INTEGRATION:-}" == "1" || "${KAYG_INTEGRATION:-}" == "true" ]]; then
  echo "==> Live agent integration tests"
  cargo test -p kayg --test integration_agent -- --nocapture
else
  echo "==> Skipping live agent integration (set KAYG_INTEGRATION=1 to enable)"
fi

echo "==> cargo clippy"
cargo clippy -p kayg --all-targets -- -D warnings

echo "All local CI checks passed."
