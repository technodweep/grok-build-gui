# Packaging & release

Grok Build GUI is packaged with **Tauri 2** bundlers.

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

### Signing & notarization (optional)

Unsigned builds run on the same machine and can be Gatekeeper-blocked on other Macs.
For distribution outside your own machine:

1. Enroll in the Apple Developer Program
2. Create a **Developer ID Application** certificate
3. Set Tauri signing env vars / `tauri.conf.json` `bundle.macOS` signing fields
4. Notarize with `xcrun notarytool` (or Tauri’s updater signing flow)

CI currently produces **unsigned** macOS artifacts suitable for testing and GitHub Releases.

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

## CI

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `.github/workflows/ci.yml` | push / PR to main | typecheck, test, clippy, Linux release-mode smoke |
| `.github/workflows/release.yml` | tag `v*` | Linux + macOS + Windows packages → GitHub Release |

### Local CI mirror

```bash
./scripts/ci-local.sh
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
