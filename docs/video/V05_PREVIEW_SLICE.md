# V05 early slice — True FilmCraft Program Frame PNG

This batch adds a native `video_preview_frame` IPC command and typed UI adapter `renderVideoPreview` + `applyPreviewToImage`. It calls the pinned headless FilmCraft `render` command from a saved project and reads the actual on-disk PNG (not a generated mock). Scope and project revision are checked; a shared media/timeline lock blocks concurrent edits. Scale limited to 0.1–0.5, output to 4096² max and 8 MiB; no offline placeholder is accepted because the CLI is not invoked with `--allow-offline`.

The UI adapter turns actual received PNG bytes into an object URL for use by an `<img>` in the *same* Shuvi window, with cleanup to prevent URL leaks. This is a backend slice only: no shared `src/main.ts` changes, so the visible application preview has **not** yet been wired to the center panel. That is left to the dedicated manual editing UI milestone to avoid modifying Motion Studio shared files.

Ignored-by-default Windows integration test `video::preview::tests::real_program_frame_png` imports the real H264 MP4 fixture, places it on a new sequence, renders frame at t=0.25 scaled to 32×32, and checks a real PNG header/dimensions.
