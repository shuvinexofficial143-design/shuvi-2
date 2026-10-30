# SHUVI 2.0.5 V13 — Genuine Original EffectCraft Native Text/Owner CI

Exact previous release commit: `3220f1a3b58adfd0913fae0f4ee955e0507788f5`.
This additive commit preserves original egui source tree SHAs, branches and the locked AI approval state.

## Verified source basis
- `original-editors/Shuvi2-Motion/crates/ui-egui/src/shuvi_motion_owner.rs` contains a native `Session` edit adapter with exact `TypedMotionAction::EditText` and re-read `native_readback["text"]`. Its `OwnerPermit::for_test()` constructor is **cfg(test)**, not a production consent interface.
- `original-editors/Shuvi2-Motion/crates/ui-egui/src/shuvi_owner_gate.rs` implements native `MotionOwnerGate`. Production AI-origin edits intentionally disabled until shared exact UI ownership, real SQLite A08 journal, OS Yes/No consent and preflight; real menu/control manual calls share one lock.
- Original FilmCraft+canonical A08 owner split 12/12 real native Rust tests passed in [V11 Windows CI 41065871197](https://github.com/shuvinexofficial143-design/shuvi-2/actions/runs/41065871197), with real native sessions but *not* an installed original GUI or actual human click.
- V12 installed custom Tauri proof still running during this commit; distinct from original egui runtime.
  
## Source-to-Windows verification added
Add independent Windows 2022 CI job for original EffectCraft `effectcraft-ui-egui` crate, with exact source-tree SHA verification **before** release-only guarded `String` error type patch:
1. Test all `shuvi_motion_owner::tests` from actual original Rust crate. Verify real composition, text create/edit, object ID stability, native text readback, stale revision, duplicate same-value refusal, invalid/foreign target and intentional no-production-permit policy.
2. Test all `shuvi_owner_gate::tests` from original Rust crate, including shared menu/control manual owner, guarded exclusive lease denial, nested transactions and test lock release. No mock UI image and no provider claim.
3. CI must fail if a source, build or test fails. No synthetic success or skipped-on-error. V12 Windows run preserved by V13 concurrency.
4. 1 new source-contract JS regression test, preserving all existing Foundation and canonical A08 tests.

## Security/limitations
- These are **real native original engine and original egui Rust tests with test-only owner permit**, not an AI request from production ChatGPT, not a live human modal and not a packed original-gui EXE.
- Source remains pinned and unchanged; the final single-host native production integration remains unfinished.
- Release remains **NOT READY** until a single installed Windows original-editor GUI does provider plan → one genuine owner approval → actual A08 SQLite-locked `video.split` and `motion.editText` → native readback/save/cold-reopen, Stop/crash/duplicate failure gates.
