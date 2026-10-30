# SHUVI 2.0.5 — V03 Source Integration (RELEASE NOT READY)
Date: 2026-10-30. Integration branch: `feature/shuvi2-release-integration`.

## Reviewed source SHAs
- Parent Integration: `5ebb58f76f943523cae08b61f333c2144f6fe0d9`.
- Native AI Director A03: `b7da80af93b0c2517772204f6a4a58f0a5f9d601`. Exact-source AI and Foundation Windows CI succeeded.
- Unified Workspace U03: `3c15baabdb9e7a2f00b4e0071fcb3b9ae7124416`. Exact-source Foundation Windows CI succeeded.
- Already integrated FilmCraft Video source: `1e9860a0a67eba6c8dea420192b648667a969f39`.
- Already integrated EffectCraft Motion source: `535ee43147b78ce3f3516afb1734826f38fdb351`.
- Native pinned FilmCraft/EffectCraft gitlinks remain unchanged. Newer Video/Motion branch HEADs not merged.

## Actual changes
1. Add 15 isolated AI A03 provider/typed plan/guard/ledger and test/doc files. A03 is TEST-DOUBLE verified, not a live AI editor.
2. Add 17 Unified U03 source/test/docs, preserving native Tauri bridge contracts for both studios.
3. Replace eager HTML scripts with one entrypoint. Default classic Video and Motion are imported in their existing order. Explicit same-window `?workspace=unified` instead mounts one Unified native controller; switching modes reloads the single WebView and does not create another Windows/Adobe window. Save native projects before changing modes.
4. Preserve the existing shared Tauri native commands and one persistent MotionHost. Do not register AI model proposals or guarded editor IPC until real OS vault, native atomic CAS, owner consent and independent readback exist.
5. Run A03 Rust tests in the integration Windows release workflow; imported AI/Unified Node suites run through existing `npm test`; add integration routing/host verification tests.

## Verification and blockers
- Exact-head upstream A03/U03 CI success proves their source checkpoints only. It does NOT prove this integrated commit builds or passes Windows GUI tests.
- Default integrated Video/Motion Windows E2E and alternate Unified UI mode need real installed Windows driver results, screenshots, media exports, native readback and cold reopen bound to the exact integrated SHA.
- The unmerged Video lane `e7a62cf801e83052089512fb2feef59a024722bf` failed TS2345 at view.ts line 728 and Motion lane `dea267247c333143e08c37bda11bcca3e6d78b1f` failed PNG sequence owner-destination verification; do not merge those failed heads.
- No live provider API key, Windows OS credential store, owner-click approval, atomic AI-to-native edit execution or installed AI E2E. Provider source is not connected to an authorized Tauri command.
- Unsigned installer and all new source remain **NOT READY** until exact-commit full Windows verification. Do NOT merge `main` or modify `shuvi-agent`.

## Next engineering milestone
Fix any current exact-commit Windows regression, verify installed GUI both studios and new alternate Unified controller; then implement trusted Windows credential vault and native atomic owner guards as a separate reviewed batch.
