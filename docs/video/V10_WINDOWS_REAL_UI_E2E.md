# V10 — Windows WebView2 real UI E2E gate

This is an experimental **strict** Windows CI verification gate, distinct from backend Rust unit/integration tests. It launches the actual compiled release Windows Tauri app with the pinned compiled FilmCraft sidecar, enables Chromium DevTools Protocol **only for that CI subprocess**, and attaches Playwright via WebView2's supported CDP endpoint.

The test creates a real temporary Windows project root, copies the small real H264 fixture, fills the on-screen Video Studio path controls (no direct IPC call), clicks Import Media, Create Sequence (64×64, 12 FPS), chooses the imported media item, places it on V1, renders a Program frame, drags the scrubber to 0.5 sec, and exports a true H264 MP4 via the user-facing controls. It verifies the saved \`.fcproj\`, DOM track clip presence, a decoded actual PNG frame, the resulting file and ISO BMFF \`ftyp\` atom. It captures the desktop WebView2 screenshot and per-stage JSON log as CI artifacts.

This is **not a fake Playwright-only browser or isolated web mock**. Test runner requires Windows with a real WebView2 GUI session. The debug flag is never shipped in the NSIS installer.

If the CDP session cannot start due to GitHub runner GUI limitations, the test correctly FAILS and the installed-user workflow remains NOT VERIFIED. Do not claim success until the full exact-SHA workflow's E2E step succeeds. Real installation, long video, audio export and timeline drag are outside this initial E2E fixture.

References: Microsoft Playwright WebView2 test documentation and Microsoft Learn debug environment variable, validated 2026-10-30.
