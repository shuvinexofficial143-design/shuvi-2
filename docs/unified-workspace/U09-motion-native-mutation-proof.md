# Shuvi 2.0.4 — U09 EffectCraft Native Mutation Proof + Readback

**Owner branch:** `feature/shuvi2-unified-workspace` only. Baseline U08 `650dc8a189b2890ad55df77aed1d3814b30e6dbf`. Exact U08 CI run `41024009109` completed **SUCCESS**, including Windows Rust native job and frontend 94/94 tests + TypeScript/Vite build. Foundation CI does not run a physical integrated Windows WebView2 edit.

## Research: verified native contracts
Looked at actual Motion source on `feature/shuvi2-motion-studio` (`src-tauri/src/motion/mod.rs`, `crates/shuvi-motion-bridge/src/layers.rs`, `animation.rs`, `effects_masks.rs`).
- `addText`, `addShape`, `editText`, `setTransform` return an EffectCraft `layer_json` snapshot with real IDs, kind, transform, revision. Text content is read back internally by the Rust bridge; `listLayers` does not expose arbitrary source text.
- Native layer snapshots include an aggregate **keyframes count**, not the per-key timeline. The native `addKey`/`easeKeys` implementation verifies actual key time/value or easing before returning. The UI does not invent key positions or arbitrary animations.
- `addEffect`, `toggleEffect`, `removeEffect`, `setEffectParameter` and polygon mask mutations return native UIDs/readbacks. `listEffects` and `listMasks` can verify instance existence, enablement, closed polygon geometry and deletion.
- Native worker's status exposes a monotonically increasing `projectRevision` after edits. A revision increase by itself is **not** sufficient proof of the requested specific edit.

## U09 changes
1. `motion-proof.mjs` provides read-only independent post-edit receipts/geometry checks, rejecting spoofed or incomplete `addText`, `addShape`, `editText`, transform, keyframe, effect and mask outcomes.
2. After every `editMotion`, native `status` → `listLayers` → optional `listEffects`/`listMasks` → second `status` readback is required. Worker drift, missing native layer, absent UID, invalid transform or missing proof quarantines Motion; the UI cannot claim success.
3. Effect and Mask commands always independently re-read their target instances **even if the operator never previously opened the Inspector**. The confirmed target is then shown in the native inspector.
4. New Text/Shape commands now select and re-inspect only the returned genuine native-created layer ID; they do not paint an overlay or choose a guessed ID.
5. On creation, edit, removal and keyframe operations, the native engine continues to enforce typed limits, permissions, and any source-text/key interpolation internals unavailable through list layers.
6. U03 compatibility test fixture was updated to return `closed:true` on a created polygon mask, matching the real EffectCraft `mask_json`; this is a fixture correction, not an unimplemented feature.

## U09 tests
`tests/unified-ui-u09.test.mjs` adds 14 cases: true native text/shape identity, failed readback quarantine, typed property transforms and exact coords, keyframe count provenance, independent effect/mask readback without prior Inspector, parameter/toggle/remove UID proof, post-write status drift, fake receipts and selected-layer UI flow. Existing U01–U08 tests must remain green.

Run `npm test`, `npm run build`, and exact SHA Windows native foundation CI, then verify results rather than assuming green.

## Release and AI integration boundary
`src/main.ts`, `src-tauri/**`, `main`, FilmCraft/EffectCraft owner branches and the AI Director branch were **not modified** here. Integration owner Shuvi 2.0.5 must mount the unified UI, register the real native commands in a single WebView2 process and physically test Motion edit/render/save/reopen/stop; only then can the Windows application be considered E2E-verified. AI origin editing remains blocked without the separate durable journal, owner approval and native atomic task/revision guard.
