# Shuvi 2.0.3 — A04 Native Desktop Handshake & Credential Vault

Date: 2026-10-30. Branch: `feature/shuvi2-ai-director`. Source-only work in AI-owned paths. Shared `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src/main.ts`, `index.html`, FilmCraft/Motion branches and `main` unchanged.

## Verified source-of-truth (latest inspected branches)

- Video PR #2 (head `e7a62cf801e83052089512fb2feef59a024722bf`): `video_project_snapshot` takes `{selectedRoot,projectPath}`, returns `projectPath`, `projectSha256`, `sessionRevision`, `project` and `sequence`; `video_timeline_apply` takes a typed `TimelineRequest`, uses SHA check and headless CLI. **It has no native AI approval + atomic durable idempotency transaction**, and external-save races need integration handling.
- Motion PR #1 (head `dea267247c333143e08c37bda11bcca3e6d78b1f`): `motion_command` `{request:{action:"status"}}` returns `{ready:true,native:true,engine:"effectcraft",projectRevision,dirty}`. The active `MotionHost` owns a native worker but there is no native expectedRevision+approval+idempotency guard.
- Unified UI PR #5 (head `3c15baabdb9e7a2f00b4e0071fcb3b9ae7124416`) has real manual editing IPC mappings, still not mounted in the combined binary. The integration chat 2.0.5 owns shared files and must reconcile the branches; no merges here.

## A04 code

1. `desktop-bridge.mjs` performs real native *read-only* IPC using the existing exact command names. FilmCraft requires actual project path + SHA and EffectCraft requires native readiness/revision. Both require a trusted owner session nonce; the current Studio APIs don't supply that nonce, so it must come from the native unified host. Owner switching during readback rejects the snapshot.
2. A future `ai_director_capabilities` fixed Tauri command must attest ALL of `nativeGuarded`, `sameOwnerAsManual`, `ownerConsent`, `durableIdempotency`, `independentObjectReadback`, `version:1`. Until it is registered and truly implemented, native AI execution fails closed. The adapter never uses unsafe `video_timeline_apply` or raw `motion_command` for AI edits.
3. `ai_director_execute_guarded` receives exact typed owner/task/idempotency/project/action fields. Native implementation MUST compare consent + plan + current native state and atomically record the intent in the same exclusive owner as manual UI; use A03 guard and verify the actual affected object. Only native receipts with a matching idempotency key, task ID, step number and affected-object SHA-256 can be accepted. The JavaScript Director also independently re-reads native state.
4. `native-approval.mjs` uses only `ai_director_request_owner_consent`; the native owner must show a real user-initiated approval view for the exact plan hash. A JavaScript `confirm()` result or an LLM answer is NOT approval.
5. `windows_vault.rs` implements `CredentialVault` for actual Windows Credential Manager using the fixed Generic Credential target `Shuvi2/OpenAI`. It reads only in native Rust, never receives a secret via WebView. The owner must provision a UTF-8 Generic Credential securely via an owner-operated native setup view. No credential is included in tests or repository. The native OpenAI provider remains unregistered until the integration app is reviewed.
6. `tests/ai-director-a04.test.mjs` uses clearly marked IPC test doubles to verify the exact call/response mappings, fail-closed readiness, plan/snapshot checks, one-owner consent and a one-action logical pipeline. This is **not** live FilmCraft/EffectCraft editing, a real OpenAI request or a Windows WebView2 acceptance.

## Specific 2.0.5 integration patch contract

- Add AI provider crate to `src-tauri/Cargo.toml` as a reviewed path dependency.
- Register only the three names above plus `ai_director_model_propose` with typed, fixed Tauri request structs.
- Bind a native owner session ID to project open/restart; status+native revision must come from same ownership transaction as guarded edit; manual UI and AI must NEVER write separate snapshots in parallel.
- Host Windows Credential Manager setup needs explicit user intent; the model must never get an API key. No fallback JS credential or environment-output logging.
- Ensure every native edit is in a single owner's checked transaction: approval plan digest, project identity, expected version, durable intent, exact typed operation, independent object readback and verified output receipt.
- Verify manual edit while AI plans triggers STALE_PROJECT, duplicate task retries fail, unknown/timed-out native state enters UNCERTAIN; never report complete if a native output or one of these safety steps is missing.
- Windows-native actual app E2E: open an existing .ecproj -> type 'create title, change opacity, render' -> review plan -> **one real owner click** -> two exact native edits with accepted IDs -> native render -> disk save/reopen -> exact image/scene revision readback. New IDs from previous steps require explicit verified binding support, not invented model numbers.
- Keep this PR DRAFT and unmerged pending exact Windows native-guard + real WebView2 tests and source integration review.

## Tested commands

```sh
node --test tests/ai-director-core.test.mjs tests/ai-director-a02.test.mjs tests/ai-director-a04.test.mjs
npm test
npm run build
cargo test --manifest-path src-tauri/src/ai_director/Cargo.toml
```

**Important:** A03 uses a file-based task ledger whose Windows sudden-power-loss durability and cross-process write locking are not production proven. This remains a blocker even if all A04 tests pass; a transactional persistent native ledger with user-ACL protection should replace/harden it in integration. Do not assert 'working desktop AI' from these source tests.
