# V14.3 — Recover editor state after failed FilmCraft native operations

Native editing can persist project bytes and then fail to deliver or validate a UI receipt (readback, journal, process error). The previous UI catch block left the old project snapshot/clip IDs visible, so the next user action could attempt to edit a stale project (Rust SHA would eventually reject it, but the UI was misleading).

After any action that may mutate or reopen .fcproj, the Video Studio now calls real FilmCraft `inspectVideoProject` and `inspectVideoHistory` even on failure. If this readback succeeds, the timeline and SHA are rebuilt from disk and the error is clearly marked NOT VERIFIED. If it fails, it clears the cached snapshot, pending chat approvals, clip/media selection and frame, requiring an explicit reopen.

Rendering, probe, and MP4 export error reporting remain non-mutating and do not unnecessarily tear down the current editor. Focused unit tests preserve this distinction.

Neither failed native action nor a reloaded project is automatically treated as success. Strict UI E2E still needs a Windows runner.