# V04 — Typed FilmCraft timeline actions (real project, no mock)

Branch: feature/shuvi2-video-studio. This milestone follows V03 media ID import.

- Tauri IPC: `video_timeline_apply({request})`. TypeScript caller `editVideoTimeline`.
- Actions accepted: createSequence, place, split (razor), trim (regular/ripple), move (fixed track + timestamp), delete (regular/ripple), undo, redo.
- The **actual pinned FilmCraft headless binary** executes commands in one session through `filmcraft-cli --project ... --save run timeline.jsonl`.
- Strict action enums map to FilmCraft's real ids: `file.newSequence`, `timeline.place`, `timeline.razor`, `timeline.trim`, `timeline.move`, `edit.clear`, `edit.rippleDelete`, `edit.undo`, `edit.redo`.
- Source is a preexisting, canonicalized `.fcproj` under user-selected root. 1–32 actions per request, limited track/time/trim/dimension arguments, CLI timeout and mutually exclusive import lock.
- Optimistic revision check fails with `STALE_PROJECT_REVISION` on a revision mismatch. The caller must refresh the project and ask for a new plan. No blind replay.
- Every request writes an immutable unique `*.shuvi-backup-*.fcproj` snapshot before execution. FilmCraft persists only after successful script completion. The full command output is parsed as real JSONL receipts. After saving, project and sequence are independently re-opened and inspected, including track/clip IDs.
- `undo` / `redo` are supported **within the same native batch session**. FilmCraft's per-session history is not currently restored across separate invocations; cross-session undo checkpoint UI is a further milestone, not claimed implemented here.
- This is a genuine backend timeline contract; it is not a rendered timeline interface. Manual Tauri timeline UI is still a later milestone.

## Real test

The ignored-by-default Windows integration test imports the exact 64×64 12-fps H.264 sample in `tests/video/`, creates a FilmCraft sequence, places source video on V1, splits it at 0.5s, moves a split clip, deletes it, then exercises undo+redo in one session. It checks real clip IDs and track item counts from reopened `.fcproj`.

    cargo test --manifest-path src-tauri/Cargo.toml --lib video::timeline::tests::real_timeline_placement_split_move_delete -- --exact --ignored --nocapture

The CI workflow invokes it after the V03 import test and before creating a Windows installer. **A committed test is not a test PASS**. Inspect exact-SHA workflow evidence and diagnose any upstream command errors before claiming this works.

## Limitations / risks

- No automatic AI execution or repeated approval loop, manual timeline gestures, visual preview or MP4 output yet.
- Snapshot files are not yet retention-managed and may accumulate until a project-backup cleanup policy is implemented.
- `expectedRevision` only protects against mismatches seen when the CLI reopens the project. Additional project-file compare-and-swap would be required for concurrent external editor writers.
- No direct changes to `main`, Shuvi 1 or Motion Studio.
