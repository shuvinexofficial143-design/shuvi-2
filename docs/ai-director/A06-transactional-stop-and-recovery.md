# Shuvi 2.0.3 — A06 Transactional Native Ledger and Honest Stop

Date: 30 October 2026. Repository: shuvinexofficial143-design/shuvi-2.
Branch: feature/shuvi2-ai-director. PR #4 stays DRAFT and no shared source or other
studio branch was changed.

## What was implemented

1. Native \`src-tauri/src/ai_director/src/transactional.rs\` introduces a
   preferred **SQLite WAL / synchronous=FULL / foreign_keys=ON** task ledger,
   backed by an actual on-disk \`.sqlite3\` file in the owner-chosen private
   application directory. No model or WebView path is accepted by this module.
   Symlink path and relative path are rejected. Host OS must enforce private ACLs.
2. The native ledger stores the full validated typed plan, its SHA-256, one
   durable approval claim, owner-consent result, cancellation state, and exact
   per-step intent and verified readback receipt. \`BEGIN IMMEDIATE\` protects
   duplicate tasks and step admission against concurrent SQLite connections.
   It re-checks cancelled state *inside the admission transaction*.
3. **Approval is one-shot**: the database transaction durably sets
   \`approval=requested\` BEFORE any owner-click prompt. A denied click,
   interrupted consent or process crash cannot automatically reopen approval.
   Only a real host-generated \`OwnerConsent\` implementation can approve.
4. **Stop semantics are accurate**: \`cancel_bound(taskId, planHash)\` can
   cancel only *before the first native intent* or *between already verified
   steps*. If an intent is recorded but the native result is uncertain, Stop is
   refused (the native edit may already have executed). A cancelled task can
   never start a new step. \`recovery_bound\` returns verified/uncertain/
   cancelled/not_started statuses after process restart.
5. Each native edit uses the **same actual native owner lock** as every manual
   edit. It checks exact project/session/version, the persisted approved action,
   native object ID preflight, and a second owner snapshot; it commits a durable
   \`intent\` row before invoking the typed native engine. Any timeout, missing
   native object proof, revision mismatch or process termination leaves an
   \`intent\` without a verified receipt: **UNCERTAIN, NEVER AUTO-RETRY**.
6. \`GuardedStep::execute_transactional\` is the exact typed native IPC
   converter for this new backend. A05 \`ReserveWire::reserve_transactional\`
   recomputes the complete JS plan digest before admitting the task to SQLite.
   The legacy A03 file ledger remains for prior tests, but is NOT the
   recommended production backend.
7. Frontend \`native-stop.mjs\` defines only fixed
   \`ai_director_cancel_task\`/\`ai_director_recover_task\` IPC and refuses
   simulated UI-only stop acknowledgements, fake durability, wrong plan hashes
   or out-of-scope native states. Stop receives \`cancelled:true\` only after
   an authoritative native transaction confirms it.
8. Native on-disk tests (explicit test-double editor) cover plan persistence,
   duplicate reservation/reopen, one approval, denied consent, ordered receipts,
   verified restart, cancel before/between edits, uncertain no-retry,
   preflight fail-before-intent, wrong revision/action, independent object
   proof and two-connection cancellation. JavaScript tests cover missing IPC,
   false stop acknowledgements and read-only recovery.

## Integration handoff to Shuvi 2.0.5

The existing shared Tauri app **DOES NOT register A06 commands**. The
Integration team must implement these fixed native commands through the
real FilmCraft/EffectCraft worker under a single exclusive editor owner:

- \`ai_director_reserve_plan\`: A05 \`ReserveWire::reserve_transactional\`
  after verifying full plan and native owner snapshot; return
  \`{reserved:true,taskId,planHash,durable:true,nativeOwnerBound:true}\`
  only upon committed SQLite transaction.
- \`ai_director_request_owner_consent\`: host-only real owner approval UI
  calls \`TransactionalLedger::approve\` with the identical persisted plan.
  The displayed instruction/project/steps/hash MUST be the same. No renderer
  or model can generate OwnerConsent.
- \`ai_director_execute_guarded\`: parse \`GuardedWireRequest\` and call
  \`GuardedStep::execute_transactional\` under exclusive native owner mutex
  shared with manual editor modifications. The owner must inspect actual
  clip/layer existence and create a SHA-256 of a independently re-read
  affected native object, not a mocked or locally fabricated confirmation.
- \`ai_director_cancel_task\`: authorize task binding and call
  \`TransactionalLedger::cancel_bound\`. Return a durable true cancellation
  only when no step intent is in flight. If intent is uncertain, return
  cancelled=false/state=intent_uncertain, never 'success'.
- \`ai_director_recover_task\`: authorize task binding and call
  \`TransactionalLedger::recovery_bound\`. Recovery is read-only, cannot
  silently replay a step. Return the persisted status for each action.
- \`ai_director_record_audit\`: keep events informational and bounded;
  never let an \`approved\` event bypass the native consent claim.

SQLite database storage must be selected by native app data configuration,
never by chat/model. Use a dedicated file inside the per-user directory with
restrictive Windows ACL and proper installation/uninstallation handling.
Don't import credentials into the ledger or record API prompts/secret keys.

IMPORTANT: The same actual FilmCraft/EffectCraft native owner MUST handle
manual UI commands and guarded AI commands under an atomic, serialized
transaction, including open/revision state changes. The current separate
Studio Draft PRs do not yet prove this. Motion native expectedRevision and
Video external file-lock+SHA CAS must be integrated before release.

## Testing and claims

Run on the **exact A06 HEAD**:
\`\`\`bash
node --test tests/ai-director-core.test.mjs tests/ai-director-a02.test.mjs tests/ai-director-a04.test.mjs tests/ai-director-a05.test.mjs tests/ai-director-a06.test.mjs
npm test
npm run build
cargo test --manifest-path src-tauri/src/ai_director/Cargo.toml
\`\`\`

SQLite WAL and FULL synchronous are an improvement over file-by-file
\`create_new\`, but the tests do **not** simulate abrupt power cuts or
verify Windows file durability under disk-controller cache failure.
SQLite commit does not guarantee external editor video-project writes are
atomic with the task ledger; those writes need their own backups, CAS,
readback, recovery and in-doubt outcome policy. Native invocation and
live editing with the installed Windows app are **not yet proven**.

**Do not claim:** production-ready Windows app, native editor E2E,
signed installer, actual user-click consent, real API token or actual
FilmCraft MP4/EffectCraft rendered output. The source/tests are real,
and the studio integration work still belongs to Chat 2.0.5.
