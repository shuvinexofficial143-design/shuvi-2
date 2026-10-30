# M11 — Cold-restart WebView2 proof, native edit integrity and CI diagnostics

Repository: `shuvinexofficial143-design/shuvi-2`
Branch: `feature/shuvi2-motion-studio`
Previous M10 verified-source checkpoint: `8cd80847547b1c8f4909f6308d39f48c2ee154cb`.

## Why this batch

Previous milestones used pinned EffectCraft engine tests and introduced a
Windows Tauri WebView2 WebDriver job. Merely clicking controls and saving a
PNG cannot prove that the editor's modifications survived a fresh process.
M11 strengthens the **real GUI acceptance contract** and diagnostics.
The test uses the actual Windows `shuvi2.exe`, Tauri WebView2,
`tauri-driver` and Microsoft EdgeDriver. No fake `invoke`, fake frame
or browser-only Vite test is accepted as native proof.

## New real E2E gates

`tests/motion/desktop-e2e.mjs` now checks these operations in order:

1. Open Motion tab and verify the native EffectCraft worker.
2. Create native composition and real shape; capture
   `m11_01-native-shape.png` from the desktop WebView.
3. Add Gaussian Blur, update its real parameter, assert that returned
   native PNG base64 **changes** compared to the original frame.
4. Add native Polygon Mask, assert PNG bytes change again; capture
   `m11_02-effect-mask.png`.
5. Save native `webview_e2e.ecproj`, export actual PNG, validate PNG
   signature and disk size. Click Export a second time and require a
   **no-overwrite error**; verify original disk file bytes unchanged.
6. Open the project from disk in the running application and assert
   persisted layer, native Effect and Mask presence.
7. Switch Video -> Motion and prove the one-window native worker keeps
   the original project/preview.
8. **Close the WebDriver session, destroying the running app, then
   start a NEW desktop app process**, open the same physical `.ecproj`
   and verify the layer, Gaussian Blur, Mask and native preview PNG
   signature. Capture `m11_03-cold-reopened-project.png`.
9. Capture final `motion-windows-webview2.png` and write
   `receipt.json` with successful steps, sizes and
   `coldRestartVerified=true`.

A driver/session startup failure writes an explicit failure
`receipt.json`; any native UI error fails fast rather than being hidden
inside repeated polling. `motion-failed.png` is captured when possible.
The Windows CI job uploads screen captures, driver logs and receipt even
on failure. Tests fail on mismatched bytes, impossible native output,
failed restart or missing project — never silently skip those checks.

## Runtime reliability

Existing M10 bounded native worker has a `sync_channel(32)` with
`try_send` backpressure and a deadline check before running each queued
action. Frontend uses a coalesced latest-playhead preview request.
The Rust regression test for expired requests proves a queued command
whose deadline elapsed cannot mutate EffectCraft Project revision.
This does **not** interrupt an EffectCraft operation that started
before the deadline; in-flight cancellation remains future work.

## GitHub Windows CI optimization

`.github/workflows/motion-smoke.yml` now caches the Engine Rust
workspace separately from the final Tauri desktop Rust workspace using
`Swatinem/rust-cache@v2`. It keeps the real desktop E2E job dependent
on native Engine smoke success, preserving honest fail-closed acceptance.
Caching is an optimization, not a test result or a bypass of source pins.

## Acceptance and status interpretation

The current M11 GitHub branch SHA must have:
- Passing Motion Engine Windows job, including pinned engine and all
  native proof executables.
- Passing Foundation frontend build and Tauri native Rust tests.
- Passing REAL WebView2 GUI job (not only source contract tests).
- An uploaded desktop artifact with `receipt.json`, final screenshot,
  stage screenshots, and `coldRestartVerified=true`.

A pending, queued, skipped or failed WebView2 job is **NOT READY**.
Windows Github-hosted runners may encounter driver matching, desktop
session, installer or build issues; inspect its failure logs and update
the implementation rather than claiming success.

No work in M11 merges branches, modifies either pinned vendor gitlink,
changes Shuvi 2.0.1 Video Studio or previous Shuvi repository, adds an
AI model with editing permission, or claims full MP4 export and Windows
installer. These remain explicit next milestones.
