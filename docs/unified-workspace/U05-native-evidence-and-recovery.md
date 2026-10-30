# SHUVI 2.0.4 — U05 Native Evidence & Recovery

## Ownership & checkpoint
- Repository: `shuvinexofficial143-design/shuvi-2`
- Branch: `feature/shuvi2-unified-workspace`; base commit `5021093223d72369ffab6a5fe40c2b587ee39dee`
- Previous U04 foundation CI: `41016985529`, **frontend SUCCESS + native SUCCESS**.
- This is **not** a deployed Windows installer, not a mounted single-window Studio binary, and not an integrated AI Editor.

## Implemented U05
1. `src/unified-workspace/diagnostics.mjs` derives a read-only session evidence report from native readback-backed state and operation outcomes. The report deliberately excludes selected local paths, chat, project titles, raw IPC receipts, media bytes and approval secrets. It explicitly declares `installationVerified:false` and `aiNativeTaskGuardVerified:false`.
2. The shared controller retains at most 48 ordered, session-local operation evidence events; only fixed operation labels, outcomes and allowlisted error codes are recorded. The report displays the latest 25 events; it is **not** a durable journal, and must not be confused with AI Director's task-scoped audit journal.
3. Native `verifyVideoSnapshot()`: independent FilmCraft project readback must match both disk SHA and session revision. A mismatch or unavailable readback quarantines the Video studio until an explicit refresh; no edit request is sent.
4. Native `verifyMotionSnapshot()`: EffectCraft worker status + optional composition/layer readback + second status must maintain the same revision. Drift/IPC errors quarantine Motion, with preview/inspector invalidated. No effect, keyframe or text mutations occur.
5. All critical *mutating* Video and Motion command paths now treat a thrown native call as an unknown outcome: further editing blocked until the real native state is re-inspected. Existing typed guards and native SHA/revision checks remain mandatory.
6. Explicit FilmCraft reopen increments `videoGeneration` even for the same SHA. Motion create or native reopen increments `motionGeneration`. The UI clears a previously selected clip/layer on generation change, preventing the wrong project from inheriting coincidentally reused numeric IDs. Ordinary edits preserve current selection.
7. Single-window editor adds **Verify disk checksum**, **Verify worker revision** and expandable **Native evidence & recovery diagnostics**, with optional copy to OS clipboard if supported by WebView permissions. No simulated success if clipboard is unavailable.
8. Accessibility: native diagnostics are text-based and do not require a new window, desktop app or non-native preview.

## Test plan
- `npm test` includes `tests/unified-ui-u05.test.mjs` (12 regression checks): matching/mismatching native readback, uncertainty quarantine, bounded evidence, privacy redaction, reopened session generation, Motion external revision changes, UI wiring.
- `npm run build` runs TypeScript and Vite; verify actual results on the **new exact SHA**.
- `cargo test --manifest-path src-tauri/Cargo.toml` covers current Windows native code, but cannot prove the integrated UI has been mounted or exercised with real pointer events.
- Do not claim a native Windows E2E without a single combined Tauri executable, real FilmCraft/EffectCraft media files, actual WebView2 interactions, save/reopen verification and captured native receipts.

## Handoff to Shuvi 2.0.5 / AI Director
The integration branch `feature/shuvi2-release-integration` still mounts the separate Video Studio in `src/main.ts` as of the U05 read-only audit. Only the integration owner should resolve single-window mount and command registration, not this UI branch. AI guarded execution requires durable task reservation, owner approval and native atomic expected version/idempotency. Frontend `approveTask` and diagnostic badges are **not** a substitute. Release block remains open until integrated installed Windows validation succeeds.

## Known limitations
Project bookmarks are explicit path references only, not autosave/checkpoints. Operation evidence is volatile, privacy-redacted and not a durable audit log. UI interaction tests use mock bridges, not a Windows-installed compositor. External Video Studio and Motion Studio branches remain independent, and user media is never copied by this milestone.
