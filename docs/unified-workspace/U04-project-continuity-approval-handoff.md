# Shuvi 2.0.4 — U04 Project Continuity, AI Scope & Recovery Handoff

Repository: `shuvinexofficial143-design/shuvi-2`
Owner branch: `feature/shuvi2-unified-workspace`.
Source baseline: U03 `3c15baabdb9e7a2f00b4e0071fcb3b9ae7124416` — exact-sha Windows foundation CI **SUCCESS** on run 41011468845.

## Verified upstream boundaries (30 October 2026)
- Video Studio `feature/shuvi2-video-studio`, Motion Studio `feature/shuvi2-motion-studio`, AI Director `feature/shuvi2-ai-director` are independently changing. Do not merge or modify them here.
- AI Director's `validateDraft` supports only fixed Video/Motion action allowlists and a durable journal / external owner-approval gateway; its `native-contract.mjs` explicitly marks `readyForGuardedExecution:false` until a task-scoped native guard is added.
- `src/main.ts` on integration branch `feature/shuvi2-release-integration` still imports `mountVideoStudio`, NOT `mountUnifiedWorkspace`. A combined installed GUI is not proven by isolated frontend CI.
- EffectCraft native `layer_json` exposes `keyframes` as a count. U04 does not claim native keyframe positions or an editable curve API.

## Completed source changes U04
1. `session.mjs`: optional on-device Video/Motion project-path bookmarks. Explicit Remember/Reopen/Forget UI. Only owner-entered and native-verified paths; no project contents, native SHA tokens, generated pixels, chat text or AI approvals persist.
2. Reopen ALWAYS calls real `refreshVideo` or `openMotion`, and only after a direct user click. Bookmark presence does not imply project readiness; invalid or corrupted bookmarks fail closed. Storage-unavailable paths remain disabled/error states.
3. `approval.mjs`: read-only project/approval diagnostics, with explicit `nativeGuarded:false` until 2.0.3/2.0.5 implement native task-scoped owner authorization.
4. `ai-plan.mjs`: exact typed Video plan action validation (place/split/trim/move/delete, 1–12 actions). Reject undo/redo/createSequence, unapproved keys, invalid IDs, nonfinite coordinates, wrong tracks and spoofed prototypes. Stage binds selected project root, canonical path and SHA. A successful re-inspection clears stale staged proposals.
5. `keyframes.mjs`: read-only EffectCraft native count; unknown count shown as unavailable, not invented key times.
6. Motion save/open: if disk operation post-readback or native status fails/drifts, quarantine Motion and require native refresh. A failed Motion reopen discards stale composition UI state rather than advertising readiness.
7. Single-window Chat width slider with bounded 240–420px layout and mobile/tablet responsive fallback; listeners and CSS cleanup on dispose.
8. U04 automated tests cover opt-in storage and corrupt records, exact AI schemas, approval diagnostics, staged-Video owner gating, current project isolation, native Motion failure quarantine, and UI controls.

## Safety and privacy
Bookmark persistence is local to the installed WebView's storage and opt-in. It is a path pointer, not a verified project checkpoint. If WebView storage is denied, UI reports it unavailable.
Native IPC must still verify filesystem ownership, project readback and atomic expected version server-side.
The current manual Video approval controller is not a substitute for AI Director's durable journal, native idempotency, task-scoped guarded execution or one-approval UX.
Never silently promote a frontend success flag to a claim of installed Windows GUI, Premiere parity, Motion guarded AI execution or AI provider activation.

## Reproduce U04
- `npm test` (includes U04 test suite)
- `npm run build` (TypeScript 5 and Vite)
- Inspect exact SHA Windows foundation CI run, including separate frontend/native steps.
- On the *integration* branch only: bind `mountUnifiedWorkspace` to the existing single WebView2 host; register current Video and Motion native commands. Prevent multiple independent engine worker mounts.
- Physical Windows GUI E2E: enter real FilmCraft root and .fcproj, open, remember, reopen via user action, confirm fresh SHA and clip state; save/reopen EffectCraft .ecproj, inspect only real keyframe count, edit Motion effects, trigger status recovery after an actual native failure, test chat width and one-approval task stop behavior.
- Persist actual screen/action receipts and installed installer identity. Do not accept a mocked DOM test as the physical Windows gate.

## Next U05 ownership
Integration chat 2.0.5 must wire the actual Windows shell, live AI Director through a reviewed durable journal/native guard, and real physical WebView2 tests. Unified UI work may add nonconflicting accessibility, editing diagnostics and native readback panels; no shared Tauri or entrypoint edits without the integration owner.
