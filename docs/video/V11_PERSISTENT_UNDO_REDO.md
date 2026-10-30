# V11 — Persistent project Undo/Redo across native FilmCraft sessions

FilmCraft upstream's in-session \`edit.undo\` state is not persisted between CLI processes. Shuvi now records **content SHA-256-verified snapshots of actual .fcproj bytes**, with an append-only \`.fcproj.shuvi-history.jsonl\` journal.

When a typed timeline edit succeeds and a saved \`.fcproj\` is reopened and verified, \`history::record_edit\` writes before/after snapshots adjacent to the project and journals their hashes. On a fresh app session, \`video_history_status\` loads and verifies the journal. \`video_history_restore\` only accepts explicit Undo/Redo with the exact expected project SHA, locks the same project import/edit lock, checks the stored snapshot digest, writes and syncs actual project bytes, opens the result using the **real pinned FilmCraft CLI**, checks its project/sequence tree, and commits a journal event. Undo → Redo and branching after Undo are modeled by persistent append-only events, not simulated frontend arrays.

Security constraints: rejects path escape via existing canonical project validation; rejects unsafe snapshot/journal symlinks; hard max journal 1 MiB / 4000 entries; refuses mismatched project hash and corrupt snapshots; source media untouched. Original-state snapshots remain available for manual recovery in case a process crashes during an interrupted restore.

Tests: unit replay, redo-fork and tamper detection plus **ignored-by-default Windows test** importing real H264, creating FilmCraft sequence, verifying Undo removes active sequence and Redo restores it across independent CLI sessions. The GitHub Windows Video CI invokes the test explicitly.

**Known limits:** snapshot storage is unbounded for now; history applies only to timeline edits (not import/export); restore writes are fsync'ed and backed up but not OS-atomic; external writes mid-restore not fully prevented. The surrounding UI must refresh actual SHA and frame after every restore. This is project-state undo, not deletion/recovery of source media. Do not claim verified until exact-SHA Windows CI succeeds.
