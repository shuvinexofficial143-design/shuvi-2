# Shuvi Video V-AI07 — canonical native project + clip object SHA-256

Working branch `feature/shuvi2-original-video-ai`. Original FilmCraft and licensing preserved.

## Actual implementation
- FilmCraft native project SHA-256 computed from `filmcraft_format::encode(&session.project, false)`, not UI strings, Python mocks or provider-supplied data. It changes on a real edit and restores with a native Undo. This reflects the editable in-memory project, including unsaved changes, not the disk file path/bytes or current OS state.
- A07 read-only fingerprint reports versionSha256, revision, document epoch and active sequence ID for future matching with canonical A07 `Version::VideoSha256`.
- Native clip object SHA-256 hashes the exact `TrackItem` located by `ClipId` in the original current FilmCraft Session. It refuses invalid, unknown and duplicate IDs. Does not expose clip content or paths to the model.
- Uses the same established sha2 0.10 already in the FilmCraft Cargo.lock dependency graph; updates the engine crate's exact lock dependency list for Windows CI `--locked`.
- Original right-sidebar displays live native project SHA-256; actual A07 preflight remains read-only with Send/Approve/Stop still disabled.
- Added native regression tests for unchanged read-only fingerprint, changed real project after edit/Undo, changed clip proof after a real split and invalid IDs.

## Important distinctions and remaining gates
A SHA-256 value is ONLY one piece of a native A07 plan VERSION and does not establish project ID, owner session ID, shared manual/AI admission lock, trusted native owner consent, on-disk SQLite approved-task ledger or crash-safe idempotent receipts. It is NOT sufficient authorization. Canonical A07 ledger/Windows Credential Vault/provider stay in `feature/shuvi2-ai-director` and must be merged by the Integration owner with a reviewed single native Session owner.
No real model calls, external HTTP edit permission, GUI capture or MP4 output are claimed from these source changes. All AI mutation readiness booleans remain false.

## Evidence
At milestone start Windows CI `41035516200` had passed canonical A07 Provider, Windows Vault and SQLite ledger tests in its separate job, while original FilmCraft native UI/EXE was still building. Historical CI `41032852702` had passed native Session contracts and owner kernel tests and was still compiling egui UI tests. This milestone's new Windows run must pass before claiming compilation proof.

## UI performance follow-up
The SHA-256 is cached in \`NativeVideoSnapshot\` when the original editor performs its revision-keyed native readback. The egui paint loop displays the cached hash instead of re-serializing the entire film project on every frame. Live revisions trigger refresh; manual refresh is provided for non-revision metadata. This is not a persistent A07 approval token.
