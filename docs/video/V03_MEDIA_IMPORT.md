# Video Studio V03 — actual media import + metadata + persistent IDs

## Native contract

Tauri command `video_import_media({ selectedRoot, projectPath, sourcePath })` is an owner-initiated action. Typed wrapper: `src/studios/video/media.ts`.

- All three paths must be absolute; selectedRoot must be an existing directory.
- Media and project must resolve under selectedRoot, including after canonicalization of symlinks and parent directories.
- Project must have `.fcproj` extension; supported V03 media: MP4, M4V, MOV, MKV, WebM, AVI, WAV/WAVE, M4A, MP3, PNG, JPG/JPEG.
- Media must be nonempty, readable and no larger than 384 MiB. The **upstream `filmcraft-cli probe` reads the full file into RAM**. On an 8 GB laptop this limit is intentional; V04+ should add streaming metadata for larger files instead of blindly raising it.
- A lock file prevents two concurrent imports into the same project. A crash can leave a lock file requiring manual recovery.
- FilmCraft CLI `probe` returns *actual* duration in ticks, video width/height and rational frame rate. Unknown or audio-only metadata is null for video-specific fields.
- FilmCraft `import` is run with `--save-as` for a new project, or `--project ... --save` for an existing project. No model-generated arguments. Original media bytes are referenced, not copied.
- The returned native FilmCraft `itemId` is checked against `project.inspect` after reopening the saved project. The pair (`projectPath`, `itemId`) is stable across restarts. It is NOT a global ID and **not** a timeline clip ID.
- `projectReadback` and `projectRevision` come from actual FilmCraft state; duration is converted with exact FilmCraft timebase 254016000000 ticks/s.

## Tests / evidence

Rust always-on tests: block unsupported extensions, path traversal/out-of-root sources, nested bin identity checks. The real MP4 test uses a 1-second, 64×64 12 fps H.264 MP4 fixture generated with ffmpeg 7.1.5. It asserts the actual probed dimensions/fps/duration, nonzero saved project, returned ID and saved-project readback.

Run real smoke in Windows CI only after the pinned CLI is successfully compiled:

    cargo test --manifest-path src-tauri/Cargo.toml --lib video::media::tests::real_mp4_import_round_trip -- --exact --ignored --nocapture

`SHUVI_FILMCRAFT_CLI_PATH` must point to the trusted compiled FilmCraft CLI. The V02 workflow adds this test following the V01 engine smoke.

## Limitations

This is a native backend API + typed TS caller only. No functional manual import picker/UI is wired yet (owned by V08); no timeline editing, proxy, preview, or MP4 export is claimed. The 384 MiB metadata limit needs future streaming redesign. Media compatibility for any actual file depends on codecs supported by the pinned FilmCraft build. No code is copied to or modified in the Motion Studio branch.
