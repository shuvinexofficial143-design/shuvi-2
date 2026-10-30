# Shuvi2 FilmCraft V-AI19 — Pinned Canonical A07 Source Inside Own Repo

2026-10-30 / working branch `feature/shuvi2-original-video-ai`.

## Why
Earlier A07 SQLite/native bridge tests depended on a separately checked-out sibling directory `a07-canonical`. Original FilmCraft could not be made self-contained for future production integration without carrying the same, verifiably pinned canonical provider code. The new source snapshot is stored at `original-editors/Shuvi2-Video/integrations/canonical-a07/` in the owned Shuvi2 repository.

## Exact provenance
Original: `shuvinexofficial143-design/shuvi-2` at `64bf23e4cb9b4c95ca88b2f07ce9d57f7c2fa3e4`, subtree `src-tauri/src/ai_director`. Seven `src/` Rust files and four `tests/` Rust files were copied verbatim. `Cargo.toml` retains original dependencies and adds only a comment plus `[workspace]` marker for safe nested standalone compilation. `README_SHUVI_PINNED_ORIGIN.md` records the identity.

## Real CI enforcement
Windows workflow still checks out the exact pinned canonical commit for an immutable baseline. It now SHA-256 compares every one of the 11 local Rust sources and original test files against that baseline, fails closed if any differ, and checks manifest begins with the original content and ends with the isolation marker. The original A07 unit tests run against the checked-in local provider source; the A07 guarded FilmCraft bridge's dependency now references `../integrations/canonical-a07`, not a sibling checkout. Same canonical SQLite, provider and WinCred backend; no API key included.

## Critical limitations
This is exact source co-location and bridge dependency migration; it is not a claim that the FilmcraftApp production executable is already linked to it. Production `FilmcraftApp` does not yet depend on canonical A07 or expose a trustable Save/Approve button. Existing AI-exclusive native GUI tests, test fixture consent and real Windows dialog code remain separate until reviewed integration. No actual Windows dialog click has been tested. Keep `ai_mutations_enabled = false` until owner admission, SQLite persistence, WinCred and UI E2E are complete and CI verified.
