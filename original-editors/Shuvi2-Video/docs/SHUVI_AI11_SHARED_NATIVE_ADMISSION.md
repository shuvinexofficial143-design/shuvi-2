# Shuvi2 Video V-AI11 — real Session shared owner admission gate

Branch: feature/shuvi2-original-video-ai, 2026-10-30.

## Verified baseline
GitHub Actions run 41044558164 on the previous V-AI10 exact HEAD was **SUCCESS**. Both jobs passed: FilmCraft native source registry/owner/egui checks, Windows release executable and ZIP upload, pinned canonical A07 provider/SQLite tests and real FilmCraft-to-SQLite split tests.

## Implementation
The isolated original FilmCraft A07 bridge now has an actual NativeVideoAdmission owner gate in src/shared_owner.rs. It owns ONE original filmcraft_engine::Session inside a non-blocking std::sync::Mutex. The trusted manual command path, native readback path, A07 snapshot path and actual GuardedHost reserve/consent/execute path MUST all acquire this very same Mutex before touching the underlying native Session.

- manual_command: routes the original Session::execute through shared admission, including Save/Open, Undo, new sequence and all other trusted native commands.
- native_readback and a07_snapshot: use the same admission gate, no peek during AI mutation.
- with_guarded_a07: holds the same actual Session lock continuously over canonical A07 GuardedHost and the persisted SQLite admission/intent/native split/readback/receipt.
- Busy is an explicit fail-closed admission status, not an automatic queue or fake completed edit. Poisoned native owners fail closed.
- Fresh VideoOwner uses trusted host project/session IDs and the real original document, does not take identity from an AI message.
- Tests use the real FilmCraft Session plus canonical SQLite GuardedHost; while the lock is held, manual new sequence/Undo/SaveAs/demo-open, nested A07 admission and native inspection all fail BUSY, not deadlock. A successful guarded native split releases the lock so a subsequent real SaveAs succeeds. The SQLite verified receipt survives reopen.
- A second test reserves a task, releases the lock for a real manual sequence change, then tries one native consent. The canonical A07 host must return StaleProject BEFORE showing the test owner UI, proving manual edits invalidate the AI reservation.
- Missing sequence/identity is refused at construction.

## Safety boundaries
This gate is tested inside the standalone a07-native-bridge package, which is NOT yet in the compiled original FilmCraft egui production app. Thus it demonstrates ONE correct shared lock for routes it controls, but **does not prove every production manual UI path uses the lock**. No provider API key, true native trusted consent window, Windows GUI E2E or full Save/Reopen/export app integration. All AI UI send/approve/stop capability gates remain FALSE; no hidden model action in production.

## Remaining integration
The integration owner must refactor the real egui editor app's current Session field and ALL manual action paths to use this single gate before attaching canonical A07 and native approval dialog, preserving original keyboard/mouse/undo/save semantics. Audit code paths, then implement proper trusted in-process OwnerConsent and persist receipts with project-specific protected SQLite database. Only then enable any AI mutation UI.
