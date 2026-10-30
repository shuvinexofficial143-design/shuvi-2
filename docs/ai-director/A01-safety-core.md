# Shuvi 2.0.3 — A01 AI Director safety core (2026-10-30)

## Scope and source verification

- Repository: `shuvinexofficial143-design/shuvi-2`.
- Branch: `feature/shuvi2-ai-director`, based on initial `main` at `de53c060111909351ba73744a5e652a7cdc21276`.
- Video contract inspected from `feature/shuvi2-video-studio`: `video_timeline_apply`, `video_project_snapshot`, `video_import_media`, `video_export_mp4`, and SHA-256 project guard. Video edits reopen a FilmCraft CLI process; session revision is **not** a persistent concurrency token.
- Motion contract inspected from `feature/shuvi2-motion-studio`: one long-lived `MotionHost` EffectCraft worker, `motion_command` tagged action requests, native project revision, native preview and disk export. Current `MotionRequest` does **not** atomically compare an AI-supplied project revision or own a task-scoped approval/duplicate-edit ledger.
- Source branches are **not merged** and may advance. Refresh exact heads before integration.

## What A01 actually provides

`contracts.mjs`: explicit allowlist of Video place/split/trim/move/delete and Motion create-composition/add-text/edit-text/add-shape/set-transform/add-effect/set-mask-property. All actions have strictly enforced fields, bounds, project/editor identity, 12-action limit, disallowed unexpected keys and no free-form IPC, shell, filesystem output path or arbitrary property write.

`director.mjs`: owner-snapshot-bound prepared plan with SHA-256 digest, durable reservation contract, one task/one trusted approval, single-flight execution, fresh project check before every edit, journaled intent before dispatch, native receipt + second independent readback, deterministic per-step idempotency key, cancellation between edits, terminal blocked/denied/uncertain states and no automatic mutation retry. If native execution times out or is uncertain, **never** send that step again automatically.

`native-contract.mjs`: a **static read-only preview** mapping approved actions to the real FilmCraft/EffectCraft Tauri IPC command names and payloads. The preview explicitly sets `readyForGuardedExecution: false`; it is not itself an engine adapter and cannot edit anything.

`tests/ai-director-core.test.mjs`: isolated contract/regression tests with clearly labelled fake editor and fake approval. These tests are NOT proof of actual Windows editing, a real AI provider or an app UI.

## Integration contract for Shuvi 2.0.5

Integration must provide **trusted host-owned** ports, never language-model-generated implementations:

1. `adapter.readSnapshot(): Promise<{engine,projectId,sessionId,version}>`. Video version is actual project bytes SHA-256. Motion version is the same active owner's monotonic project revision and session ID that changes whenever the Motion worker/project is replaced.
2. `approval.request(preview)`: an actual owner-interacted UI consent action. Return `{granted:true, taskId, planHash}` only for the *exact displayed task*. The LLM cannot call this callback or create its proof.
3. `journal.reserve({taskId,planHash,project})`: **atomic durable** check-and-insert; return false for previously reserved task even after restart. `journal.append(event)` persists ordered audit events/step intents and verified receipts. A plain in-memory Map is insufficient for real editing.
4. `adapter.executeGuarded({action,expectedSnapshot,idempotencyKey,taskId,stepIndex})`: check task approval, session identity, exact version, duplicate key and permitted action **atomically inside the native owner** immediately before mutation; execute the selected native command only once; persist its result; perform native project readback. Return `{guarded:true,nativeVerified:true,idempotencyKey,after:{engine,projectId,sessionId,version}}` only for actual confirmed native state, not optimistic UI state. The JavaScript second readback must agree. The adapter must implement lock/reconcile on unknown outcome.

### Critical native gap (do not bypass)

- The existing Video SHA-256 guard protects against many stale files, but its own documentation identifies a remaining external-save race. A true compare-and-swap / owner lock and durable per-step idempotency ledger are still required.
- The existing Motion worker queues requests (bounded), but its `motion_command` API does not yet accept expected revision, approval token or idempotency key. Integration must add a *single-owner* atomic guarded dispatch without exposing raw EffectCraft commands or touching this branch's files.
- For Video, convert stable `projectPath` and exact `projectSha256` from `video_project_snapshot`; keep `sessionRevision` only for protocol compatibility. For Motion, preserve worker session continuity with manual edits and add an engine session nonce/project identity to native readback.
- Owner-picked root, media source and output destination are host-scoped capabilities. No arbitrary model-selected absolute paths. Exports will be enabled in later milestones only after their own no-overwrite receipt and idempotency protection.
- Steps that require IDs created earlier in the same AI plan must be planned from a fresh native readback (or use explicitly verified result bindings in a later milestone). Never invent native IDs.

## Build and proof

```bash
node --test tests/ai-director-core.test.mjs
npm test
npm run build
```

The isolated A01 branch adds `.github/workflows/ai-director.yml` to test the exact branch HEAD on Windows with Node 22. Workflow success verifies only the planning/approval/orchestration code, not real native engine execution.

## Next milestone

A02: real provider adapter, secret-storage boundary, schema-constrained plan parsing, owner-controlled plan preview. Then A03/A04 true guarded native Video/Motion dispatch and A05 reviewed single-window integration, with separate Windows WebView2 proof. Do not modify `main`, the Video/Motion source branches, old Shuvi 1 or shared Tauri glue from this branch.
