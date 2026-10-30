# Shuvi 2 Video — V-AI03 Typed Owner-Only Native Kernel

Branch: `feature/shuvi2-original-video-ai`
Date: 2026-10-30

## CI failure investigated
Prior run `41030351216` failed 1/6 native tests: original FilmCraft's `write_project` intentionally renames a project on Save As to the destination file's stem. Our original test incorrectly expected the old `Untitled` name. Fixed the test to assert the *real* source-defined Save As behavior while still checking reopened native scene dimensions and sequence count. Source: `crates/engine/src/commands.rs`, `project_name_for` and `write_project`.

## V-AI03 code
- Added `crates/engine/src/shuvi_ai_owner.rs`: a PRIVATE Rust module within original FilmCraft engine; it is not an AI tool endpoint.
- Only typed action currently: `TypedVideoEdit::SplitAllTracksAt { tick }`; invokes original registered native `sequence.addEditAllTracks` against the live `&mut Session`.
- Volatile `SessionFence` checks revision, document epoch, active sequence, open project path and exact Arc project identity before running. It rejects stale manual changes or a different Session with identical numeric IDs.
- Disallows split at or outside sequence bounds; reads `sequence.inspect` before/after. Reports cuts, original session revision and independently observed clip counts; refuses to claim success if native readback doesn't show the change.
- No free-form user/model command names, UI automation, TCP tokens, unrestricted paths, hidden provider calls, or fake success.
- 5 native module tests cover real split and undo/readback, stale revision, other Session isolation, out-of-range rejection, and fail-closed AI readiness.
- Updated Windows Actions to run this real native module test, AI01 integration test and AI02 egui tests.

## Critical limitations / gates STILL FALSE
The kernel is `pub(crate)` and not exposed by the UI/IPC. An in-memory fence and `&mut Session` borrow are NOT a persistent authorization token, shared manual/AI owner lock or crash-safe idempotency record. Native AI edit execution MUST remain disabled until reviewed A07 integration provides owner consent from persisted plan, task/action IDs, exclusive lock covering both human and AI command paths, SQLite intent/receipt, safe stop/recovery and independent verified save. No blind retry after uncertain outcome. Provider credential vault is not integrated.

## Next V-AI04
After CI is green: review and bind 2.0.3 A07 transactional planner/real provider service and Windows Credential Manager/keyring, without duplicating ledger. Register no permissive AI command before shared native owner admission+readback and true single-task owner approval are operational.
