# M07 — Single-window Tauri EffectCraft Motion Editing

## Scope and ownership

Branch: `feature/shuvi2-motion-studio`. Pinned EffectCraft submodule:
`fa9cf47175834162806b6b03d83fb2f4bdaeeafa`. No old Shuvi repo,
FilmCraft vendor pin or Video Studio source was edited.

This milestone integrates the already verified Motion Bridge into **the same**
Shuvi 2 Tauri desktop shell. The Video Studio route still uses its existing
frontend; Motion Studio mounts its own `src/studios/motion/bootstrap.ts` in
the shared center preview/timeline region. The chat panel remains distinct
and explicitly **not connected to an AI provider**. There is no second native
EffectCraft editor window or browser-launched external editor.

## Real native architecture

`src-tauri/src/motion/mod.rs` is an explicitly bounded Tauri IPC adapter.
It constructs one long-lived EffectCraft `MotionBridge` on a named native
worker thread and sends typed commands via `std::sync::mpsc`. A separate
Tauri `spawn_blocking` worker waits for the reply so the WebView async
command does not directly block the UI runtime. This avoids requiring the
upstream compositor `Session` to be `Send + Sync`, and guarantees all
manual operations share one native project session.

The command is `motion_command`, with a `request.action` discriminant:
`status`, `createComposition`, `listLayers`, `addText`, `editText`,
`addShape`, `setTransform`, `addKey`, `easeKeys`, `render`,
`saveProject`, `openProject`. No arbitrary JSON engine command,
scripting access, shell execution, or arbitrary Tauri FS API is exposed.

Every editor action uses the same real pinned `Session`, including:
comp.new, layer.newText/layer.setText/layer.newShape, prop.set,
prop.addKey/keys.easyEase, Session::render_rgba8_alpha and file.saveAs/open.
The native render response sends bounded 8-bit RGBA pixels compressed to
PNG and base64 encoded through Tauri's own IPC. The WebView only displays
this **returned native frame**; it does not paint substitute animations.

The Motion UI supports owner-created compositions, text/shapes, manual
position, scale, rotation, opacity editing, a two-key Bezier opacity move,
playhead scrubbing with native frame refresh and scoped native file Save/Open.
An initially unavailable engine shows an honest error, not a fake preview.

## Changes to shared files and merge caution

The motion-only modules are isolated. Shared glue changed only in:
- `src-tauri/src/lib.rs` — `mod motion`, owned `MotionHost` state and
  registered `motion_command`.
- `src-tauri/Cargo.toml` — path dependency on Shuvi Motion Bridge and
  base64, plus **exact upstream reviewed** Cargo parser patch pins. Patches
  must appear in active Tauri root, not only nested bridge.
- `index.html` — one separate Motion entrypoint script; existing
  `src/main.ts` and video frontend logic are untouched.
- `.github/workflows/verify.yml` — initialize git submodules in the
  Foundation native job because that job now links EffectCraft natively.

**Potential merge conflict:** `src-tauri/src/lib.rs` and
`src-tauri/Cargo.toml` have separate Video Studio edits on
`feature/shuvi2-video-studio`. Do not auto-merge either branch into main.
A reviewed integration branch must retain **both** video and motion command
registrations, dependency patches, authorizations and matching tests.

## Repro and proof gates

```powershell
git submodule update --init --recursive
npm install --no-audit --no-fund
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path crates/shuvi-motion-bridge/Cargo.toml --all-targets
```

Windows CI needs both the Frontend (Node test/TypeScript build) and native
Tauri test including `motion::tests` passing on **the same exact final
commit**. Old headless engine smoke/artifacts remain a separate proof;
only the desktop adapter tests prove Rust calls use one live session.
A compiled IPC bridge and UI contract tests **do not** prove real
human-driven Windows WebView E2E until a screenshot and actual app test
are captured. Never report AI chat, installer, MP4 export, effects/masks
or advanced 3D tools as finished.

## Safety limits

The worker only accepts predeclared typed actions, preview max 768px,
one owner-selected existing workspace directory and a strict `.ecproj`
filename. The model cannot obtain editing authorization from the chat
draft. Existing dirty-state/overwrite guards apply. Future AI integration
must add a reviewed one-approval-per-task owner authorization gate and
automatic verification without bypassing this native command boundary.
