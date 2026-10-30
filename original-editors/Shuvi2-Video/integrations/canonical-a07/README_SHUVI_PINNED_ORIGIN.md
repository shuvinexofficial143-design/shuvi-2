# Shuvi 2 FilmCraft — exact pinned canonical A07 source copy
Source repository: `shuvinexofficial143-design/shuvi-2`
Source Git object: `64bf23e4cb9b4c95ca88b2f07ce9d57f7c2fa3e4`
Source subtree: `src-tauri/src/ai_director/`
Destination: `original-editors/Shuvi2-Video/integrations/canonical-a07/`

This is an internal checked-in copy of the actual canonical A07 provider/ledger/guard source, not a rewritten implementation. All seven src/ files and four original tests/ files must remain byte-identical to the exact pinned source commit; GitHub Actions checks their SHA-256 hashes against the pinned checkout. Cargo.toml differs ONLY by appending an explicit `[workspace]` marker and a source-local comment, so Cargo can build it as a separate workspace under FilmCraft.

**Security:** this source copy does NOT enable native AI editing in the FilmcraftApp. The actual A07 bridge and native test-only owner consent remain separate. Original FilmCraft UI must use one common owner and a true Win32 owner consent UI, durable A07 ledger and verified native action receipts before any production AI command is exposed.

Never update this vendor subtree without updating the exact source ref AND verifying all copied source hashes. No provider key, secret or runtime credential is included here.
