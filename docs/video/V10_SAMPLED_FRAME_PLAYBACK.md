# V10.1 — Frame stepping and true engine sampled playback

The Video Studio now supports one-frame back/forward buttons using the **saved FilmCraft sequence rational frame rate**, not a guessed fixed rate. A clearly labelled "Sampled Frames" mode seeks ahead by 0.5 seconds only after receiving an actual verified FilmCraft Program PNG. It pauses cleanly when the end of sequence is reached, when switching studios, or before real edits. Native work is still serialized via the latest-request-wins preview coordinator, and no stand-in preview is drawn.

This is not continuous video playback, not synchronized audio and **not** 30fps realtime monitoring. User interfaces explicitly label the rate as sampled <=2fps and must not misrepresent performance. Automated pure frontend tests check rational frame-rate extraction and the existing preview concurrency tests; the full Windows WebView2 real editor E2E remains a separate gate.
