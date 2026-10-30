# Shuvi Video V-AI18 — Windows CI concrete error correction

At exact prior HEAD `41db019a187b2ff5c1a39dbcecf2f802f6bb1784`, GitHub Actions run `41061287734` failed in the isolated canonical A07 bridge job at `shared_owner_admission.rs:414`: Rust `E0382: borrow of moved value: path` in the 16-concurrent-SQLite-fixture regression. This is compile-time test ownership, NOT observed actual SQLite corruption. Fix: insert `path.clone()` into the uniqueness HashSet and retain original PathBuf for checking `exists()`. Remove the now-unused GuardedHost import. Preserve the tests and the real canonical A07 ledger implementation unchanged.

The A17 source also contains dev-only genuine original `FilmcraftApp`/canonical A07 integration tests. They have NOT been shown to PASS in this CI run because compile stopped at E0382. Re-run GitHub CI on the exact next SHA; no fabricated approval or live Windows UI claims. The actual Production sidebar retains disabled AI editing.
