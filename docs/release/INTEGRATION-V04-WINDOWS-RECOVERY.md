# SHUVI 2.0.5 — V04 strict Windows NSIS and TypeScript recovery

## Exact diagnosed failures
- Corrective V03 source: `809c9778105f6646b0cb678cf829df184ce6f5ff`.
- Windows Foundation run 41017036028 at that SHA failed TypeScript TS1375: src/entry.ts contains top-level await without module marker.
- Earlier integrated V02 Windows run 41009957353 built NSIS, launched standalone Shuvi and passed native FilmCraft/EffectCraft tests, but installed-binary integrity failed before installed GUI E2E.
- Saved actual CI evidence archive 12958516394 reports built EXE SHA `50306e52474b61875f9d9a1a258371eb1fd5df80bb434388de60aec3890fe79c` (standalone-launch receipt), installed EXE SHA `c7a78a498f39ebc23b9c510f65c4d8193fe821e93dcca097448065fded1f4dc6`; both built and installed FilmCraft sidecar hashes are `3c72c2d7063eab6c8f8aca387e9a3b37951b057f6c3fe832bdfefe7570ef6b4e`.
- CI output explicitly contained `Patching ... shuvi2.exe with bundle type information: nsis`. Tauri's documented `--no-binary-patching` option avoids mutating built EXE for a single NSIS installer; exact current CLI support is checked, not assumed. See https://tauri.app/reference/cli/.

## Changes
1. Add `export {}` to frontend entry module; top-level dynamic imports remain ordered and existing studios unchanged.
2. Build the ONE NSIS type using `--no-binary-patching`; fail if installed CLI lacks documented option. No updater multi-format claim is made.
3. Preserve exact integrity check of built-vs-installed EXE AND staged-vs-installed FilmCraft executable, record both expected/actual hashes plus explicit per-file comparison booleans before throwing. Never ignore or normalize mismatches.
4. Require both hash comparisons and exact hashes in independent release proof validator; expand negative test fixtures and regression check for the Tauri flag.

## Status
This is a targeted SOURCE FIX, not evidence of a successfully installed Windows application. The new exact-commit Windows CI must prove TypeScript tests, pinned native engines, NSIS install hashes, video/movie editing WebDriver E2E and cold restart. Release remains **NOT READY**, AI editing still unconnected. Main and old Shuvi repository untouched.
