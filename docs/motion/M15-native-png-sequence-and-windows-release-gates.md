# M15 — Real EffectCraft animated PNG sequence and Windows release gates

Repository: `shuvinexofficial143-design/shuvi-2`
Owner branch: `feature/shuvi2-motion-studio`
Do NOT merge to main or modify Video Studio's branch. Both pinned
vendor Gitlinks remain unchanged.

## Windows CI diagnosis first

At M15 start, M14 exact-head Windows Foundation and Motion jobs had
still not run. We inspected the first delayed real M11 WebView2 job
`41001931635`, which did run to completion **with FAILURE** in the
actual Windows desktop click stage. Its log showed
`tests/motion/desktop-e2e.mjs:175` `SyntaxError: Unexpected reserved word`
from the same `async=>` callbacks subsequently repaired in M13.
The M11 Native Engine job itself was **SUCCESS**.
This older job does NOT validate or invalidate M13/M14 patched code.

The current real desktop E2E job uses the M13 `node --check` preflight,
embedded-production Tauri Windows binary, actual W3C WebDriver/Tauri
driver and fail-closed GUI screenshot/receipt verifier. No completed
M14/M15 E2E, NSIS or screenshots are claimed solely from committing
their jobs.

## Real animated PNG image sequence, not MP4

A new `crates/shuvi-motion-bridge/src/sequence.rs` connects directly
to the **same owner EffectCraft Session** as manual Motion editing:
- Renders frames through real `MotionBridge::render_preview()` and
  the native EffectCraft compositor, never a frontend/mock canvas.
- User chooses an already-existing workspace folder, a new sanitized
  child directory name, integer 1–120 frame count, time and native FPS.
- Maximum side 640 px per frame; validates start time, FPS equality to
  native composition and end time strictly inside the composition.
- Creates the entire sequence directory exclusively, then each frame
  `frame_0000.png`, `frame_0001.png`, etc with
  `create_new(true)`; no existing directory or file can be overwritten.
- Synchronously reads back **each** encoded PNG and compares its bytes
  against the actual renderer output.
- Writes `sequence.json` with `ok:true` **only after every frame
  succeeded**, storing real native frame checksums, frame count, FPS,
  total bytes and source revision. Errors remove only files the call
  created and never delete unrelated owner data.
- Export never modifies the live EffectCraft composition or creates
  fake keyframes.

The single-owner Tauri worker exposes a typed
`exportPngSequence` request and disk-verified receipt. The existing
Motion Studio controls now include Sequence Folder, Frames and
**Export native PNG sequence** button. It displays a path and byte
count only after the native receipt validates the requested number of
frames and `source=native-effectcraft`.

## Independent native proofs and real GUI acceptance

- `crates/shuvi-motion-bridge/tests/png_sequence.rs` tests five
  real EffectCraft PNG frames against individually rendered native
  previews, whole-project revision preservation, manifest content,
  folder path validation, bounds and no overwrite.
- `src-tauri/src/motion/mod.rs` has a real worker test that writes
  three frames from typed IPC and rejects a repeat export into the
  same owner directory.
- `motion-sequence-proof` creates a real EffectCraft rectangle,
  applies native Opacity keyframes and Easy Ease, exports **16
  animated PNG frames**, requires pixel differences between first
  and last, confirms no-overwrite and writes
  `m15_sequence_receipt.json`. The Windows native Engine job runs
  this binary and uploads the actual PNG/JSON proof outputs.
- The Windows WebView2 E2E physically clicks Sequence Export, checks
  three actual on-disk PNG signatures and the manifest, and rejects
  an attempted duplicate folder. The existing cold-reopen and
  native undo/redo screenshot and SHAs gates remain mandatory.
- Frontend Source tests require the typed IPC, bounded native
  filesystem behavior, real proof binary, Windows CI integration
  and WebDriver GUI action.

## Gate for marking the feature ready

The branch is not Ready until the same exact HEAD has:
1. Foundation frontend and native Tauri CI **SUCCESS**.
2. Native EffectCraft engine tests and sequence proof **SUCCESS**.
3. Windows Desktop WebView2 click-through E2E **SUCCESS**, including
   screenshot files and `verify-desktop-proof.ps1`.
4. Installer CI **SUCCESS** with real NSIS executable and SHA-256
   manifest, only after the GUI E2E has passed.

Any queued/cancelled/failed job is **not verified**. A successful PNG
sequence is image frames, NOT a completed MP4/movie encoder.
The eventual FilmCraft/EffectCraft unified Windows shell, signing,
AI-permission policy, audio, video encoding and final distribution
remain separate reviewed milestones.

## Reproduce on an actual Windows source checkout

```powershell
git submodule update --init --recursive
npm install --no-audit --no-fund
npm test
npm run build
cargo test --manifest-path crates/shuvi-motion-bridge/Cargo.toml --all-targets
cargo run --manifest-path crates/shuvi-motion-bridge/Cargo.toml --bin motion-sequence-proof
cargo test --manifest-path src-tauri/Cargo.toml
```
