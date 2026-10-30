# Video Studio — content-based edit safety (large-batch hardening)

**Verified upstream limitation:** FilmCraft `Session::revision` increments after opening a saved project in each new CLI process; it is *not* a durable project revision token. Comparing only this integer across separate commands cannot detect manual edits.

The Video Studio now uses an additional SHA-256 digest of the persisted `.fcproj` bytes. `video_project_snapshot` provides a fresh verified snapshot, including `projectSha256`, `sessionRevision`, project tree and optional active sequence. V03 import and V04 timeline receipts also return projectSha256. Subsequent V04 actions, preview, and MP4 export **require** `expectedProjectSha256`, and fail closed with `STALE_PROJECT_CONTENT` if the file changed. The digest is rechecked after preview/export and before the timeline subprocess is launched.

The session revision is still returned for diagnostic compatibility; **it is not a persistent concurrency token**. AI must consume a newly inspected project and pass its exact digest to commands. A stale plan must refresh/replan, never retry the old plan. The lock currently coordinates Shuvi processes, not all third-party editors: concurrent external saves during the small window before CLI writes are still a possible race. Strong filesystem compare-and-swap remains future work.

This patch makes a minimal backward-compatible addition of `sha2` to the shared Tauri Rust manifest; it may require conflict review with the separate Motion Studio branch before merging. No source or files in that branch were changed. Unit test verifies that actual file changes produce a different SHA-256; integration tests include stale-digest rejection.
