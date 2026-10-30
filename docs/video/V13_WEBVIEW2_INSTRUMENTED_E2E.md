# Real native WebView2 E2E: separate test build

**Observed Windows runner proof:** V12 production `shuvi2.exe` launched successfully and showed real HWND. Its WebView2 main process command line *did not contain* the `--remote-debugging-port` flag even though the E2E script set the environment variable and temporary policy. The existing CDP endpoint therefore never opened. This is a test instrumentation blocker, not evidence of faulty FilmCraft import/export.

Tauri 2 provides a Windows `app.windows[].additionalBrowserArgs` configuration with a separate data directory for browser arguments; the CLI `--config` flag merges overlays and `--no-bundle` skips installer creation. The CI now performs TWO real native builds:

1. **Production build**: `tauri.video.conf.json` only, creates unsigned NSIS installer, production Windows launch smoke PASS required; records original release exe SHA-256.
2. **CI-only instrumented build**: Tauri `--no-bundle` with extra `tauri.video.e2e.conf.json` adds `--remote-debugging-port=9222` and a separate WebView2 data directory. The distinct executable is never packaged or uploaded as user installer; used solely for real pointer/DOM automation with Playwright CDP. Its hash is checked against the production exe.

All FilmCraft commands still run through the actual native Rust/Tauri engine and real MP4 files. `playwright-core` clicks the Video Studio controls. This is **not** the installed production binary end-to-end test; production installer packaging and launch remain separate evidence.

If the debug-enabled test build still cannot be attached, strict CI fails and archives diagnostic JSON/screenshots. No success may be claimed until the E2E step completes.

Refs: https://v2.tauri.app/reference/config/ (additionalBrowserArgs, dataDirectory); https://tauri.app/reference/cli/ (--config, --no-bundle); https://playwright.dev/docs/webview2