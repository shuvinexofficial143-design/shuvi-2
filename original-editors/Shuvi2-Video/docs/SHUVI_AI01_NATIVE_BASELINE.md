# Shuvi 2.0.1 — V-AI01 Native FilmCraft Baseline Audit
Date: 2026-10-30
Branch: feature/shuvi2-original-video-ai
Ownership: original-editors/Shuvi2-Video/ plus this video-only CI.

## Verified source evidence
- Native original FilmCraft v0.14.0 is copied under original-editors/Shuvi2-Video/ with provenance SHA a2d8e9ce269aba9c399e36262522e11456df6fbf.
- The original egui editor remains crates/ui-egui/ and native desktop entrypoint remains apps/filmcraft/src/main.rs.
- Engine command registry is crates/engine/src/commands.rs; Session::execute in crates/engine/src/lib.rs is the original editor's command execution path.
- crates/ui-egui/src/control.rs uses the same app.session engine; TCP bridge requires a 64-hex secret when enabled. NO provider, renderer or log may receive that token.
- Original import build artifact Shuvi2-Video-OriginalUI-Windows-x64 was reported by run 41026789324; that is NOT evidence of native Shuvi AI editing or Windows GUI E2E.
- V-AI01 adds an explicitly READ-ONLY native session readback API: crates/engine/src/shuvi_ai_readonly.rs.
- AI01 regression integration tests: crates/engine/tests/shuvi_native_contract.rs.
- Own-source Windows test/check/release build pipeline: .github/workflows/shuvi2-video-ai01.yml.

## AI Director reuse audit
2.0.3 branch feature/shuvi2-ai-director already implements src-tauri/src/ai_director/src/host.rs with a transactional ledger, typed owner consent, GuardedHost and fail-closed capability flags. Its A07 document says integration has NOT registered native owner operations and does NOT prove one shared lock across manual/AI paths.

**Do not** create a second ledger, a second approval gate, or an unscoped command dispatcher in FilmCraft. V-AI01 keeps all AI edits disabled.

Legacy shuvi-agent useful patterns (from Master handoff):
- model-routing.mjs: ADAPT provider role mapping.
- task-runtime-budget.mjs: ADAPT bounded per-task usage.
- master-provider-single-flight.mjs: ADAPT serial gateway.
- native-action-outcome.mjs and atomic_file.rs: ADAPT only after native tests.
- native_task_ai_ledger.rs, native_task_authorization.rs, native_recovery.rs: CONCEPT ONLY; preserve A07 as the owner ledger.
- Premiere/After Effects UXP, ExtendScript and UIA bridges: DO NOT PORT.

## Actual current capability gates
| Capability | AI01 |
|---|---|
| Original FilmCraft source and native Windows build baseline | build workflow exists; new build pending CI |
| Exact original registry readback, project/sequence readback | implemented and covered by source tests |
| Actual native UI dock/panel for AI | MISSING, V-AI02 |
| Provider credential native vault / real model request | MISSING, V-AI04 |
| Native owner consent/approval from persisted plan | MISSING, V-AI03/04 |
| Exclusive shared manual+AI session ownership, native revision CAS | MISSING, V-AI03 |
| Durable task/action UUID + receipt, no blind retries | MISSING, reuse 2.0.3 A07 |
| Real AI clip split/place, save/reopen/MP4 export, Windows GUI screenshot | MISSING, V-AI05 |

## Test scope and what passing means
Tests target the real filmcraft_engine::Session: registry IDs, no-write readback, new sequence, real demo sequence split, undo/redo, .fcproj save/reopen and disabled/unknown command rejection. The workflow checks the GUI package and builds a Windows executable from OUR branch source. A compiler/test result is NOT equivalent to a launched Windows GUI or real AI provider E2E.

## Next V-AI02
Add a genuine right-side native egui Shuvi AI panel, preserve all original dock panels and keyboard shortcuts, display actual snapshot and Not connected state, and keep mutation controls disabled until A07 native owner integration is reviewed. Do not replace original FilmCraft with Tauri/HTML.
