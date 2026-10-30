# Shuvi 2.0.5 V05 — Real Installed Unified Workspace E2E

Date: 2026-10-30. Integration branch: `feature/shuvi2-release-integration`.
Parent: `778faeb405501e3e17baa17de1f3a76ad8724bb9`.
Video and Motion native engine gitlinks unchanged; no changes to `main` or old `shuvi-agent`.

## Core integration fix
U03's `motionStatus()` calls native `motion_command({action:"inspectComposition",compId})`, but shared MotionRequest previously did not support this read-only IPC. The integration Tauri MotionHost now routes the exact native ID into `MotionBridge::inspect_composition` on its existing single worker. Returned identity, dimensions, duration and current revision come from the actual EffectCraft session, not frontend echoes. A Rust test verifies revision equality and unknown-ID rejection.

## Real installed GUI acceptance
`scripts/release/unified-installed-e2e.mjs` operates ONLY after the installed NSIS SHA receipt and successful original installed FilmCraft Video test are present. It uses the existing actual `tauri-driver` WebView2 service, not an external browser or independent test build.

The CI script opens the same installed EXE, clicks the actual Unified link, and performs:
1. Verify native Unified mount in one Tauri window and save actual WebView screenshot.
2. Open prior real FilmCraft `.fcproj` created by the installed Video E2E, independently confirm same on-disk SHA and native timeline clips, render a real FilmCraft decoded preview and screenshot.
3. Select Motion in the SAME Unified GUI, read actual EffectCraft status, create a native composition, add real named shape and inspect current live native layers.
4. Render real EffectCraft PNG pixels, save native `.ecproj`, independently hash on-disk project and exported `.png`, screenshot.
5. Fully close installed EXE, cold-relaunch, navigate Unified, reopen saved native project, check native layer identity, project disk SHA and rendered PNG SHA equality against pre-restart export; screenshot.

On any action/driver/verification failure, it stores a failed receipt and source/PNG where available and exits nonzero. There is no mock branch, synthetic success receipt, fake native preview or permission bypass. Tests are on genuine installed app bytes, not a copied developer binary.

`run-windows-e2e.ps1` launches the Unified suite after both classic Video and Motion tests. `verify-installed-proof.mjs` now requires three successful same-EXE driver receipts (Video, Motion, Unified), same commit, independent hashes, native video/project/PNG readback, cold restart and all 4 Unified GUI PNG screenshots. Regression tests reject missing/stale/mismatched Unified evidence.

## Remaining work
- V04 Windows release run 41019563547 must finish and prove actual no-binary-patching NSIS hash fix; this source work alone does not prove that run.
- V05 exact-commit Windows CI must build Rust with new native `InspectComposition`, run full Node contract tests, bundle real NSIS, verify installed bytes and pass all three installed GUI E2Es.
- Native guarded model-to-editor approval, Windows vault, atomic revisions, native durable ledger, AI provider-backed edit and owner acceptance remain absent.
- **RELEASE NOT READY**; no fake installer or manual claim of success. unsigned Windows package accepted only after all release gates.

Useful logs: `proof/unified-desktop/progress.json`, `receipt.json`, `failed.html`, `failed.png`, four on-success actual WebView screenshots; all uploaded in the existing always-run integration evidence artifact.
