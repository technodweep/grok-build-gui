# Packaging & release

KayG is packaged with **Tauri 2** bundlers.

## Version alignment

| Component | Version source |
|-----------|----------------|
| App | `apps/desktop/src-tauri/tauri.conf.json` → `version` |
| Cargo crate | `apps/desktop/src-tauri/Cargo.toml` → `version` |
| npm package | `apps/desktop/package.json` → `version` |

Keep these three in sync when cutting a release (currently **0.1.0**).

### Minimum Grok CLI

This GUI is developed against **Grok CLI ≥ 0.2.x** (ACP `stdio` + `session/load` + terminal host).  
Older CLI builds may lack extension methods or load-session support.

```bash
grok --version   # expect 0.2.x or newer
```

The app does **not** bundle the CLI — users install Grok separately:

```bash
curl -fsSL https://x.ai/cli/install.sh | bash
```

## Bundle targets

`tauri.conf.json` sets `bundle.targets` to `"all"`. CI selects platform-appropriate subsets:

| Platform | Bundles | CI runner |
|----------|---------|-----------|
| Linux | `deb`, `appimage`, `rpm` | `ubuntu-24.04` |
| macOS | `app`, `dmg` | `macos-14` |
| Windows | `nsis`, `msi` | `windows-latest` |

## Local Linux packages

### System packages

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
  patchelf libayatana-appindicator3-dev build-essential \
  libssl-dev libxdo-dev pkg-config rpm file
