# SHUVI 2.0.4 — U03 Native Timeline + Advanced Motion Controls

## Branch ownership
`feature/shuvi2-unified-workspace` only. No edits to main, old Shuvi 1, `src/main.ts`, `src-tauri`, `index.html`, package.json or other Studio branches.

## Previous U02 CI diagnosis
U02 exact SHA `db38bbb1e78328de17ee0208e5e7d9ca5395484d`: Windows Native Rust SUCCESS; frontend 21/21 Node tests SUCCESS, but `npm run build` FAILED because `WorkspaceState` omitted `recoveryStudio` in `core.d.mts`. U03 explicitly restores this declared field. This is an actual CI failure, not a presumed pass.

## Real APIs checked for U03
FilmCraft Video `TimelineAction::Move { clip_id,track,seconds,insert }` uses native `timeline.move` under expected SHA and revision, then saves project, and `video_project_snapshot` permits independent readback. FPS comes from FilmCraft sequence settings `frame_rate.num/den`, never a default.
Motion `motion_command` owner worker exposes `addEffect`, `setEffectParameter`, `toggleEffect`, `removeEffect`, `addPolygonMask`, `removeMask`, `easeKeys` and listEffects/listMasks. Built-ins only Gaussian Blur (`blurriness` 0–100) and Brightness/Contrast (`brightness` -150–150, `contrast` -100–100).

## New UI/functionality
- Native FilmCraft clips displayed on separate actual saved tracks. Horizontal primary-pointer drags are quantized to saved native FPS and clamped to legal visible bounds. Text/number controls allow deliberate clip movement between same-kind tracks.
- `moveVideoClip` uses existing `applyVideo` for SHA/revision guarding and post-save disk readback; it **additionally** verifies the moved clip ID, destination native track and timing to within half a frame. Any mismatch quarantines the video studio and requires refresh.
- Video keyboard shortcuts are active only when no editable field owns focus: Ctrl+Z (Undo), Ctrl+Y / Ctrl+Shift+Z (Redo), S (Split selected), Delete (Delete selected), Left/Right (native-FPS one-frame playhead step and native render). No fake continuous playback.
- Real EffectCraft effects are selected from native UID list and only allow matching typed parameter names; manual apply/update/toggle/remove all run the existing native bridge, with native revision checks. Native layer/effects/masks lists are reread after related edits, and mid-read drift quarantines Motion.
- Manual Easy Ease applies to specified existing keyframe times; polygon mask creation/removal invokes allowlisted real EffectCraft commands. Invalid bounds/UIDs fail without invoking native.
- Unconnected native commands continue to fail closed, no mock previews or provider-generated edits. Motion AI editing remains forbidden without native atomic task/revision guard.

## Tests and limits
`npm test` includes `tests/unified-ui-u03.test.mjs`: rational FPS, pointer geometry and clamping, keyboard focus, native edit receipt/move readback, mismatched readback quarantine, invalid tracks, EffectCraft effect/mask refresh.
`npm run build` checks actual typed frontend compilation; Windows Native CI checks original main Tauri host only (which **does not** mount the unified workspace).
The UI component is still isolated until 2.0.5 reconciles latest Video/Motion/AI native commands. Source tests/mock bridge do NOT imply packaged Windows interactive E2E.

## Integration handoff to Chat 2.0.5
1. Cherry-pick/review U03 owner branch into integration branch (never main automatically). Ensure `@tauri-apps/api/core` typed bridge resolves.
2. Register all original Video and Motion native commands exactly; mount **one** `mountUnifiedWorkspace` in one real Tauri WebView window. No extra EffectCraft workers.
3. Exercise physical WebView pointermove/release and FilmCraft disk save/readback on real native media.
4. Exercise actual Motion effect parameter readback, native PNG render, save/reopen, cancellation quarantine and AI approval gates.
5. Execute real Windows native installer E2E on same exact integrated SHA, collect receipts/screenshots/hashes. Until then status is NOT release-ready.

## Next U04
Review native owner-guard design with Chat 2.0.3 and 2.0.5, split panel responsiveness, read-only inspector keyframe list, persistent project session state and real installed Windows acceptance. No non-native simulated editor.
