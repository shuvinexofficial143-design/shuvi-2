# Shuvi Video V-AI09 — Canonical A07 guarded FilmCraft native adapter

Date: 2026-10-30. Owner: original Video branch only.
Original source from FilmCraft remains unmodified. Canonical A07 source remains pinned at `64bf23e4cb9b4c95ca88b2f07ce9d57f7c2fa3e4` and is NOT copied into this repository tree.

## Actual source
A new standalone Rust package `original-editors/Shuvi2-Video/a07-native-bridge/`, deliberately **outside the original FilmCraft Cargo workspace**, links to its real `filmcraft_engine::Session` plus the exact canonical A07 `shuvi-ai-provider` crate checked out read-only at `a07-canonical` by the Windows CI job.

Its `VideoOwner` implements A07's actual `NativeOwner` trait with native project SHA, explicit trusted project/session identity supplied by the host, strict `video.split` allowlist, original `filmcraft_edit::razor_items` through `Session::edit_sequence`, independent post-edit timeline/clip readback, affected left+right object SHA and native project revision changes.

A07 `GuardedHost` invokes real SQLite `TransactionalLedger` reservation, persisted binding, one owner consent fixture, durable intent, real FilmCraft clip split, native verified object receipt and duplicate rejection. Tests then perform actual FilmCraft `.fcproj` SaveAs + Reopen and check exact clip count.

## Safety / NOT production ready
- The owner consent used in isolated bridge tests is explicitly a **test-double**, not a Windows trusted native user click.
- This is NOT yet connected to the running egui app or shared manual+AI lock; no renderer, JSON, provider or user prompt can invoke the isolated package.
- Before production integration, the native UI must move every manual editing command and AI command under the same owner admission/revision lock, use a private persistent SQLite path and native owner identity, keep credentials in Windows Vault, review real consent, Stop/recovery and malicious race tests.
- The standalone adapter deliberately only allows one native mutation per instance; multiple actions require a new owner adapter after a new verified A07 receipt. Uncertain results must never be retried automatically.
- Real provider, live Windows UI owner click, installed app E2E, export and MP4 verification are NOT yet claimed.

## Windows test details
CI separately checks out the pinned canonical A07 crate and the Video branch, then runs `cargo test --manifest-path original-editors/Shuvi2-Video/a07-native-bridge/Cargo.toml -- --nocapture`. Original FilmCraft workspace tests and native EXE build continue separately. A test that fails compilation should be fixed before claiming success.

The known V-AI03 native Windows ZIP artifact from completed GitHub Actions run `41032852702` is an actual original FilmCraft EXE baseline, NOT this adapter or a production AI-connected release.
