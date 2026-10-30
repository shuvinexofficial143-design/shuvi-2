# Shuvi FilmCraft V-AI17 — real Windows SQLite fixture collision repair

On CI run 41059762875 at the exact V-AI16 HEAD, the pinned canonical A07 suite passed; new native owner consent tests 5/5 passed, real FilmCraft A07 host 6/6 passed, shared owner suite 10/11 passed. The remaining `admitted_direct_manual_razor_invalidates_pending_a07_plan_before_owner_prompt` test failed at `shared_owner_admission.rs:25`, where the test fixture's `TransactionalLedger::open(guard.sqlite3)` returned `Io`. It did NOT fail its native clip mutation or its version fence; neither was reached.

Fixture defect under audit: `Tmp::new()` used only process ID + Windows wall-clock nanoseconds, then `create_dir_all`. Windows clock resolution is not guaranteed unique across parallel Rust tests, so distinct tests can share a directory and one RAII Drop can remove the live SQLite WAL directory of another test, giving IO errors. This commit strengthens the fixture:
- Per-process monotonic AtomicU64 sequence appended to timestamp and PID; `create_dir` (not `create_dir_all`) refuses to reuse an existing directory, with bounded collision retry.
- Directory remains alive until the corresponding fixture is dropped; no changes to actual canonical SQLite storage implementation or production app.
- A 16-thread barrier regression concurrently opens 16 real canonical SQLite databases, verifies they are all unique, runs `PRAGMA integrity_check` via the existing `TransactionalLedger::integrity_check()` method and checks each was removed after Drop.
- CI must prove whether this resolves the observed IO failure; exact root-cause attribution to collision is a reasoned hypothesis, not yet independently proven. If another failure appears, inspect the new log rather than reporting PASS.

Production readiness unchanged: FilmcraftApp remains distinct from the standalone canonical A07 owner crate; live AI edits stay disabled until the same authoritative owner and real modal are integrated, reviewed and tested end-to-end.
