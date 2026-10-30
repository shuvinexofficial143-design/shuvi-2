# SHUVI 2.0.4 — U08 Verified Native Trim/Delete and Editor Proof

## Base and ownership
- Repo `shuvinexofficial143-design/shuvi-2`.
- Branch `feature/shuvi2-unified-workspace` only, based on U07 `72508a09fbc51cb6fe2d0c4063c2f14a5c8c5adc`.
- U07 exact-sha CI run `41023171539` was still running at the first U08 audit; frontend had **77/77 PASS**, TypeScript and Vite SUCCESS, Windows native job running.
- No writes to `main`, `src/main.ts`, `src-tauri`, separate Video/Motion/AI branches or any user project media.

## Work implemented
1. Typed native FilmCraft `trimPreflight` verifies the selected clip truly exists in `video_project_snapshot`, its source lane is unlocked, native rational FPS exists, the edge is exactly `in|out`, ripple is boolean and deltaFrames is a nonzero signed integer within native Rust's +-144000 frame limit.
2. `deletePreflight` checks same actual saved clip/lock and typed ripple flag; no fake selection or inferred media ID.
3. `trimVideoClip` submits `TimelineAction::Trim` through the existing native expected-SHA/revision `video_timeline_apply`, reloads the actual native saved project, and independently verifies changed trim geometry on the same clip ID, source item ID and lane. Out edges must retain the timeline start and change the end; In edges must retain the end and change the start. Trims that do not satisfy this proof fail closed rather than being reported as verified.
4. `deleteVideoClip` invokes the real native FilmCraft delete command and verifies the original clip ID is absent from independent persisted readback. Ripple is explicitly owner-selected; no implicit ripple.
5. `applyVideo` now requires *exactly one successful native command receipt per submitted action* and a changed project disk SHA. A success-looking response with zero receipts, missing `ok:true`, or unchanged SHA is quarantined.
6. On a post-save move/split/trim/delete mismatch, the shared `quarantineVideoReadback` sets the error and progress to explicit **refresh required**, clears stale preview/export and pending owner approval, and prevents another edit. The prior generic success message can no longer survive a failed post-write verification.
7. UI exposes native Trim In/Out selector, signed frame delta and optional Ripple checkbox for Trim/Delete. Both buttons and Delete shortcut route through the verified native methods. The workspace does not fabricate a frame.
8. Motion `New composition` becomes available before the optional status probe: the trusted native worker can be requested directly, while native readiness and other mutation guards still fail closed.

## Tests
- New `tests/unified-ui-u08.test.mjs` includes 17 tests for real trimmed edge geometry, explicit ripple state, verified delete, stale/locked/invalid selections, missing/unchanged native receipts, uncertain timeout, preview invalidation, post-write error visibility and initial Motion create affordance.
- Run `npm test`, `npm run build`, and the exact new SHA Windows Foundation CI. Verify statuses on that same SHA before claiming pass.

## Integration block
A green frontend suite and Rust foundation CI do not prove a bundled desktop application works. The release owner Chat 2.0.5 must mount `mountUnifiedWorkspace` in a single real Windows Tauri WebView2 host, reconcile FilmCraft/EffectCraft commands and perform installed, physical editing/preview/export/save/reopen E2E. AI Director task-scoped guard and provider integration are not enabled by this UI work.
