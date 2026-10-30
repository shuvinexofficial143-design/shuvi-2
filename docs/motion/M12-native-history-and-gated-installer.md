# M12 — Owner Undo/Redo and E2E-gated real Windows installer

Project: `shuvinexofficial143-design/shuvi-2`.
Only branch `feature/shuvi2-motion-studio`; no edits to
`feature/shuvi2-video-studio`, main or either pinned vendor submodule.

## Native history: real EffectCraft

`crates/shuvi-motion-bridge/src/history.rs` exposes `inspect_history`,
`undo_native`, `redo_native` using real pinned `Session::history`
and official `edit.undo` / `edit.redo`. No client-side fake
undo stack. It reads undo/redo depths, next action labels and dirty
state from the live owner Session. A native action must verify the
returned history label, actual Project snapshot difference and inverse
history availability; a no-op reply is NOT considered successful.

Tauri's existing typed `motion_command` worker supports
`inspectHistory`, `undo`, `redo`, `inspectComposition` without
untrusted arbitrary engine calls. Native Rust tests verify exact frame
pixel equality for shape Undo→Redo and effect parameter Undo→Redo,
and that unavailable Redo is refused. The Tauri worker test invokes
actual `MotionHost` with one session and pixel equality.

The owner Motion toolbar now has real Undo/Redo buttons, disabled
states, action tooltips and native history status. Undoing the first
composition can remove the active composition: client calls typed
native `inspectComposition`, clears stale canvas/layers if absent,
and otherwise rerenders real EffectCraft pixels. The M12 WebView2 E2E
physically clicks Undo and Redo on a mask edit and verifies exact
base64 PNG frame equality after Redo.

`motion-history-proof` generates actual original/edited/undo/redo
PNG frames and `m12_undo_redo.ecproj`; after fresh native reopen,
exact RGBA bytes must match the original redone frame. The engine CI
must run this executable and upload `m12_receipt.json`.

## Real Windows NSIS installer — strict staging only

The existing Foundation shell config still has `bundle.active=false`.
A separate Motion-owned overlay
`src-tauri/src/motion/tauri.release.conf.json` enables a genuine
Tauri Windows NSIS bundle with the system WebView2 bootstrapper
download option. We **do not edit the shared Tauri config**, which
Video Studio may be changing independently.

`scripts/motion/package-windows-release.ps1` runs the Tauri
release build against the overlay, checks the exact pinned
EffectCraft gitlink and checked-out Git SHA, requires a real NSIS
`.exe` (at least 1 MiB) and produces a copied installer plus
SHA-256 checksum manifest. It explicitly marks the installer
**unsigned and unpublished**, including the actual Authenticode
status. This is NOT a public release, not an auto-installer, and
not a signed distributable.

The `motion-windows-installer` Windows job is defined with
`needs: motion-desktop-e2e-windows`: it cannot start unless the
actual compiled Shuvi2 Windows WebView2 click-through test succeeded.
The installer artifact uploads as
`shuvi-motion-windows-installer-unsigned` only after a genuine
NSIS build and checksum check. A queued, skipped, failed, canceled
or unrun desktop test is NOT sufficient.

Official Tauri Windows NSIS/MSI documentation:
https://tauri.app/distribute/windows-installer/

## Verification gates

```powershell
git submodule update --init --recursive
npm install --no-audit --no-fund
npm test
npm run build
cargo test --manifest-path crates/shuvi-motion-bridge/Cargo.toml --all-targets
cargo run --manifest-path crates/shuvi-motion-bridge/Cargo.toml --bin motion-history-proof
cargo test --manifest-path src-tauri/Cargo.toml
```

Only the Windows GitHub-hosted GUI job may attest to actual WebView
mouse/keyboard interaction; actual Windows NSIS artifact and checksum
must be separately inspected. Do not report the installer as created
merely because its script/CI job was committed.

## Known unfinished

- M12 Windows GUI job and installer job must finish successfully on
  the SAME exact branch SHA before claims of release readiness.
- An unsigned Windows CI artifact will trigger unknown publisher
  Windows warnings; distributing outside CI needs signing and a
  review of updater/distribution strategy.
- Undo/Redo is one native Project history step at a time. No
  scripted AI batch authorization or per-task grouped editing yet.
- No verified final Video+Motion merged Windows app, cross-studio
  interchange, MP4 encoder, connected AI provider or bundled updater.
- Owner-controlled one-approval policy is needed before any AI agent
  may issue arbitrary editor changes; no implicit authorization.
