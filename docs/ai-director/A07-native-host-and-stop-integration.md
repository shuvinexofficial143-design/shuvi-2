# SHUVI 2.0.3 A07 — Native Host Command Boundary + No-Fake-Stop

Date: 2026-10-30. Repository: shuvinexofficial143-design/shuvi-2.
Branch: feature/shuvi2-ai-director; Draft PR #4. Integration branch
2.0.5 owns src-tauri/src/lib.rs and shared Vite/WebView bootstrap files.
This branch modifies ONLY the AI Director-owned paths.

## Real A07 implementation

1. **Native Rust host command service** in
   \`src-tauri/src/ai_director/src/host.rs\` wraps the existing A06
   SQLite WAL/FULL \`TransactionalLedger\` and the A05 strict
   \`ReserveWire\`/A04 \`GuardedWireRequest\`. It exposes a fixed
   host-owned sequence: \`reserve\` -> \`request_consent\` ->
   \`execute\` -> \`cancel\`/\`recover\`. A typed \`GuardedHost<'a,O>\`
   borrows the single native owner and ledger: the desktop integration
   must ensure manual and AI editing use the SAME editor lock.
   No arbitrary Tauri string dispatcher, OS process, HTTP endpoint,
   file path, or model tool is exposed.
2. **Approval comes from the persisted plan, not the WebView:**
   \`OwnerConsentRequest\` accepts ONLY \`{taskId,planHash}\`; extra
   fields, fake \`approved:true\` and renderer-mutated actions are
   rejected. \`verify_binding\` checks the native SQLite task hash
   BEFORE the trusted native \`OwnerConsent\` prompt is shown.
   Native UI must render the original stored \`Scope.instruction\`,
   project/session/plan hash and approved actions. The result reports
   \`nativeOwnerInteraction\` only after calling the native owner gate.
   The one-shot prompt claim remains durable in SQLite, so denial,
   crash or second click cannot re-authorize.
3. **Stop is native only in connected mode:**
   \`AiDirector\` now accepts a \`nativeStop\` port and adds
   \`stopNative(taskId)\` / \`recoverNative(taskId)\`. When connected,
   old \`cancel(taskId)\` throws \`NATIVE_STOP_REQUIRED\` rather than
   falsely labelling an in-flight edit cancelled. Only the fixed
   \`native-stop.mjs\` transport reading an actual SQLite-committed
   \`cancel_bound(taskId,planHash)\` acknowledgement can set local
   cancellation. Refused Stop with an in-flight native intent stays
   \`cancelled:false\` and lets the actual edit's native readback
   determine the final outcome. Recovery reads only persisted states,
   never blindly retries an action.
4. The \`GuardedHost\` maps backend results to exactly the documented
   safe IPC response shape: \`reserved/durable/nativeOwnerBound\`,
   \`granted/taskId/planHash/nativeOwnerInteraction\`, typed guarded
   result with exact native object proof, and Stop states
   \`before_first_edit\`, \`between_verified_steps\`,
   \`intent_uncertain\`, \`already_cancelled\`, \`already_complete\`.
5. **Fail-closed readiness:** \`unintegrated_capabilities()\` returns
   false for every native editing gate. A missing Tauri registration
   or manual-editor lock means the app MUST NOT advertise
   \`ai_director_capabilities.nativeGuarded=true\`.

## Exact 2.0.5 integration work that is STILL required

- Review and merge source from Video PR #2, Motion PR #1, Unified UI
  PR #5 and this Draft PR #4. Do not merge automatically or overwrite
  concurrent changes.
- Register the fixed Tauri commands in the reviewed shared
  \`src-tauri/src/lib.rs\`: \`ai_director_reserve_plan\`,
  \`ai_director_request_owner_consent\`,
  \`ai_director_execute_guarded\`, \`ai_director_cancel_task\`,
  \`ai_director_recover_task\`, and the read-only/fixed
  \`ai_director_capabilities\` + \`ai_director_model_propose\`.
- Use a native APP-OWNED SQLite database under a user-private directory
  with protected Windows ACLs. The frontend NEVER supplies a database
  path or a credential to the native host. No fallback JS key storage.
- Implement a real \`NativeOwner\` for FilmCraft and EffectCraft with
  **one exclusive admission+mutate+readback lock used by all manual and
  AI commands**. The current MotionHost queue and FilmCraft subprocess
  paths do NOT yet establish an atomic task/session CAS across every
  manual editor change. Until that is fixed, keep A07 capability gates
  false and AI editing disabled.
- Implement real Windows owner consent: show persisted typed plan and
  one-click approval through trusted native UI, not renderer-built
  approval booleans. OwnerConsent must not be constructible by the model.
- Protect a video .fcproj with project SHA+owner session and no overwrite,
  or bind Motion project revision+session in the EffectCraft worker before
  AI calls; verify the actual affected native clip/layer and saved/rendered
  bytes by trusted native readback. The JS model cannot generate IDs for
  newly created layers without a separate verified binding mechanism.
- Validate true Windows WebView2 integration: open actual project, AI
  proposal from real provider with Windows Credential Vault, one owner
  click, native edit, native output readback, save/reopen/export, no
  duplicate edits after crash/cancel, and installer build on exact
  integrated HEAD.

## Proof and limits

New tests are in \`src-tauri/src/ai_director/tests/native_host.rs\`
(8 host-on-SQLite cases with **explicit test-double NativeOwner**) and
\`tests/ai-director-a07.test.mjs\` (8 JS native-Stop/approval/race cases
with explicitly stubbed IPC). These are real source and on-disk
SQLite tests, **NOT** a live Windows desktop edit.

\`\`\`
cargo test --manifest-path src-tauri/src/ai_director/Cargo.toml
node --test tests/ai-director-core.test.mjs tests/ai-director-a02.test.mjs tests/ai-director-a04.test.mjs tests/ai-director-a05.test.mjs tests/ai-director-a06.test.mjs tests/ai-director-a07.test.mjs
npm test
npm run build
\`\`\`

No merged app, live API credential, real FilmCraft/EffectCraft AI edit,
native WebView2 owner-click acceptance, crash-power-loss guarantee or
signed installer is claimed from this code alone. Keep Draft PR #4
unmerged pending 2.0.5 integration and Windows E2E proof.
