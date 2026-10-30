# Shuvi 2.0.3 — A03 Native Guarded Execution Contract

Date: 2026-10-30. Repository: shuvinexofficial143-design/shuvi-2.
Branch: feature/shuvi2-ai-director. PR #4 remains DRAFT. No changes to main,
Video Studio, Motion Studio or the old shuvi-agent repository.

## Delivered native source

- src-tauri/src/ai_director/src/guard.rs implements a host-only Rust native owner
  guard, native project/version/session snapshots, strict enumerated editing actions,
  plan reservations, single-attempt owner consent, per-step durable intent,
  duplicate/replay rejection, ordered native execution, independent owner readback and exact affected-object verification,
  verified step receipts and restart inspection.
- src-tauri/src/ai_director/tests/native_guard.rs covers process-reopen/replay
  behavior and fail-closed cases with explicitly labelled TEST DOUBLE editors.
- The dedicated Rust AI provider crate exports the guard module. This crate is
  intentionally NOT registered in the actual Tauri invoke_handler on this branch.

## Exact integration sequence for Shuvi 2.0.5

1. Read the current heads and command schemas of both FilmCraft and EffectCraft.
   Do not assume these source branches have merged. Merge source files only through
   reviewed integration, not from AI 2.0.3.
2. Keep one exclusive *native* editor owner per active project. Route BOTH manual
   edits and model-approved edits into that same owner. Hold ownership from
   native state snapshot through edit plus post-edit native readback.
3. Convert A01's validated action type strings to A03 Rust Action enum through
   one fixed host-owned mapping (e.g. video.split -> VideoSplit). Do not accept
   model-generated IPC command names, arbitrary JSON payloads, shell, URL or path.
4. Obtain the exact project ID, editor session ID and monotonic revision/SHA-256
   from the current native owner, not from user text. In particular:
   - FilmCraft: external-save race requires an actual owner lock/CAS over the
     project bytes before mutation, plus disk SHA-256 refreshed from the same
     protected session.
   - EffectCraft: extend native MotionHost to accept guarded expected revision
     and session nonce atomically at the worker, not before queue submission.
   The current Studio branches cannot yet satisfy this contract without changes
   in the Integration chat.
5. The real Windows owner-click UI must display the exact plan, project,
   actions and plan hash. Implement OwnerConsent only in the trusted native host;
   no JS/model can construct an approval result or silently approve tasks.
6. Host selects a PRIVATE existing ledger directory with restricted permissions.
   Model never supplies a journal path. Task IDs are safe basename tokens only.
   Ledger::reserve creates a unique task folder and persisted plan; approve
   stores a claim BEFORE showing owner consent (denial/crash cannot re-prompt).
7. Ledger::execute persists an intent with create_new/fsync BEFORE calling the
   typed native owner. Any prior intent prevents replay. A native timeout or
   missing/unchanged independent readback is UNCERTAIN, never 'success'.
   A verified receipt is persisted before a subsequent action. On restart
   Ledger::recover yields not_started, verified or uncertain for each step.
8. Add native owner cancellation (queued-before-admission only), protected
   export target no-clobber and disk-based project reopening before enabling
   destructive actions or filesystem output.

## Known limitations / proof classification

- Real FilmCraft/EffectCraft execution on the unified Windows desktop is NOT
  implemented by the A03 isolated guard. The NativeOwner tests use TEST DOUBLES.
- The plan SHA supplied by the A01 JS layer must be reconciled with the exact
  native-scoped plan displayed in the trusted owner consent UI. A03 persists
  its own canonical SHA-256 of the typed plan to protect the approval record.
- The primitive file-based journal uses create_new and sync_all on each record
  but does NOT yet guarantee durable *directory entries* after sudden power loss
  on Windows. Prefer SQLite WAL transaction/journal with Windows durability
  testing before production-grade crash guarantee. In-process restart tests
  do not prove physical power-loss recovery.
- Ledger ownership root must be a dedicated OS-private directory; symlink
  attacks and hostile access from untrusted processes remain outside this
  isolated module's verified boundary. Integration must restrict ACLs.
- Existing native studio commands do not yet provide an atomic compare-and-swap,
  task authorization check, persistent idempotency admission and exact native
  output verification in the same owner transaction. An unguarded adapter
  MUST NOT implement NativeOwner in a production build.
- No real API credential or live OpenAI request was used in the tests; no
  human-driven WebView2 acceptance, video export or native Windows installer
  has been proven here.

## Verification

Run Windows CI on exact HEAD:
- cargo test --manifest-path src-tauri/src/ai_director/Cargo.toml
- node --test tests/ai-director-core.test.mjs tests/ai-director-a02.test.mjs
- npm test
- npm run build

The A02 Windows runs 41009377832 and 41009377850 succeeded on HEAD
573ac4f03d6cbabd61f50515bde85b1e0a74f3b3. A03 must get its own
exact HEAD Windows results before any A03 test success is claimed.

## Next milestone

A04: integrate Rust guard with exact real native FilmCraft/EffectCraft owner
via Integration Chat 2.0.5 contracts, test actual headless native edits plus
readback, and add a legitimate owner-controlled Windows consent UI. Do not
merge PR #4 before integration review and real desktop acceptance.
