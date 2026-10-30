# Shuvi 2.0.5 — V06 Win2025 WebView2 CI Recovery (2026-10-30)

Parent integrated commit: `5cf6d687b5a00c6a31a65be0441eef111f44ea29`. Scope only `feature/shuvi2-release-integration`; no engine pins or `main` changes.

## Verified CI evidence (not interpretation)
- V04 exact-commit 778faeb405501e3e17baa17de1f3a76ad8724bb9 workflow 41019563547:
  - Windows Server 2025, hosted image `windows-2025-vs2026` 20261021.278.1.
  - Native FilmCraft, native EffectCraft, AI guard Rust tests and Tauri tests **passed**.
  - Unsigned NSIS built, installed with exit 0, exact installed `shuvi2.exe` and FilmCraft sidecar hashes matched compiled artifacts; real app native window launched.
  - Installed Video `POST /session` **FAILED**: `session not created: DevToolsActivePort file doesn't exist`, before any GUI editing.
  - Motion independent `POST /session` also failed (abort after timeout). No real installed GUI E2E success proven.
  - Artifact `shuvi2-integration-e2e-evidence` ID 12962536468 includes SHA-bound install receipt and failed Video/Motion receipts.
- Public runner-images report https://github.com/actions/runner-images/issues/14738 describes identical WebView2+tauri-driver `DevToolsActivePort` failure on Windows Server 2025 runner image and successful Win2022 control. The known regression is **credible but not proof** of this exact job's root cause.

## Source fix
1. Pin actual integrated Windows workflow runner to `windows-2022` instead of dynamic `windows-latest`; change concurrency group to v06 so prior V05 exact SHA CI continues uninterrupted.
2. Record OS image, OS version, installed WebView2 runtime registry version and EdgeDriver/tauri-driver versions in real Windows `proof/motion-desktop/driver-prerequisites.json`; never log credentials.
3. After a Video failure, run Motion and Unified independently and preserve each receipt; report all three exact exit codes. Do not turn any failure into success.
4. Add source regression assertion for runner pin and diagnostics. Native installer hash gate, actual installed EXE, sidecar, WebView2 driver and real screenshot requirement unchanged.

## Acceptance
V05 full Windows run 41022456178 still running under its previous v05 group. V06 must pass its own exact-commit Windows build, NSIS install, three independent real WebView2 E2Es, native project/PNG/MP4 readbacks, all screenshots and SHA-bound receipts. **RELEASE NOT READY** until all pass; AI provider-to-editor native guarded approval is also pending.
