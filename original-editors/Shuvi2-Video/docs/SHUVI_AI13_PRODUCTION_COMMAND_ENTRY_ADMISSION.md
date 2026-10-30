# Shuvi2 Video V-AI13 — Production FilmcraftApp menu/control command admission (PHASE 1 ONLY)
Date: 2026-10-30, branch feature/shuvi2-original-video-ai.

## Source-level production migration
New `crates/ui-egui/src/shuvi_manual_admission.rs` implements a nonblocking in-process ManualCommandAdmission with Arc<AtomicBool>, compare_exchange and an RAII lease. Unlike a mutex owning the Session, this is a narrow active-command signal. The legacy `FilmcraftApp.session` stays unchanged to preserve original FilmCraft UI behavior.

Original `FilmcraftApp` constructs one command lane; `menus::invoke` checks this lane before any menu action, then routes the direct Session::execute fallback and other direct menu commands through `FilmcraftApp::shuvi_manual_execute`. The original external control dispatcher `engine.execute` and `ui.menu.invoke` invoke `menus::invoke`, and `engine.commands` now goes through the same explicit command seam. Native menu inbox also enters `menus::invoke`. This is actual production UI source, not an isolated bridge test mock.

Tests prove a real `file.newSequence` menu command cannot mutate the original Session while claimed, that it edits correctly after claim release, a duplicate claim is rejected, and a released claim does not stick after a test panic. A separate test validates the remote control command-list route uses the same lane.

## Explicit blockers / NO AI permission
This is **NOT** the A11 mutex that owns the real Session. All direct original panel/timeline/drag/input, background persistence/export jobs, and some direct `Session::edit_group` calls may still bypass it. Only one Session::execute operation is admitted; a claim cannot be used as a globally safe owner-transaction fence. It does not read or write canonical A07 SQLite and it has no native approval UI. Therefore `NativeAiReadiness.ai_mutations_enabled` remains **false**, and Send/Approve/Stop remain disabled. It is unsafe to infer full production owner lock from these tests.

A12 separate `a07-native-bridge` tests previously covered the stronger actual FilmCraft mutex and canonical SQLite under a trusted test consent fixture, but that isolated gate has NOT been substituted for the runtime FilmcraftApp Session.

## Next production migration
Audit and migrate direct native panel-edit, drag/key, Open/Save/autosave paths into one authoritative owner. Ensure the production UI event loop and A07 admitted commands share one non-bypassable mutation boundary, preserving rendering and playback. Connect the canonical ledger and true trusted local consent only after that. Trigger complete real Windows CI, GUI/reopen, and native media E2E before claiming readiness.

## A13 command admission panic/concurrency hardening
The original production UI command lane now uses two atomics: claimed and sticky poisoned. The RAII lease marks the gate poisoned BEFORE releasing a claim if the executing native command panics. All covered menu/control commands reject a poisoned lane, instead of accidentally retrying a potentially partly applied edit. A new deterministic two-thread Barrier test proves the real menu file.newSequence command cannot mutate the original native Session while a worker holds that gate. This is still NOT a process-wide owner lock: direct engine edits outside the production command dispatcher are not in this phase-one lane.
