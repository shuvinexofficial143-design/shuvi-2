# M16 — Crash-safe native EffectCraft PNG sequence publishing

Branch: `feature/shuvi2-motion-studio` in
`shuvinexofficial143-design/shuvi-2`. This milestone touches only Motion-owned
sources; main, `feature/shuvi2-video-studio`, EffectCraft and FilmCraft pins
remain untouched.

## Verified historical CI status

M11 and M12 older real Windows Desktop WebView2 runs
[41001931635](https://github.com/shuvinexofficial143-design/shuvi-2/actions/runs/41001931635)
and [41003909718](https://github.com/shuvinexofficial143-design/shuvi-2/actions/runs/41003909718)
both passed Native Engine, but failed the real GUI E2E before any verified click
because of malformed `async=>` JavaScript in their specific old revisions.
The M13 repair and `node --check` before compiling production Tauri did not exist
in those old commits. They are **not** evidence that a newer Windows WebView is
working or broken. The M15 Motion run was canceled by superseding commits, not PASSED.

## M16 shipped source changes

1. **Private staging and final publish** in
   `crates/shuvi-motion-bridge/src/sequence.rs`: before export, validate
   owner-selected existing workspace, normalized simple output name, frame count
   (1–120), native FPS, preview size (max 640px), time range, and target absence.
   Reserve a fresh unique `.basename.shuvi-staging-PID-time-attempt`
   directory under the exact workspace, not the final user-facing folder.
   Render every frame via the real EffectCraft engine into this staging folder.
   Save with `create_new(true)`, `sync_all()`, disk readback and byte equality.
   Only after all frames AND the native `sequence.json` manifest are verified
   attempt the same-volume `fs::rename(staging, final)` publish. If anything
   fails, clean only files created by the operation and refuse replacing an
   existing owner file, folder or symlink. On Windows the rename refuses an
   existing target. The staging folder may survive an abrupt OS/process crash;
   it must never be mislabeled as completed output.
2. `tests/png_sequence.rs` now verifies the exactly named final directory is
   present, and no extra staging directories remain after a successful publish
   or a validation-level refusal. A real Rust CI success is required before
   treating the tests as verified.
3. The real Windows Tauri WebView E2E now exports a native image sequence after
   the independent one-frame PNG export, and requires the first sequence PNG
   to equal the standalone EffectCraft PNG *byte for byte*, with both SHA-256
   hashes equal. It still rejects overwriting an existing sequence directory.
4. `scripts/motion/verify-desktop-proof.ps1` fails unless receipt has
   `sequenceVerified=true`, exactly three real native frames, and the first
   sequence SHA-256 identical to the independently exported PNG, alongside the
   previous native Undo/Redo, cold process restart, source pin, screenshot and
   receipt gates.
5. Updated frontend contract checks assert the staging semantics and mandatory
   new installer gate. **Same-turn in-process source contract audit: 24/24
   checks passed**; the WebDriver ESM script's body also parsed in V8
   after stripping imports. These are source-level checks, **not** the actual
   Windows `npm test`, Rust compilation, driver clicks or a built installer.

## Non-goals and release acceptance

A sequence of native PNG files is **not** a movie, MP4 encoder, or a signed
Windows installer. An unsigned NSIS installer remains gated behind a fully
successful real Windows WebView2 end-to-end run on the exact current Git SHA.
A CI job that is queued, canceled, or in progress is **not** a PASS. These
new Rust tests and Windows image sequence execution must finish and upload
real evidence before release readiness can be asserted.

The Video Studio integration and AI editing consent remain separate and
must never be implicitly enabled by sequence export.
