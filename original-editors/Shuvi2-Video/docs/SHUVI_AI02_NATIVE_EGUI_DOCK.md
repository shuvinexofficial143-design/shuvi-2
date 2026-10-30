# V-AI02 — Original FilmCraft Native egui Shuvi AI Dock
Date: 2026-10-30
Branch: feature/shuvi2-original-video-ai

## Implemented
- New native panel `ShuviAi` registered as a real `PanelKind` with standard craft-ui docking, floating, Window-menu enumeration, naming and persisted workspace support.
- Default Editing workspace includes Shuvi AI as the active tab of the ORIGINAL right Properties / Essential Graphics / Text group, retaining those tabs, Timeline, Program and project panels.
- Native UI draws inside `panels::show` (not Tauri HTML) and owns a local, non-persisted draft in `FilmcraftApp.shuvi_ai`.
- Reads the exact `app.session` used by manual editing. The readback is revision/epoch-keyed and can be manually refreshed, showing real project name, save state, active sequence and clip counts.
- No provider request, fake completed chat, synthetic mouse/keyboard edit, or embedded credential.
- Send/Approve/Stop disabled; there is no fake progress or cancelled state. Clear draft and Refresh are real UI operations.

## Tests / verification
- Native tests verify right docking preserves original panels, dynamic session readback follows revisions and draft clearing is read-only.
- `.github/workflows/shuvi2-video-ai01.yml` tests engine and UI package on Windows and builds the original FilmCraft Windows EXE from own Shuvi source.
- A native Windows build/test is NOT GUI launch E2E; independently inspect screenshot from launched app before calling the sidebar visually verified.
- A disabled Send button is intentional until owner-bound A07 native integration, consent, vault, idempotent ledger and manual/AI exclusive lock are proven.

## Next V-AI03
- Define a typed, hard-allowlisted native action schema and owner-only admitted execution against the SAME `FilmcraftApp.session`, with atomic revision/document checks and exact readback after each action.
- Review A07 transactional ledger integration instead of inventing a duplicate.
- Keep destructive edit and file overwrite disabled without explicit owner scope.
