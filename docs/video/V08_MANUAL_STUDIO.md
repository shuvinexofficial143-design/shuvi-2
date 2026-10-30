# V08 — Single-window manual Video Studio (FilmCraft-backed)

This is the **Video Studio development branch**, not the production `main` release. Users launch Shuvi 2 Windows Tauri shell (with the V02 experimental NSIS video package) and select the Video tab. The center panel hosts the real native FilmCraft manual editing controls; Motion Studio's existing placeholder is hidden only while Video Studio is selected.

## Current manual workflow

1. Click **Browse Folder** to select a Windows directory containing the source media and the .fcproj project; scope remains fixed to the selected root (no unrestricted AI paths).
2. Choose **New Project Path** (or **Open .fcproj**) and **Browse Media**. FilmCraft files do not need to be copied; source is referenced.
3. Click **Import Media**. Rust invokes the real FilmCraft CLI, parses media metadata, saves .fcproj and reads back the imported itemId.
4. Choose sequence width/height/fps and click **Create Sequence**. Select an imported media item and a track address V1–V16 or A1–A16. Click **Place Media**.
5. Click a real FilmCraft track clip in the timeline. Use the Playhead field for **Split**, **Move**, or **Render Frame**, Trim Frames and Edge for **Trim**, or **Delete**. Ripple editing is optional.
6. **Render Frame** calls actual FilmCraft Program render and displays the returned PNG in the existing center panel. It is *not* a synthetic preview. It requires an available rendered frame (not offline media).
7. Select **Save MP4 As** and **Export MP4** to start FilmCraft H.264 rendering. Rust probes the written MP4 stream and refuses replacement of existing files. This operation can be slow.

Only native responses update the UI status. Saved project tree and actual FilmCraft sequence tracks are inspected after edits. Stable clipId is not the same as media itemId. Project SHA-256 protects against stale AI/manual edits. No separate FilmCraft UI window is opened; native file dialogs are system-modal only.

## Code ownership / risk

Video-only UI: `src/studios/video/view.ts`, `view.css`, `model.mjs` + `model.d.mts`. Root `src/main.ts` has one import and a small mount/active-tab hook; the rest is isolated. Native Tauri dialog plugin adds minimum permissions `dialog:allow-open` and `dialog:allow-save` and corresponding Rust/npm dependencies. This modifies shared manifests/capabilities: perform a careful Motion branch conflict review before merging.

## Boundaries / not yet verified

This implementation is a manual native command UI, **not a live-playing video editor yet**. It does not implement 30fps continuous playback, drag-and-drop trim, color/effects UI, captions track UI, persistent cross-session undo/redo, AI direct editing, job cancellation/progress, or packaged Windows desktop user E2E. The UI's TypeScript build proves compilation only; it does not establish that a real user has launched the Windows installer and completed a manual session.

The archived Windows CI artifacts for earlier source commits do not include this UI. Inspect the exact most recent Video branch SHA and its own Windows integration+NSIS job before distributing any new installer.

The existing native MP4 probe reads up to 384 MiB into memory. Do not present this as full-size 4K movie ingest support. Native working evidence requires real FilmCraft Windows tests and no placeholder or mocked frames.
