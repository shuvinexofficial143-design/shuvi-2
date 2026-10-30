# V09 — Real frame scrubbing (bounded native preview)

- Video owns a scrubber control in the one-window FilmCraft center panel, driven by the persisted `sequence.inspect.duration` rather than synthetic tracks.
- Moving the slider requests the real `video_preview_frame` Tauri command with active project SHA-256 and selected time; it doesn't create fake preview frames.
- A pure JS coordinator debounces by 160ms, keeps **one native rendering request in flight**, coalesces pending slider movements to newest, and discards superseded or wrong-project results. Native rendering itself cannot yet be cancelled mid-process.
- Before import/edit/export/reopen, the UI invalidates pending frames and **awaits the running native frame** before changing the project. This prevents lock-file collisions. When switching to Motion, old render results cannot paint over Motion.
- Tests in `tests/video-scrub.test.mjs` verify coalescing, stale frame suppression, pause-and-drain behavior, error handling and disposal using a controlled renderer. The renderer in these unit tests is a test double; only the separate Windows FilmCraft CI verifies real PNG rendering.
- Limitations: scrub UI is on-demand frame seeking, **not** continuous 30fps video playback. A previous render can occupy the worker until completion; progress/cancel are future tasks. Installed Windows desktop mouse E2E remains distinct from CI build verification.
