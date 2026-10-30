# M13 — Windows WebView2 E2E recovery and unified Video/Motion handoff

Source of truth: GitHub `shuvinexofficial143-design/shuvi-2`.
Motion owner branch: `feature/shuvi2-motion-studio`.
Independent Video owner branch: `feature/shuvi2-video-studio`.
This document is a **read-only integration handoff**, not a claim of a
completed merge or passing desktop acceptance test.

## 1. Actual observed Windows E2E failure

The M10 [Windows Motion workflow 41000673325](https://github.com/shuvinexofficial143-design/shuvi-2/actions/runs/41000673325)
completed its REAL native EffectCraft engine test with SUCCESS and built
a real Windows Tauri executable, installed `tauri-driver`, and obtained
the matching Microsoft EdgeDriver 155.0.4283.62. The **WebView2 E2E
job failed before opening the app** at
`tests/motion/desktop-e2e.mjs:135`: `SyntaxError: Unexpected reserved word`.
The JavaScript contained three invalid `async=>` callbacks. This was
a real Windows log-derived failure, not an assertion that the user
clicked a broken screen.

M13 source fix:
- Corrected all three to `async()=>`. A V8 parsing review
  of the current E2E body (ES module imports excluded) succeeded.
- Added a mandatory `node --check` + `npm test` **before** the
  expensive native Windows GUI build. The local PowerShell launcher
  also syntax-checks the E2E before downloading any WebDrivers.
- Replaced direct `cargo build` of a **debug executable** (which
  can depend on a Vite dev server) with
  `npm run tauri -- build --ci --no-bundle` producing the real
  production `src-tauri/target/release/shuvi2.exe` embedding the
  compiled frontend. No mock window, alternate demo, or dev server.
  Tauri's documented v2 `--no-bundle` runs a production application
  build while skipping installer packaging.
- A new `scripts/motion/verify-desktop-proof.ps1` independently
  inspects a successful real GUI receipt, exact checkout/GitHub SHA,
  pinned EffectCraft SHA, Windows platform, Undo/Redo proof, process
  cold restart, pre/post PNG SHA256 equality, and all four real PNG
  screenshots (header and minimum dimensions). The actual desktop
  CI job must run this verifier before it can succeed. The Installer
  job has `needs: motion-desktop-e2e-windows`, therefore refuses
  premature packaging.

These are **committed changes**, not a claimed successful rerun.
M13 exact-head Actions and artifact must pass before WebView2 is
considered verified. The M10 failure artifact is diagnostics only,
not a successful real screen screenshot.

## 2. Source-backed branch collision audit

Both development branches independently descend from `main`. A
read-only compare of `main` to both current branches found:

| File | Video branch | Motion branch | Safe integration requirement |
|---|---|---|---|
| `src-tauri/src/lib.rs` | registers `mod video`, all FilmCraft media/timeline/history/export/AI proposal commands and `tauri_plugin_dialog` | registers `mod motion`, manages one `MotionHost`, exposes typed `motion_command` | Preserve **every Video command** and register `motion::motion_command`, `.manage(MotionHost::new())` and dialog plugin once. Never replace either entire file. |
| `src-tauri/Cargo.toml` | `sha2`, `tauri-plugin-dialog`, `reqwest` | `shuvi-motion-bridge`, `base64`, pinned `hayro-syntax`/`hayro-jbig2` root overrides | Keep dependency **union**, exact reviewed crate pins, do not remove Video security libs or Motion patches. |
| `src-tauri/capabilities/default.json` | `core:default`, `dialog:allow-open`, `dialog:allow-save` | only `core:default` | Keep Video dialog permissions and **do not add** blanket fs/shell/network permissions for Motion. |
| `src/main.ts` | owns actual Video Editor mount and `videoStudio.setActive(...)`; FilmCraft typed chat | foundation Video placeholder navigation only | Use Video real main coordinator; Motion mount/unmount must integrate into **same** tab controller. No duplicate navigation listeners or stale placeholder restores. |
| `index.html` | loads `src/main.ts` | adds separate `src/studios/motion/bootstrap.ts` script | One window, both modules. Avoid repeated global event subscription. |
| `package.json` | includes Video-side dependencies/tests | foundation frontend dependencies | Keep Video additions and Motion test coverage; no duplicated Tauri runtime. |
| `src-tauri/tauri.video.conf.json` and `src-tauri/src/motion/tauri.release.conf.json` | Video-specific override | Motion-only NSIS override | Separate build flavors until the **unified** config has passed all combined native E2E. |

### Critical lifecycle edge case

In Motion's current standalone branch, `bootstrap.ts` captures
`originalPreview` and `originalTimeline` at module load and
restores these on return to Video. In the Video branch,
`mountVideoStudio()` uses real Video Editor DOM and manages its own
`setActive()`. A naive cherry-pick can show a **stale Video
placeholder** after switching Motion → Video or leave both editors
fighting over `.preview` and `.timeline`.

**Required fix on a reviewed integration branch:** one owner for
selected tab and viewport container; Video's real
`videoStudio.setActive(false)` before Motion mount and
`setActive(true)` after Motion unmount, with controlled DOM ownership
rather than restoring a static captured M0 placeholder. The Motion
`MotionHost` retains native project state across tabs; FilmCraft
retains its own scoped document and requires its separate media
permissions. A cross-studio command must never implicitly alter
another studio's project.

## 3. Safe future merge protocol (NOT performed in M13)

1. Wait for standalone Video AND Motion verified native tests and
   their **actual Windows WebView2 click tests**.
2. Create a separate integration branch from a reviewed main SHA.
   Never merge into main directly or modify Video owner branch from
   the Motion chat.
3. Add both source trees without moving pinned `vendor/filmcraft`
   or `vendor/effectcraft` Gitlinks.
4. Manually reconcile Cargo dependency union, Tauri native command
   registrations, capabilities and the one-window nav lifecycle.
5. Run independent FilmCraft and EffectCraft end-to-end artifacts,
   plus combined tab switch, cross-studio native state persistence,
   source pin checks and approved path boundary tests.
6. Package a Windows installer only after those E2E gates pass.
   An unsigned CI NSIS artifact is **not** a signed public release.

### Never claim before evidence

- M13 syntax preflight / production WebView improvements: committed,
  not proof until Windows CI succeeds.
- Full Video+Motion app: **not merged or verified**.
- Signed installer: **not available**.
- AI editing permission: **not enabled by this milestone**.
- Native MP4 export in Motion: **not implemented**.
