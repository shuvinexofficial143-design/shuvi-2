# V-AI05 — A07 contract compatibility and verified FilmCraft clip split

Date: 2026-10-30. This is a native VIDEO owned milestone on `feature/shuvi2-original-video-ai`.

## Concrete defect corrected
The A07 planner uses `{"type":"video.split","clipId":7,"seconds":2.0}` and its original Rust `Action` has `#[serde(rename_all_fields="camelCase")]`. The Video-only source accidentally had only `rename_all="camelCase"`, which changes enum variant names but not struct-like fields. In other words, real A07 `clipId` would fail parsing. Fixed the serde enum container and retained a positive + negative schema regression test.

## Native execution checks
- Exact target clip is checked against the real active FilmCraft `sequence.inspect` readback.
- A locked or uninspectable native track is rejected **before** mutating anything.
- The original editing operation remains `filmcraft_edit::razor_items` called via the same `filmcraft_engine::Session::edit_sequence` as manual GUI.
- Independent post-edit checks prove old left-half retains its exact ID and source item, left end/new right start equals the requested cut tick, new right end equals former clip end, new ID is unique, and all other clips/tracks remain unchanged. Evidence now exposes `created_clip_id` to the owner-only in-process result.
- Tests cover positive exact split, Undo, native frame rate snap, wrong extra fields, invalid IDs, locked target, no approval/ledger fake readiness.
- This is **not cryptographic proof**. Canonical A07 must still bind a SHA-256 project snapshot and affected-object proof to a persisted ledger transaction.

## A07 and integrated GUI not yet connected
Canonical A07 remains in its dedicated branch; no source files from the AI branch were copied into the Video or Motion code, and no second SQLite ledger was created. A real provider key, Windows Credential Manager, owner consent, task action receipts and SAME manual+AI exclusive admission lock must be reviewed and integrated by the owning host before any AI button is enabled.

## Windows evidence
The branch includes native Windows source compilation and engine/egui tests. Successful CI compile isn't a launched GUI. No Win32 owner click, actual media export, saved MP4 or screenshot is claimed until live Windows E2E succeeds.

## Next
Review the latest queued CI failure logs and fix anything concrete; then coordinate reviewed integration of the pinned A07 native host with the desktop owner so one approved task can perform a real named-clip split, save/reopen and export, with durable receipts and explicit stop/recovery.
