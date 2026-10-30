# M-AI12 — Original Native egui Project-Bound Preview Safety

Repository: `shuvinexofficial143-design/shuvi-2`
Branch: `feature/shuvi2-original-motion-ai`
Scope: `original-editors/Shuvi2-Motion/`
Native origin: EffectCraft v0.18.0; original legal attribution preserved.

## Verified release baseline before M-AI12

- GitHub Actions Windows Release run `41045126782` completed **SUCCESS** on commit `898cf8991b905ee3e8885b684bda14561eeafd4e`. The compiled original native editor, PE header, SHA-256, ZIP contents, source provenance and original legal attribution were checked in that run. Artifact: `Shuvi2-Motion-MAI11-VerifiedOriginal-Windows-x64` (not a production AI-enabled editor).
- Native 2.0.3 AI Director + SQLite GuardedHost run `41044999226` completed **SUCCESS** on commit `960c4c457c794491ed0730f1aafd0458caeed421`. Artifact: `Shuvi2-Motion-MAI11-GuardedSQLite-Evidence`. This tests the **isolated integration harness** using real EffectCraft and SQLite, *not the shipping desktop's AI execution*.
- **M-AI12 new changes are not covered by those earlier successful runs** and require their own branch HEAD CI success. Never reuse the earlier release build as proof of new M-AI12 changes.

## Actual native egui change

Previously `ShuviAiState::invalidate_stale_preview(revision)` only compared `Session::revision`. A new document can have a coincidentally reused revision, a Save As can change the path, and opening a different composition can change native state without a journaled project edit.

The actual docked Shuvi AI panel now captures a `NativePreviewBinding` at the moment a locally validated composition proposal is created. Before showing the pending proposal on each native UI pass it checks:

1. `Session::revision` and `PendingCommand.expected_revision`.
2. The exact original `Arc<Project>` object identity through `Weak<Project>::upgrade` followed by `Arc::ptr_eq`.
3. The current saved project file path.
4. The currently active native composition ID.
5. The exact previously previewed `PendingCommand` payload, including command name, params and `requires_owner_approval=true`.

A missing binding, dropped prior native project or failed equality invalidates the preview and drops its binding without attempting any native edit. `Weak<Project>` avoids retaining a large previous Project strong reference that could otherwise force expensive copy-on-write snapshots.

Regression tests directly exercise manual native edits, real File/New, two project sessions with equal revisions, active composition switch, altered preview payload, tampered approval flag, changed project path, no binding, forced non-journaled native project COW mutation and unchanged strong reference count. A local preview is still not an authorization capability and cannot execute commands.

## Remaining blockers, deliberately NOT claimed complete

- Production egui AI edits remain **DISABLED**, with the Approve & Execute button not connected.
- Existing 2.0.3 SQLite `GuardedHost` is an isolated test integration, not compiled/wired into the deployed egui runtime.
- Desktop manual UI/shortcut/control-channel commands and AI commands still need one native owner transaction gate across **all** editing paths; a local `RefCell` alone is not a sufficient global cross-process lock.
- Need real OS-private SQLite/WAL persistence, durable crash recovery and replay protection as part of shipping desktop.
- Need trusted owner-side plan review and explicit approval UI, with no permission derived from model/renderer data.
- Need authenticated safe credential store and actual provider-originated plan validation, independent readback and E2E Windows verification, including saving/reopening real project and optionally rendering.
- 2.0.5 Unified Desktop may consume the `integrations/shuvi-director-motion/integration-contract.json` as **read-only requirements**, never as an authorization grant.

## Test commands

Native Windows egui preview and dock regressions:

```powershell
cargo test --locked --manifest-path original-editors/Shuvi2-Motion/Cargo.toml --package effectcraft-ui-egui --lib panels::shuvi_ai::tests -- --nocapture
```

Real isolated EffectCraft/SQLite integration:

```powershell
cargo test --manifest-path original-editors/Shuvi2-Motion/integrations/shuvi-director-motion/Cargo.toml --all-targets -- --nocapture
```

The SQLite integration command requires staging the pinned 2.0.3 source in `integrations/ai-provider` as in the CI workflows. Latest M-AI12 GitHub Actions must pass independently before this work is claimed verified.
