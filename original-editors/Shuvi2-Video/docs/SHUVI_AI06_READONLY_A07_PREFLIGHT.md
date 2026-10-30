# Shuvi FilmCraft V-AI06 — A07 Read-only Proposal Preflight

Date: 2026-10-30 | Video-owned branch `feature/shuvi2-original-video-ai`

## Implemented
- `shuvi_ai_readonly::NativeA07SplitPreview` holds the *actual native* Clip ID, source item ID, track ID/type, project revision and document epoch, current sequence ID, and frame-aligned native cut tick. No paths or credentials.
- `a07_preflight_video_split` strictly parses canonical A07 `video.split` JSON, verifies real clip ID, precise in/out, native locked-track status, original Session and source-item identity. It only reads; never calls an edit, writes a file or grants permission.
- The ORIGINAL native egui Shuvi AI tab now has a separate "Native action preflight (read-only)" JSON textbox and a real "Inspect action (no edit)" control, displaying either verified native clip geometry/target or a grounded rejection. This does not send a request to the provider.
- Diagnostics clear on refreshed readback to avoid reporting stale approval.
- Real engine tests verify unchanged revision/journal after a valid preview and fail-closed invalid proposals; egui test checks stale diagnostics invalidation.

## Build and safety
- The original AI Director owner/SQLite Host is kept separate at canonical branch `feature/shuvi2-ai-director`. No duplicate task/consent/ledger implementation or fake credentials.
- Manual+AI exclusive owner lock, trusted owner click, persisted plan, crash-consistent receipt, real native artifact hash and Windows runtime E2E are not yet integrated. All capability gates remain FALSE.
- The read-only preview is **NOT an approved plan**, not an AI completion event, and not an output proof.
- The workflow's concurrency group is unique for V-AI06; previous long-running CI builds should not prevent this commit's source-specific verification. Full Windows build and UI launch must actually pass before any user-facing downloadable Windows installer readiness claim.

## Next
Fix any concrete CI failure. In Integration owner branch 2.0.5, bind canonical A07's one persisted plan+consent+ledger to original FilmCraft UI's single Session across ALL manual and AI actions, with explicit editor lock and robust source/affected-object hashes. Only then enable Send/Approve/Stop.
