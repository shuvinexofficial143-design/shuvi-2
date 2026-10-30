# Shuvi 2 Original Editors — Full Source Recovery

Source-import branch: feature/shuvi2-original-sources (isolated; no changes to main or other five development branches).

The GitHub Actions import job copies **ALL regular source files**, **including original full desktop egui UI**, from immutable release tags, then commits them as ordinary source files in the user's own GitHub repository, NOT gitlinks and NOT source download redirects:

- original-editors/Shuvi2-Video — FilmCraft v0.14.0 SHA a2d8e9ce269aba9c399e36262522e11456df6fbf
- original-editors/Shuvi2-Motion — EffectCraft v0.18.0 SHA c3600f9b59b109da97871a43a6898683a0163cb1

Only native OS window title is renamed; original menus, timeline, keyboard shortcuts, layers, effects, rendering and UI crates are retained untouched. Rust internal crate names remain as upstream to avoid breaking dependencies. MIT/Apache-2.0 licenses, NOTICE and ATTRIBUTION are retained. Attribution to upstream authors is required.

After import, own GitHub Windows CI compiles from OWN committed source:
- Shuvi2-Video.exe in artifact Shuvi2-Video-OriginalUI-Windows-x64
- Shuvi2-Motion.exe in artifact Shuvi2-Motion-OriginalUI-Windows-x64

Check OWN repository branch, then OWN Actions run Artifacts. Never claim source imported before its push or a ZIP downloadable before both Windows build and artifact upload succeed.

The two first test apps still run separately and don't yet include Shuvi AI. Later unified host must reuse original UI rather than rebuilding panels in HTML; single-window AI integration is a later separate acceptance gate. Do not confuse copying source or building two EXEs with finishing the unified application.
