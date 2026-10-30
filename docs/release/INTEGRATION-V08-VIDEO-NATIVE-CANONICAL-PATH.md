# Shuvi 2.0.5 V08 — FilmCraft canonical native readback fix

Based on real V06 Windows 2022 CI run 41023344644, exact commit 81d8f423c32dab0bffec123feca49080205a6782, evidence artifact 12963557610, preserved screenshots and JSON receipts.

## Proven native E2E status
- NSIS unsigned installer actually built and installed; both EXE and FilmCraft sidecar byte hashes matched; a real installed app launched.
- Motion WebView2 E2E **PASS**, installed EXE SHA `8546c791cc58ff45d5fa9154ca1c2a232801d149c60048adf5e087b557d330f5`; native shape, effect, mask, true PNG export and saved/reopened `.ecproj`, pixel hash `f6a8809841e0955649b58af7dc8bfbf6cf9e8f15959742a24155c6053a1b63aa` persisted after a real cold restart.
- Video same installed app: import real MP4 passed; creating the first sequence failed with `Open / Refresh the selected project first`. Screenshot and failure HTML contain 1 native imported media item, 0 clips, active snapshot and successful media import. Thus prior media import did not fail and the UI's next-step identity guard is the blocker.
- Unified E2E correctly failed prerequisites because Video had no PASS receipt. It **did not** claim GUI success.

## Root-cause and targeted edit
`src-tauri/src/video/timeline.rs::checked_project` uses `fs::canonicalize(file)`. The Windows runner temp project path typed into Video UI uses a short DOS alias `RUNNER~1`; native snapshot `projectPath` is the OS canonical path. `src/studios/video/view.ts::request()` previously compared this canonical path against the unchanged raw typed input lowercased. It rejected legitimate edits even though native import and project snapshot succeeded.

After both project and history native reads confirm the same saved SHA, `load()` now rejects concurrent selection changes, checks the native path looks like a Windows `.fcproj`, writes **the verified canonical native path** back to the project input, and then publishes the snapshot/draw. The strict `request()` project identity check remains enabled; no bypass, no accepting a fake snapshot. The installed Video GUI script independently verifies original and canonical aliases read identical on-disk bytes and checks canonical input persists across Video → Motion → Video tab switching.

`src/main.ts` removes the obsolete `Live Editor Integration Pending` static M0 splash after actual FilmCraft Video editor mount, leaving real native Video and Motion UI. It labels AI offline and runtime as needing verification, no false readiness.

## Remaining
V08 exact-commit full Windows CI still must pass FilmCraft sequence/place/undo/redo/preview/export, Motion E2E, Unified readback and cold restart. Native AI model-to-editor atomic approval remains unconnected. **Release NOT READY.**
