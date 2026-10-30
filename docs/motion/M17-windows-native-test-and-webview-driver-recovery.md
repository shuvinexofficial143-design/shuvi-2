# M17 — Actual Windows failure diagnosis and precise corrections

Repository: `shuvinexofficial143-design/shuvi-2`.
Owner branch: `feature/shuvi2-motion-studio`.
**Only Motion-owned code is edited.** Do not merge main or change Video
Studio's branch and do not alter pinned EffectCraft / FilmCraft native engines.

## Actual M16 CI outcome (not inferred)

From [M16 Motion workflow 41009263023](https://github.com/shuvinexofficial143-design/shuvi-2/actions/runs/41009263023):
- Native engine worker job `123911192034`: **FAILURE** at
  `cargo test --manifest-path crates/shuvi-motion-bridge/Cargo.toml --all-targets`,
  while 1 of 2 `tests/png_sequence.rs` tests failed.
- Other earlier Rust suites and compilation already succeeded; this is
  **not** a Rust syntax error or a real sequence file not being written.
- Actual assertion: `receipt.directory == dir.join("real_frames")`.
  Windows runner emitted the **same** folder under extended canonical
  `\\?\C:\Users\runneradmin\...` and a DOS 8.3 short alias
  `C:\Users\RUNNER~1\...`. Comparing raw PathBuf strings was wrong.
- M16 Foundation [41009263034](https://github.com/shuvinexofficial143-design/shuvi-2/actions/runs/41009263034):
  frontend **SUCCESS**, native **SUCCESS**.
- Because M16 native Motion Engine job failed, its real WebView2 GUI and
  unsigned Windows installer jobs were **SKIPPED**. Do not claim real
  image sequence proof or a built executable installer from that run.

### M17 Rust fix

`crates/shuvi-motion-bridge/tests/png_sequence.rs` compares
`fs::canonicalize(&receipt.directory)` with the canonicalized
user-target path. This checks actual Windows filesystem identity, not
different string representations of the same folder. The test still
asserts the exact final directory exists, all real Native PNG disk data
matches and no private staging folder escapes after successful publish.

## Actual GUI failure on old run

[M13 Motion workflow 41005010848](https://github.com/shuvinexofficial143-design/shuvi-2/actions/runs/41005010848)
had Native Engine **SUCCESS** and a real Windows desktop E2E job
`123904833735` **FAILURE** at actual WebDriver session creation. We
downloaded the failure artifact 12956463862, inspected the ZIP and found:

```json
{"ok":false,"failedStep":"start-real-webview2-session",
 "driver":"tauri-driver",
 "error":"AbortError: This operation was aborted"}
```

The actual Tauri driver stdout contained
`Error serving connection: hyper::Error(IncompleteMessage)`. The E2E
`wd()` function had hard-coded a **25-second HTTP AbortController**
for all routes, including `POST /session`, closing the transport
before Windows app startup could finish. There was **no verified GUI
click** in this failed run, even though native Tauri production build
and EdgeDriver installation succeeded.

### M17 WebDriver fixes

- Increase timeout for **real `POST /session` only** to 180 seconds;
  ordinary Driver commands remain bounded at 45 seconds. Both
  successfully completed sessions and failure receipts record real
  session-start latency. Any transport abort fails the E2E (no
  `continue-on-error` or fake session).
- The launcher logs actual Windows image/runtime and executable size.
- The GitHub Actions Desktop E2E job alone uses `windows-2022`,
  not `windows-latest`. This is based on a recent documented
  compatibility regression on elevated Windows 2025/2026 runner
  images: [actions/runner-images #14738](https://github.com/actions/runner-images/issues/14738).
  Its reporter found `windows-2022` successful while the newer
  image's WebView2 Driver session failed despite a matched EdgeDriver.
  Another investigation: [webdriverio/desktop-mobile #542](https://github.com/webdriverio/desktop-mobile/issues/542),
  reports WebView2 150+ elevated-host remote-debugging-port issues.
  **These are relevant external precedents, not proof our M17 GUI works.**
  Native compile and NSIS packager remain on independent Windows
  runner jobs. The installer still depends on successful real
  GUI click-through receipt/screenshots/native PNG SHA-256 checks.
- New source tests pin these constraints and prevent a return to the
  25-second startup timeout or windows-latest GUI image.

## Verification levels: strict

- M16 Rust source compiled on Windows, but the native sequence test
  failed on raw path comparison.
- M17 has an in-process V8 static source contract audit **27/27 PASS**
  and parses the desktop E2E body; this is *not* an official `npm test`
  / Rust compile / GUI run.
- M17 exact-head GitHub Actions must complete. Until they do, report
  Native Engine tests, Windows GUI, proof artifacts and unsigned NSIS
  installer as **pending or failed**, not PASS.

No unified FilmCraft/EffectCraft merged desktop app, signed installer,
approved AI editing agent or native Motion MP4 encoder is claimed.
