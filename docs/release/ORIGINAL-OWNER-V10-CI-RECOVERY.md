# SHUVI 2.0.5 — V10 Original Native Owner / SQLite CI Recovery

Source-release parent: `4a68c547ac78e26eb788a735875f6db2fbd216ec`.
All original source branches and `main` remain untouched. Original pinned Git trees remain byte-identical in HEAD; only disposable Windows CI worktrees apply the *reviewed*, SHA-checked overlays below.

## Actual first-run verification

- Original FilmCraft native `filmcraft-ui-egui` Windows `cargo check`: **PASS** in run [41063445136](https://github.com/shuvinexofficial143-design/shuvi-2/actions/runs/41063445136), job 124088684507.
- Original EffectCraft native `effectcraft-ui-egui` Windows `cargo check`: **FAIL**, same run job 124088684367. Three `E0308` errors at `crates/ui-egui/src/panels/dialogs.rs:434-453`: `set_resolution` declared `effectcraft_engine::Result<Value>`, but the actual native `motion_owner_gate.manual_menu_command` returns `Result<Value,String>`. Fix the **return type only**, retain the original owner gate and manual transaction.
- Release integrated Windows run [41063445032](https://github.com/shuvinexofficial143-design/shuvi-2/actions/runs/41063445032) **FAIL** at canonical A08 `cargo test --all-targets`: `recovery_integrity.rs:13` failed `create_dir` with Windows OS error 183 `AlreadyExists`. Other 17 receipt chain tests PASS. Its test-only temp folder used just PID plus wall-clock nanoseconds; Windows parallel tests can reuse a nanosecond value. This was fixture collision, not an AI action or native editor crash. Native work beyond this step did not run.
- Original FilmCraft source branch HEAD `41db019a` had an additional dev-only A07 bridge test borrow-of-moved `path` (same assertion inserted a PathBuf into HashSet and then reused it); **original GUI itself compiled**.

## V10 reviewed release-only patches

`scripts/release/apply-reviewed-native-overlays.mjs` verifies the *exact original Git blob SHA* of each target file before performing a single expected source-text replacement. The script exits with failure on modified originals, ambiguous anchors, mismatched blobs, or unknown patches; it emits the original and modified SHA-256 and marks the worktree modified, **not immutable**.

1. EffectCraft original `dialogs.rs`: return `Result<Value,String>` from `set_resolution`, preserving underlying `motion_owner_gate.manual_menu_command` and native project mutation flow unchanged.
2. Canonical A08 native **test fixture only** `recovery_integrity.rs`: add PID + atomic monotonic counter + timestamp, `create_dir` with collision retries to avoid two parallel tests reusing and deleting each other's SQLite directory. **No native ledger production code modified; no disabled test or fake receipt.**
3. Original FilmCraft dev A07 **test only** `shared_owner_admission.rs`: use `unique.insert(path.clone())` before checking `path.exists()`. No native GUI or editor code changed.

## Concrete Windows verification

- `Shuvi 2 Original Native Editor Compilation`: two independent original Rust/egui `cargo check` jobs on Windows 2022. Source identity verified BEFORE any overlay. EffectCraft temporary worktree overlay required for compatibility.
- Third independent native Windows job: original FilmCraft egui + canonical A08 imported Rust provider (copied into isolated `a07-canonical` path required by the pinned native A07 bridge); owner-exclusive, guarded `video.split` transaction tests (dev-only, **no live model, no human click**). The original `FilmcraftApp` entry point is tested with real editor session rather than fake media output.
- Release Windows workflow: parse PowerShell scripts, source integrity and 261 JS test baseline first; then apply isolated A08 fixture repair to execute all real on-disk SQLite chain/corruption/recovery tests; afterward same Tauri classic installer and installed WebView2 suites are still mandatory and must report any failure as failure.

## Trust boundaries / next production integration
- **Original GUI Windows cargo-check PASS != app GUI launched**. Neither FilmCraft nor EffectCraft original GUI is currently embedded inside the single installed Tauri app.
- A07 `shared_owner_admission` native owner test, even if it passes, is a **dev-only real Rust Session test with deterministic TEST owner consent**, not a human-approved production AI edit.
- Canonical A08 remains NOT attached to the same running original editor's manual transaction owner. A real production OS Yes/No consent, durable approval hash, Stop, no duplicate-action replay, project save/reopen and original EffectCraft `motion.editText` have not been end-to-end proven.
- Never enable provider-backed native edits until genuine installed original GUI + exact owner control + A08 journal/approval + before/after file and object proof all pass.

**RELEASE NOT READY.**
