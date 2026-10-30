# Shuvi FilmCraft V-AI21 — Actual Native GUI/A07 Runtime Adapter

Date: 2026-10-30. Branch: `feature/shuvi2-original-video-ai`.

## Verified baseline
V-AI20 exact head `a695728802466a300da286c5006b298e79cb430f` completed BOTH Windows jobs successfully: GitHub Actions `41066004301`. Original native Windows FilmCraft build, GUI tests, and pinned canonical A07 provider/guard/ledger/bridge source passed. This is a real GitHub CI success, not a live operator E2E.

## What this release stage adds
The standalone A07 native bridge now links the **actual production** `filmcraft-ui-egui` package as a normal dependency (previously development-only). New production-compiled `gui_runtime::NativeGuiA07Runtime` owns one real `TransactionalLedger` from a trusted, absolute private path. It exposes Rust-only native operations `snapshot/reserve/request_native_owner_consent/execute_step/cancel/recover/task_history`, all going through `FilmcraftApp::with_shuvi_trusted_a07_context`, the real UI exclusive native owner and the same in-memory `Session`. It creates the real `VideoOwner` with host-generated project/session identity, then uses canonical `GuardedHost` and SQLite persisted task. Win32 consent uses `WindowsNativeOwnerConsent`, not a mock in the live method. This stage introduces no external API route or artificial `approved=true` bypass.

Two actual GUI+SQLite integration regressions open the private SQLite ledger, reserve a real selected native clip without applying an edit, verify bound readback, reopened durable `not_started` state, manual GUI still usable; and verify active-sequence context switch invalidates the original session identity while recovery remains read-only.

## Strict limits
This adapter compiles as a real native Rust library, **not yet linked into the actual FilmCraft executable/egui sidebar**. Production AI editing remains FALSE, the Send/Approve/Stop buttons remain DISABLED. No provider credentials retrieved from WinCred, no OS dialog click, no model-originated video split, no Windows GUI E2E. An integrated host must choose and secure the Ledger absolute path; never accept a path or "approved" flag from a model. The test case reserves but does not invoke a consent modal in headless CI. The full windows build must pass on this exact new commit.
