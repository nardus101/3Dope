# 3Dope V1 macOS Installer Plan

## Recommendation

Use Tauri 2 for the V1 Mac installer.

Why:
- Smaller app bundle than Electron.
- Native-feeling macOS shell with lower idle memory.
- Good fit for a WebGL/WebGPU-ready React viewer.
- Apple Silicon distribution can target arm64 first, with universal builds later.

Avoid Electron for V1 unless the app needs Node APIs inside the renderer, a large plugin ecosystem immediately, or Chromium-specific behavior that Safari/WebKit cannot support. For 3Dope, the current bottleneck is GPU-safe import/rendering, not desktop shell capability.

## Current Packaging Blockers

- No desktop shell exists yet.
- App icon needs final `.icns` export from `3dope Logo.png`.
- Bundle ID, signing identity, Apple Developer Team ID, and notarization credentials are not configured.
- Project save/load is metadata-only; imported model binaries are not embedded in project files yet.
- File association for `.stl`, `.glb`, `.gltf`, `.obj`, `.ply`, and `.fbx` is not configured.

## V1 Minimum Scope

- Native macOS app bundle.
- DMG installer.
- Apple Silicon arm64 build.
- App icon.
- Drag-and-drop import in desktop window.
- Local file picker import.
- No cloud sync, updater, or signed plugin system in V1.

## Setup Commands

Install Rust and Tauri prerequisites:

```bash
brew install rustup
rustup-init
rustup target add aarch64-apple-darwin
npm install -D @tauri-apps/cli
npm install @tauri-apps/api
```

Initialize Tauri around the existing Vite app:

```bash
npx tauri init
```

Use these values during init:

- App name: `3Dope`
- Window title: `3Dope`
- Web assets path: `../dist`
- Dev URL: `http://localhost:5173`
- Before dev command: `npm run dev`
- Before build command: `npm run build`

## Build Commands

Development desktop shell:

```bash
npx tauri dev
```

Production app and DMG:

```bash
npm run build
npx tauri build --target aarch64-apple-darwin
```

Expected output:

```text
src-tauri/target/aarch64-apple-darwin/release/bundle/macos/3Dope.app
src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/3Dope_*.dmg
```

## Signing And Notarization

Required Apple-side setup:

- Apple Developer Program membership.
- Developer ID Application certificate.
- App-specific password or App Store Connect API key.
- Unique bundle ID, recommended: `com.3dope.viewer`.

Recommended Tauri environment:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: YOUR NAME (TEAMID)"
export APPLE_ID="you@example.com"
export APPLE_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="TEAMID"
npx tauri build --target aarch64-apple-darwin
```

## V1 Release Checklist

- `npm run lint`
- `npm run build`
- Import smoke test: ASCII STL
- Import smoke test: binary STL
- Import smoke test: large STL preview
- Import smoke test: GLB
- Edit smoke test: move, rotate, scale, undo, redo
- Drag-and-drop smoke test
- Black-screen recovery smoke test
- Build Tauri app
- Sign app
- Notarize app
- Install DMG on a clean Mac user profile

## Post-V1

- Universal binary for Intel + Apple Silicon.
- Auto-update channel.
- Embedded project format with model binary payloads.
- File associations and Finder preview icon polish.
- Crash telemetry with explicit user opt-in.
