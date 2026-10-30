# Shuvi 2.0.5 first integration checkpoint — NOT READY

Video source: 1e9860a0a67eba6c8dea420192b648667a969f39
Motion source: 535ee43147b78ce3f3516afb1734826f38fdb351

- Keep both Video and Motion modules in one Tauri lib.rs command handler, with MotionHost managed state.
- Combine Cargo dependencies and exact reviewed EffectCraft PDF parser patch SHAs.
- Load both editors into one existing index.html and keep original Video DOM and listeners on tab switches.
- Preserve Video native dialog permissions, FilmCraft H.264 export sidecar, Motion in-process compositor and both pinned submodules.
- AI Director and Unified Workspace are not integrated: their target branches were absent from the repository snapshot.
- Integration is not a Windows installer/E2E PASS until CI and an installed interactive Windows session verify it.
