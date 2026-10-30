# SHUVI 2.0.5 — Original Native Editors + A08/U09 Source Integration Checkpoint

Date: 2026-10-30. Working branch: `feature/shuvi2-release-integration`. No modifications to source branches or `main`.

## Immutable source tree selection
These original Git objects are imported directly from the OWNERS' branches, preserving all original native source and egui UI rather than reconstructing a "lookalike":
- **Original FilmCraft UI/engine** `original-editors/Shuvi2-Video`: branch `feature/shuvi2-original-video-ai`, head `41db019a187b2ff5c1a39dbcecf2f802f6bb1784`, original tree `ae276804a8ab1efdea33005a1a25b117d42d9119`.
- **Original EffectCraft UI/engine** `original-editors/Shuvi2-Motion`: branch `feature/shuvi2-original-motion-ai`, head `77010ff50de250d1c6cf9f60620c2346732bca12`, original tree `9240a74ff8b3eea871f730507d20cf7820cc17d1`.
- **Canonical AI Director A08 native SQLite/ledger** `src-tauri/src/ai_director` tree `fbe962167ba9ea4a1348fe32a2028d286ad74321` and JS director `src/ai-director` tree `725385a65f7ce1bf3398888ea7b84304ffda40d2`, head `64bf23e4cb9b4c95ca88b2f07ce9d57f7c2fa3e4`.
- **Unified U09** `src/desktop-ui` tree `7f239b808a8ac937c3fa6eb71bfa203a4450778f`, `src/unified-workspace` tree `d47178ff24a0ddcf5de9eb771ee4096a3fca0816`, head `d8da374be00d0714771204374cbc330687dd5090`.
- Seventeen corresponding A08/U09 JavaScript tests imported from their original blobs, no synthetic replacements.

All original-editor source directories are unmodified. An explicit `git rev-parse HEAD:<path>` provenance test fails if ANY native subtree is changed or silently substituted.

## Source-branch CI evidence (as checked on 2026-10-30)
- Original Video HEAD 41db019a: GitHub Actions run 41061287734 reported a compile failure in `shared_owner_admission` Rust test (`E0382 borrow of moved value: path`); its other Windows job was still running at audit. **Do NOT claim original Video source passes all tests.**
- Original Motion HEAD 77010ff5: native-owner-route audit run 41061005329 passed. A static audit is NOT GUI approval or native editing E2E.
- Canonical AI Director A08 HEAD 64bf23e4: native/source CI run 41028291245 and foundation 41028291344 passed. Their owner interfaces use test doubles; do NOT claim real original editor owner/approval is wired.
- Unified U09 HEAD d8da374b: Foundation run 41027962802 passed; no original GUI E2E.
- Prior release V08 HEAD c7ffc95 Windows run 41027734492 **FAILED** before WebDriver start: PowerShell parser error in `run-windows-e2e.ps1` at `$webviewVersion:`; no Video/Motion/Unified actual E2E from THAT run. Native engine, package and installed smoke steps passed.
- Previously V06 Windows-2022 run 41023344644 separately showed a **real custom Tauri Motion WebView2 E2E pass**, but FilmCraft Video GUI failed on canonical path; this does NOT prove original EffectCraft egui GUI.

## Fixes in this integration milestone
- Repair PowerShell interpolation `$webviewVersion:` to `${webviewVersion}:`. Parse all relevant PowerShell installed launcher scripts BEFORE expensive Windows native builds using PowerShell's own parser; reject any errors.
- Upgrade canonical AI A03 source to A08 and U03 Unified source to U09 plus their 17 source contract tests. This is source/contract integration, NOT production authorization.
- Add original source tree git-identity test and separate Windows Rust cargo-check workflow for the real original `filmcraft-ui-egui` and `effectcraft-ui-egui` packages. A green source check must not be labeled installer or GUI E2E proof.
- Keep existing Tauri custom UI/installer explicitly as a **legacy temporary engine harness**, NOT the final original editor application.

## Production integration blockers (hard gate)
1. Design and build a single Windows GUI host embedding the **actual** original FilmCraft and EffectCraft native egui UI, with one shared editing owner per project. Tauri's old Video/Motion UI does not satisfy this.
2. Production-link the canonical A08 native GuardedHost, SQLite durable ledger, Windows Vault secrets and per-user ACLs to that exact native UI owner and its manual commands. Block all AI-origin mutations by default. Stop/crash/retry must never duplicate mutations.
3. Wire native AI Chat planning and real OS-owner Yes/No approval to the stored plan hash, then dispatch only pre-approved `video.split` and `motion.editText` into original engine sessions; verify changed native object IDs/revisions, disk readback, manual edit invalidation, reopen, pixel/frame output.
4. Build one exact-source Windows installer, independently verify installed executable and original embedded GUI, both E2Es and full action receipts; owner acceptance and signing remain pending.

**RELEASE NOT READY. SOURCE IMPORT DOES NOT MEAN ORIGINAL GUI LAUNCH OR REAL AI EDITING.**
