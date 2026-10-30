# Shuvi 2.0.3 — A08 Verified Receipt Chain + Restart History

Date: 30 October 2026. Source branch: `feature/shuvi2-ai-director` in `shuvinexofficial143-design/shuvi-2`. Draft PR #4 remains unmerged. Shared Tauri root, FilmCraft, EffectCraft and Unified UI branches were not modified.

## A08 defect audit and shipped source changes

**Defect 1 — corrupt verified receipts:** A06 SQLite `recovery()` previously mapped every `ai_steps.state='verified'` row to a verified UI status without revalidating that row's persisted action key, native object proof and before/after revision chain. An inconsistent journal could thus be displayed as verified. A08's `checked_steps()` independently recalculates every step key from the persisted plan hash, step index and native-typed action, checks contiguous indices, disallows later rows after uncertain intent, and validates the entire receipt: exact task ID, step ID, key, native verified flag, originating snapshot, monotonic revision/SHA progress and affected-object SHA-256 shape. A damaged record is fail-closed `DuplicateOrUncertain`—**never success or auto-retry**. `recover()`, `cancel()` and `execute_bound()` now apply the same chain validation; edit admission verifies the chain inside its SQLite IMMEDIATE transaction. SQLite `ai_tasks.plan_hash` column must match `scope_json.planHash`.

**Defect 2 — connected JS receipts:** A07 connected Director relied on a guarded-success flag and key; its default Desktop adapter validated native object proof but omitted it when returning to the Director. A08 carries through `taskId`, `stepIndex` and `objectProofSha256`. With native Stop/recovery ports connected, the Director requires all three to match the expected native action and displays the SHA with each verified step receipt. Incorrect task, step or object proof is uncertain and never reported complete. This check is additive to the native SQLite owner lock and independent native readback.

**Defect 3 — in-memory task history lost on restart:** The frontend task Map cannot reconstruct the history of a previous session. A08 adds native `TransactionalLedger::recent_history(currentNativeSnapshot)` and `GuardedHost::task_history()`, scoped to the actual native owner's currently selected project (not to a caller-supplied path). It reads at most 256 recent DB rows and returns at most 50 project-matching tasks, checking each saved receipt chain. The response identifies older native sessions as historical. The `native-history.mjs` fixed `ai_director_task_history` IPC contract is **read-only**: no path/IDs in request, strict reply/schema validation, no duplicated IDs, `canResume:false` for all historical entries. The UI must never automatically restart an old edit, even if it was once fully verified.

## Source and tests

- Native: `src-tauri/src/ai_director/src/transactional.rs` and `host.rs`.
- JS: `src/ai-director/desktop-bridge.mjs`, `director.mjs`, `native-history.mjs`.
- Windows Rust on-disk tests: `src-tauri/src/ai_director/tests/recovery_integrity.rs` — valid restart, malformed/missing receipt, altered keys/index/project/approval/proof/version, intent with improper extra rows, cancellation/execution blocked, other-project isolation, corrupted recent history.
- JS tests: `tests/ai-director-a08.test.mjs` (connected native object receipt proof, incorrect task ID/step, false readiness) and `tests/ai-director-a08-history.test.mjs` (read-only historical session, limited histories, project isolation, rejection of malformed and duplicate records).
- All native owners and IPC transports in the tests are **explicit test doubles**; this is not a live FilmCraft/EffectCraft production E2E.

## Exact 2.0.5 integration handoff

Integration team must register `ai_director_task_history` with **no request path/IDs** and call `GuardedHost::task_history()` under the actual selected native editor owner, using the same SQLite ledger and exclusive native lock as every manual UI action. Its response is `{nativeOwnerBound:true,readOnly:true,projectId,sessionId,tasks}`. Render historical tasks in a read-only recovery/diagnostics view, highlighting uncertainty without a Resume/Retry button. This does not change any native action authorization or task session binding. If SQLite history fails validation, show an error rather than invented verified counts.

Other integration blockers remain the same: native Tauri command registration, exclusive manual+AI engine owner, real owner-click consent from original SQLite plan, Windows Credential Manager setup, actual FilmCraft/EffectCraft edit and affected-object readback, save/reopen/export, Windows private ACLs and signed desktop build.

**Trust boundary limitation:** SHA-256 consistency checks detect broken or inconsistent receipts. They are **not a MAC/signature** and do not prove integrity against an attacker who can rewrite an unprotected database and recalculate hashes. Production must protect database/SQLite WAL/SHM via per-user Windows ACLs and verify native engine output. SQLite WAL `synchronous=FULL` does not make editor project writes atomic with SQLite; crash/power-loss testing is still required.

## Windows CI gate

```shell
node --test tests/ai-director-core.test.mjs tests/ai-director-a02.test.mjs tests/ai-director-a04.test.mjs tests/ai-director-a05.test.mjs tests/ai-director-a06.test.mjs tests/ai-director-a07.test.mjs tests/ai-director-a08.test.mjs tests/ai-director-a08-history.test.mjs
npm test
npm run build
cargo test --manifest-path src-tauri/src/ai_director/Cargo.toml
```

No successful live editing, actual owner click, installed app, real API usage or signed release is claimed by these source tests. Keep PR #4 Draft and do not merge until native Studio and Integration 2.0.5 acceptance is verified.