```

### Build

```bash
# from repo root
./scripts/build-linux.sh
```

Or:

```bash
cd apps/desktop
pnpm install
pnpm tauri build --bundles deb,appimage,rpm
```

Artifacts:

```
target/release/bundle/deb/*.deb
target/release/bundle/appimage/*.AppImage
target/release/bundle/rpm/*.rpm
```

### Install (deb)

```bash
sudo dpkg -i target/release/bundle/deb/*.deb
# if deps missing:
sudo apt-get install -f
```

### Run AppImage

```bash
chmod +x target/release/bundle/appimage/*.AppImage
./target/release/bundle/appimage/*.AppImage
```

## Local macOS packages

### Requirements

- macOS 11+ (Big Sur or later; CI uses macOS 14)
- Xcode Command Line Tools: `xcode-select --install`
- Rust stable + Node ≥ 22 + pnpm

### Build

```bash
cd apps/desktop
pnpm install
pnpm tauri build --bundles app,dmg
```

Artifacts:

```
target/release/bundle/macos/*.app
target/release/bundle/dmg/*.dmg
```

### Signing & notarization (macOS)

Unsigned builds run on the same machine and are often **Gatekeeper-blocked** on other Macs.
CI produces unsigned `.app` / `.dmg` for testing; use the secrets below for distribution.

#### Prerequisites

1. Apple Developer Program membership  
2. **Developer ID Application** certificate in Keychain (export as `.p12`)  
3. App-specific password or API key for Notary  
4. Optional: Developer ID Installer cert if you ship a signed pkg  

#### Local sign + notarize

```bash
# Identity from Keychain Access → "Developer ID Application: Your Name (TEAMID)"
export APPLE_SIGNING_IDENTITY="Developer ID Application: …"

cd apps/desktop
pnpm tauri build --bundles app,dmg

# Notarize the dmg (Apple account)
xcrun notarytool submit target/release/bundle/dmg/*.dmg \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --wait

xcrun stapler staple target/release/bundle/dmg/*.dmg
```

#### GitHub Actions secrets (optional)

When present, the release workflow signs and notarizes macOS artifacts:

| Secret | Purpose |
|--------|---------|
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` Developer ID Application cert |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the `.p12` |
| `APPLE_SIGNING_IDENTITY` | Full identity string (e.g. `Developer ID Application: … (TEAMID)`) |
| `APPLE_ID` | Apple ID email for notarytool |
| `APPLE_TEAM_ID` | 10-character Team ID |
| `APPLE_APP_SPECIFIC_PASSWORD` | [app-specific password](https://appleid.apple.com) for notarytool |
| `APPLE_API_KEY` / `APPLE_API_ISSUER` / `APPLE_API_KEY_PATH` | Alternative API-key notary auth |

Without these secrets, release.yml still uploads **unsigned** macOS packages.

## Local Windows packages

### Requirements

- Windows 10/11
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with “Desktop development with C++”
- WebView2 (preinstalled on modern Windows; otherwise [Evergreen Bootstrapper](https://developer.microsoft.com/microsoft-edge/webview2/))
- Rust stable + Node ≥ 22 + pnpm

### Build

```bash
cd apps/desktop
pnpm install
pnpm tauri build --bundles nsis,msi
```

Artifacts:

```
target/release/bundle/nsis/*.exe
target/release/bundle/msi/*.msi
```

NSIS installer is configured for **per-user** install (`installMode: currentUser`) so elevation is not required.

### Code signing (Windows)

Unsigned installers work for side-loading but SmartScreen will warn users.

#### Prerequisites

1. An Authenticode code-signing certificate (EV recommended for reputation; standard OV works)  
2. Certificate as `.pfx` (or hardware token with appropriate tooling)  

#### Local sign (signtool)

```bash
# After pnpm tauri build --bundles nsis,msi
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 \
  /f cert.pfx /p "%WINDOWS_CERTIFICATE_PASSWORD%" \
  target\release\bundle\nsis\*.exe

signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 \
  /f cert.pfx /p "%WINDOWS_CERTIFICATE_PASSWORD%" \
  target\release\bundle\msi\*.msi
```

#### GitHub Actions secrets (optional)

| Secret | Purpose |
|--------|---------|
| `WINDOWS_CERTIFICATE` | Base64-encoded `.pfx` |
| `WINDOWS_CERTIFICATE_PASSWORD` | PFX password |
| `WINDOWS_CERTIFICATE_SHA1` | Optional thumbprint when using store-based sign |

When secrets are absent, release.yml uploads unsigned NSIS/MSI artifacts.

Tauri also supports `tauri.conf.json` → `bundle.windows.certificateThumbprint` and related fields when signing on a machine with the cert installed in the store.

## Auto-update (optional, not enabled by default)

Tauri 2 updater is **not** wired in v1 (no public update endpoint yet). To add later:

1. Add `tauri-plugin-updater` dependency and init in `lib.rs`  
2. Configure `plugins.updater` endpoints + pubkey in `tauri.conf.json`  
3. Sign update artifacts with `tauri signer generate` / `TAURI_SIGNING_PRIVATE_KEY`  
4. Host `latest.json` + platform bundles on a CDN  

See [Tauri updater](https://v2.tauri.app/plugin/updater/). Until then, users download releases from GitHub.

## CI

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `.github/workflows/ci.yml` | push / PR to main | typecheck, test, clippy, Linux release-mode smoke |
| `.github/workflows/release.yml` | tag `v*` | Linux + macOS + Windows packages → GitHub Release |

### Local CI mirror

```bash
./scripts/ci-local.sh
```

### Unit & integration tests

```bash
# Rust unit tests (always)
cargo test -p kayg

# Frontend pure-helper tests (vitest)
pnpm --dir apps/desktop test

# Live agent integration (spawns real `grok agent stdio`)
KAYG_INTEGRATION=1 cargo test -p kayg --test integration_agent -- --nocapture
```

## Tagging a release

```bash
# bump version in tauri.conf.json, Cargo.toml, package.json
git commit -am "chore: release v0.1.0"
git tag v0.1.0
git push origin main --tags
```

GitHub Actions builds packages on all three platforms and attaches them to the release.

## Runtime notes

- The Grok CLI must still be installed and on `PATH` (or configured via Settings → binary override / `GROK_BINARY`).
- Linux AppImage / deb declare WebKitGTK 4.1 + GTK 3 runtime deps.
- Windows relies on system WebView2.
- macOS uses the system WebKit (WKWebView).
