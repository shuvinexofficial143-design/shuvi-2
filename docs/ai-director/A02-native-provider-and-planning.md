# Shuvi 2.0.3 — A02 Model Planning & Native Provider Boundary

## Scope (30 October 2026)
Isolated in \`feature/shuvi2-ai-director\`. No shared Tauri integration file, FilmCraft/EffectCraft branch, main, or old Shuvi-1 repo was changed. This is production-oriented implementation **source**, not a verified working AI desktop editor.

## Delivered
- \`src/ai-director/provider-gateway.mjs\`: fixed trusted native IPC name \`ai_director_model_propose\`; renderer receives **no credentials**, endpoint, file paths or editor execution tool. Provider failures are sanitized and fail closed.
- \`src-tauri/src/ai_director\`: standalone Rust crate with a **real** fixed HTTPS request implementation to OpenAI, bounded input/output/time, non-following redirects, no automatic retries and zeroized vault-returned secrets. A \`CredentialVault\` trait requires the owner-controlled host keyring/credential store. No fallback to JavaScript API keys or arbitrary HTTP URLs.
- \`planner.mjs\`: strict parse, 12-step cap, exact A01 command schemas, IDs constrained to fresh trusted native inventory, no invented outputs/IDs or cross-editor commands, project snapshot before/after inference and prepare-time atomic snapshot recheck.
- \`preview.mjs\`: deterministic read-only review including exact plan digest, editor session, project version and explicit \`approved:false\` / \`readyForGuardedExecution:false\`.
- \`director.mjs\`: an optional trusted \`expectedSnapshot\` requirement; it rejects edits made after inference but before reservation, preventing an old model draft from silently binding to a newer project.
- \`tests/ai-director-a02.test.mjs\`: isolated contract/security regression tests. Fake gateways are explicitly test doubles and **do not** prove a live OpenAI API call or desktop editing.
- A01 Windows test failure fixed without weakening the owner-scoped path rejection.

## Native Integration Contract for 2.0.5
1. Register the exact command \`ai_director_model_propose\` in the reviewed unified Tauri host, using \`NativeModelRequest\` and \`OpenAiProvider\` from the isolated crate; **do not** register a generic HTTP/proxy/shell command.
2. Implement \`CredentialVault::openai_key()\` with owner-mediated, securely stored OS secrets. Do not expose secrets in WebView events, IPC payload, logs, diagnostics or GitHub. Never automatically accept/remember a key from an untrusted model answer.
3. Supply \`invoke\` from a trusted Tauri host, not from the model. The command returns only JSON text \`{"reason":"...","actions":[...]}\`; it cannot mutate the editor.
4. Read numeric native IDs from the current active FilmCraft or EffectCraft owner session to populate \`inventory\`. Do not trust IDs, project paths, or revisions produced by model text or a chat turn. IDs created by earlier steps cannot be guessed; later milestone may add strictly verified step-result references.
5. Use \`prepareModelPlan\` then \`buildReviewPreview\`. Show exact plan digest and all steps to owner. The owner manually grants one scoped approval via a separate trusted UI; **never** model-authorize the task.
6. Native \`executeGuarded\` is NOT implemented here. Before A03 may use real editing, implement atomic expected-revision compare-and-swap in the native engine owner, durable task/step idempotency ledger, project/session binding and independent native readback. Existing Video/Motion APIs are not yet sufficient. On timeout or uncertain outcome, stop without replay.

## Verification commands
\`\`\`shell
node --test tests/ai-director-core.test.mjs tests/ai-director-a02.test.mjs
npm test
npm run build
cargo test --manifest-path src-tauri/src/ai_director/Cargo.toml
\`\`\`
Rust tests only verify request construction and fail-closed boundaries; they do not use a live credential or send a network request. Live API verification is pending secret-store connection and owner-supplied key. Windows WebView2 human E2E, unified Video/Motion host, guarded native dispatch, actual output project and installer remain unverified until their own proof.

## Future
A03 native guarded adapter and task journal (owned by Integration team for shared glue); A04 provider-invoked real plan preview in the actual Windows desktop; A05 verified one-approval edit/readback and final output on independent Windows run.
