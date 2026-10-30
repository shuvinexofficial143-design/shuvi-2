# M-AI04 — Real EffectCraft + AI Director SQLite cross-branch integration harness

**Branch:** feature/shuvi2-original-motion-ai. **Original source:** EffectCraft v0.18.0. This is a separate owned Motion-only integration harness in \`integrations/shuvi-director-motion\`. The original editor binary, UI panels, source and 2.0.3 branch are unchanged.

## How this is actually connected
CI checks out **exact source commit** \`64bf23e4cb9b4c95ca88b2f07ce9d57f7c2fa3e4\` from \`feature/shuvi2-ai-director\` into a *temporary checkout*, copies the authoritative \`src-tauri/src/ai_director\` Rust crate into the isolated harness staging directory, and compiles the harness with path dependencies. The harness uses the **actual** 2.0.3 \`GuardedHost\`, \`ReserveWire\`, \`TransactionalLedger\`, \`GuardedWireRequest\`, \`NativeOwner\` trait and exact source; not a copied/reimplemented SQLite ledger.

A test-only \`EffectcraftNativeOwner<'a>\` holds the live original EffectCraft \`&mut Session\`, exposes a trusted project/session/revision snapshot, strictly validates \`MotionCreateComposition\`, \`MotionAddText\`, \`MotionEditText\`, executes real \`Session::execute_checked\` commands and independently inspects native objects for SHA-256 proof. Every edit goes through the real SQLite WAL/FULL reserve -> persisted consent claim -> step intent -> native command -> readback -> durable verified receipt. The tests use **explicit TestOwnerConsent**, NOT a live Windows user approval. Other actions fail closed; no generic command IDs, TCP, file paths, or external editor tools are exposed.

## Regression tests
Real native composition creation with full SQLite receipt and replay rejection after process restart; native text layer readback; owner denial prevents edit; manual revision change blocks consent before owner prompt; native Stop blocks execution; inventory is derived from live Session IDs and excludes paths. These tests assert native EffectCraft project contents, not only mocked frontend outputs.

## Scope and unblock
This is a CI/engineering integration proof only: **not installed into EffectCraft or unified Tauri app, not a live AI-provider response, not a production OS owner click, not a Windows GUI E2E or installer**. The actual native M-AI02 Approve button remains disabled. \`src-tauri/src/lib.rs\`, 2.0.3 and 2.0.5 branches are not touched. No production permit from frontend exists.

For release 2.0.5: audit and merge the 2.0.3 crate and Motion source into the OWNED release branch; rehome this native adapter into a single editor lock shared with EVERY manual edit/tab/project operation; initialize host-owned SQLite in private Windows profile folder with restricted ACL; use Windows Credential Vault; show a native trusted owner consent for the exact persisted Scope; compile and E2E test the desktop with actual provider, edit, save/reopen, frame PNG and recovery. Only then set nativeGuarded true.

**CI** runs a real source-based cross-branch integration harness on Windows. The source-pin must be updated via reviewed commit whenever AI Director changes, not by mutable branch HEAD. No tests PASS unless GitHub Actions says success.
