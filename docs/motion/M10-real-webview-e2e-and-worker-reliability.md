# M10 — Real Windows WebView2 E2E and bounded Motion worker

**Branch:** `feature/shuvi2-motion-studio` on
`shuvinexofficial143-design/shuvi-2`; do not merge to main.
The pinned EffectCraft and FilmCraft gitlinks are unchanged.

## Goal and actual scope

M10 moves testing beyond source matching and Rust-only compositor checks.
`tests/motion/desktop-e2e.mjs` drives the **real compiled Shuvi2 Windows
Tauri WebView2** over a W3C WebDriver session (Tauri's `tauri-driver`,
EdgeDriver, `browserName: wry`, `tauri:options.application`).
There are **no mocked Tauri `invoke()` calls**. All actions are
physical user-style WebDriver element clicks and text entry.

It opens the existing Motion Studio tab, waits for native Engine status,
creates an editable composition and shape, checks the returned PNG
`data:image/png` preview, applies Gaussian Blur and a real polygon mask,
saves the real `.ecproj` to a new temporary workspace, exports the native
PNG, switches Video then Motion to check the same native layer/preview
is available, and captures a real window screenshot. On completion,
`proof/motion-desktop/receipt.json` describes the verified steps and
`motion-windows-webview2.png` is the screenshot; a failure writes
`motion-failed.png` when the WebDriver session permits it.

`scripts/motion/run-windows-e2e.ps1` installs official `tauri-driver`
and a matching EdgeDriver using `msedgedriver-tool`, starts the driver,
executes the Node E2E against a built binary and stops the process.
The Windows Actions `motion-desktop-e2e-windows` job **needs native
engine success** first, then compiles the actual Windows app and
runs the test. A failure fails the job; artifacts (screenshots, receipt
and driver logs) upload with `if: always()`. A branch commit and a
static UI test do NOT prove WebView E2E; only a successful real job plus
its files do.

Upstream guides: https://tauri.app/develop/tests/webdriver/ and
https://tauri.app/develop/tests/webdriver/manual-setup/.

## Native worker safety

`src-tauri/src/motion/mod.rs` changes the previously unlimited
`mpsc::channel` to a **bounded `sync_channel(32)`**.
`try_send` rejects extra requests rather than silently queuing
unlimited work. Every Work item gets a 120s deadline; if it has not
begun by that deadline, the single-owner worker rejects it without
editing the project. A running EffectCraft operation **cannot yet
be preempted**, and blocking callers still use a 120s response wait.

`src/studios/motion/bootstrap.ts` protects the canvas from old
UI generations or wrong compositions/playheads. When the user scrubs
while an editing/render request is busy, one coalesced
`pendingPreview` flag schedules **the latest** frame when the
current operation settles. No synthetic frame is generated.
Switching tabs discards that pending preview. Reactivation reuses the
same native host/session, not a new project.

## Reproduction on a capable Windows machine

From a checked-out repository (submodules initialized), with
Windows WebView2, Edge, Rust 1.95, and Node 22:

```powershell
git submodule update --init --recursive
npm install --no-audit --no-fund
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path crates/shuvi-motion-bridge/Cargo.toml --all-targets
cargo build --manifest-path src-tauri/Cargo.toml --bin shuvi2
./scripts/motion/run-windows-e2e.ps1
```

You can inspect the exact Windows CI job and its artifact rather than
relying on a local operator description.

**Acceptance gates:**
1. M08 and M09 delayed Windows runs checked and failures fixed.
2. M10 exact HEAD Motion Rust/native smoke PASS.
3. M10 exact HEAD Foundation frontend and Tauri Rust PASS.
4. M10 exact HEAD true desktop E2E job PASS; screenshot and
   `receipt.json` existence confirmed in Actions artifact.
5. No direct changes to Video Studio branch/main or either vendor pin.

## Known remaining engineering work

- The native worker bounds backlog and expires not-yet-started
  commands, but **does not cancel in-flight long EffectCraft calls**.
- E2E on GitHub Windows can fail due to GUI desktop session /
  EdgeDriver/WebView version incompatibility; do not relabel such
  a failure as a passing app test. Surface diagnostics and rerun
  a corrected workflow.
- `SaveProject` refuses unowned/previously existing paths and
  requires the owner to select an existing directory.
- No AI model has editing permission and no automatic one-approval
  policy has been wired into this Motion app yet.
- Native per-frame PNG output is not the same as video rendering,
  transparent MP4 export, installer packaging or FilmCraft interchange.
- The integrated Video+Motion final Tauri host requires a reviewed
  reconciliation of shared `Cargo.toml`, `lib.rs` and frontend nav;
  **no merge or copy between branches in M10**.
