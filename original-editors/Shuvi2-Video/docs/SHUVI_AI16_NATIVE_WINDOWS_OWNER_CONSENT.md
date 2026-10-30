# FilmCraft V-AI16 — Actual Windows Native A07 Owner Confirmation

2026-10-30. Branch: feature/shuvi2-original-video-ai.

## Actual shipped source
The standalone `a07-native-bridge` now contains `native_consent.rs` implementing canonical A07 `OwnerConsent` using a REAL Windows `MessageBoxW` with two visible choices: Yes or No (No is default). It is tied to the exact stored task `Scope` received only through the canonical SQLite `TransactionalLedger::approve` callback, and displays the full instruction, task ID, project ID, native session ID, project SHA, plan hash and every exact allowed `video.split` clip/time action.

Any wrong editor, missing/oversized/malformed scope, other type of action, control character, invalid clip/time or overlong dialog fails closed BEFORE opening Windows modal. User rejection, closing, Escape, OS failure, non-Windows platform default DENIED. No browser, model JSON or dialog args can force approval. Win32 access compiles only under cfg(windows), the OS dialog is never popped in headless CI.

Three new Rust regression tests verify all displayed identities, all split actions and expected NO text; unimplemented action/13 actions/wrong engine fail closed; hidden control characters, forged plan hash and invalid seconds refuse. Existing canonical SQLite and real FilmCraft split tests continue.

## Integration boundary / NOT production AI ready
This is real native Windows owner UI source and a correctly typed A07 `OwnerConsent` implementation, but the stand-alone bridge is still not linked to production egui `FilmcraftApp`. Therefore the production sidebar Send/Approve/Stop remain DISABLED. Do not claim a real user clicked an actual Windows dialog, or that the dialog has been invoked end-to-end on a live video project. The actual production UI manual/AI lock and canonical SQLite GuardedHost must be unified before calling it. UI thread/modal responsiveness and private ledger path/ACL must also pass a real Windows E2E.

CI improvement: constant workflow concurrency group `shuvi2-video-native-${{ github.ref }}` cancels stale builds to favor the newest exact Windows SHA, rather than launching a new parallel long-running group for every development batch.

## V-AI16 precision protection
The Windows dialog renders split seconds using Rust's shortest round-trip `f64::Display` rather than `{:.6}` formatting. This is necessary because two different canonical split seconds can round to the same displayed six-decimal value; the approving human must see the exact decimal representation actually stored. New regression checks `2.0000001` and `2.0000002` remain visibly distinct.

## Actual canonical A07 native callback wiring
The isolated `NativeVideoAdmission` now exposes a Rust-only `request_windows_native_consent(&mut TransactionalLedger, task_id, plan_hash)` method that holds the exact FilmCraft Session owner and dispatches to `GuardedHost::request_consent`, using the newly implemented `WindowsNativeOwnerConsent`. Canonical A07 checks the exact stored plan hash and native project/session version before even displaying the Win32 MessageBox; the ledger stores the one-time consent result. The method accepts no action list, raw model response, approval boolean or project path. It does not register an external API and it is not linked into the running FilmcraftApp yet. No headless test invokes an actual modal to avoid hanging CI.
