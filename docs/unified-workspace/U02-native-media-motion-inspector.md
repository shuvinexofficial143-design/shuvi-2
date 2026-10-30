# SHUVI 2.0.4 U02 — Native Media & Motion Property Inspector

## Repository discipline
Owner: `feature/shuvi2-unified-workspace` in `shuvinexofficial143-design/shuvi-2`.
No changes to main, video/motion studio sources, Tauri command registration, package.json, or AI Director.
Video PR #2 and Motion PR #1 are *separate, unmerged and moving*; integrate via Chat 2.0.5.

## Native contracts consulted
- FilmCraft `video_project_snapshot` contains `project.root.children` nested media item IDs, `projectSha256` and `sessionRevision`; `video_timeline_apply` expects `selectedRoot`, `projectPath`, expected checksum/revision and typed actions. `video_import_media` verifies imported item IDs on disk.
- EffectCraft `motion_command` supports `status`, `inspectComposition`, `listLayers`, `listEffects`, `listMasks`, `setTransform`, `addKey`, `addShape`. Native layer snapshots have kind, position, scale, rotation, opacity, keyframes, revision.
- A preview is sourced from actual FilmCraft PNG bytes or EffectCraft `native-effectcraft` PNG bytes. U02 does not render a fake placeholder preview.
- No Motion `expectedRevision` native compare-and-swap currently exists. **Do not auto-execute AI Motion writes** until server-side guard exists.

## U02 implementation
1. `src/unified-workspace/media.mjs` enumerates nested FilmCraft native bin items without losing descendants and rejects stale/unrecognized selection. This is a real native project readback, not an OS-wide file dialog.
2. Motion layer selection triggers `inspectMotionLayer`, which checks native worker revision before and after `listLayers`, `listEffects` and `listMasks`. A missing layer and divergent revision do not produce invented data.
3. Manual Position/Scale, Rotation/Opacity, scalar keyframes (Rotation/Opacity), native shapes call the real typed `motion_command` through the shared controller. Post-edit status + native layer list must prove revision advance.
4. Motion `motionStatus` recovery now re-inspects active composition and layer list; a simple health ping alone cannot silently bless stale editor state. Motion and Video recovery flags are studio-scoped; refreshing the unaffected studio cannot clear a quarantined Motion project.
5. The U02 UI displays actual effect and mask names from native receipts but does not yet expose effect/mask editing in this inspector.

## Tests
`npm test` runs `tests/unified-ui-u02.test.mjs`:
- Nested native media enumeration, deduplication, selection validation.
- Effects/masks native inspection and unknown layer failure.
- Typed transform/keyframe write + revision/layer readback.
- External revision conflict blocks writes, recovers from native reinspection.
- Different studio operations do not clear the affected recovery flag.
- Mid-read revision drift does not publish stale inspection.
- Source controls checked for wired actions.

`npm run build` validates TypeScript/Vite for the combined UI source on this branch.
These tests use an injected mock native bridge **only in tests** and cannot prove Windows WebView2/native binary integration. The actual combined binary requires all native commands to be registered by 2.0.5 and real click-through verification.

## Integration handoff for 2.0.5
- Use one `mountUnifiedWorkspace(root)` in the shared Tauri host.
- Do not mount Video, Motion, and Unified independently or keep multiple EffectCraft workers.
- Reconcile latest Video/Motion command contracts and register `video_project_snapshot`, `video_timeline_apply`, `video_import_media`, `video_preview_frame`, `video_export_mp4`, `video_history_restore`, `motion_command`.
- Confirm `listEffects`/`listMasks` stable readback, native revisions, native MP4/PNG receipts, disk reopen and installer E2E on a single integration commit.
- AI Director planned actions use the same controller; Motion auto-execution remains off until native task-scoped expected revision authorization.

## Still blocked / not claimed
Native picker dialog for arbitrary filesystem selection; full effect/mask/keyframe graph editing; autosave; real Windows combined packaged WebView2 E2E; installer distribution; provider-backed AI. Input paths are still owner-entered, not a fake OS file picker.
