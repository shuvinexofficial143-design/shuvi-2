# Shuvi2 FilmCraft V-AI20 — Native GUI A07 Identity Fencing

## Scope
Actual Original FilmCraft production `FilmcraftApp` now owns a unique local `NativeA07Identity` seed created in `FilmcraftApp::new`. It provides a trusted project/session identity computed from original `Session::document_epoch`, path, active sequence and a native per-instance counter through a per-instance `RandomState` keyed SipHash. No model/JSON/WebView may supply these IDs.

- Normal timeline mutations do not rotate the owner session identity; their changed native project SHA-256 is separately checked in canonical A07, so multi-step approved tasks can continue after verified actions.
- Document reopen/switch/SaveAs and active-sequence changes rotate native owner identity, preventing a plan reserved for one native context being blindly reused in another context.
- New FilmcraftApp instances have different local identity even with identical initial project bytes, preventing automatic cross-session approval reuse.
- No original path is displayed in project IDs or model payload.
- The identity is **not cryptographic authorization**, a secret, an approval click or a durable project UUID; canonical SHA, SQLite approval and independent native readback remain mandatory. The session counter is only process-local; uniqueness between distinct processes comes from OS-seeded `RandomState`, not guaranteed by the counter alone.
- The native GUI AI editing sidebar remains disabled; only the future trusted integration may pass the derived IDs to `VideoOwner::new` while the same owner is held.

## Testing
Actual `filmcraft-ui-egui` Rust regression tests verify identity stability during native edits while SHA changes; invalidation on original document reopen; distinction across new app instances; and refusal to accept any renderer identity parameter. Windows CI runs those tests via existing `shuvi_manual_admission` filter. No live Windows modal, provider network request, or model-controlled edit is performed.

## V-AI20 correction — actual timeline versus context switch
The original identity test uses the real FilmCraft demo sequence plus `filmcraft_edit::razor_items` native timeline split to verify the owner identity stays unchanged across ordinary clip edits while native project SHA changes. A subsequent `file.newSequence` is correctly classified as an ACTIVE SEQUENCE CONTEXT SWITCH and must rotate owner session identity; the earlier test incorrectly expected the same identity even after this context change. New `FilmcraftApp::with_shuvi_trusted_a07_context` computes both host-origin IDs within the exclusive native owner lease and passes them only to a trusted Rust callback. Regression tests verify no model-controlled JSON may substitute IDs and an existing manual owner cannot be upgraded into AI owner. No production AI execution enabled.

## V-AI20 Canonical SQLite source-bound identity E2E (headless)
The existing true Original `FilmcraftApp` + canonical A07 SQLite tests now call `FilmcraftApp::with_shuvi_trusted_a07_context` instead of constructing `VideoOwner` with fixed, hardcoded testing IDs. The owner-derived native project and session IDs are generated UNDER the real GUI exclusive AI owner transaction, and passed only to genuine `VideoOwner::new` + `GuardedHost`. This ensures old task approval cannot be borrowed by a different document merely by substituting a renderer-provided ID. Additional Save As regression: reserve actual project/clip in canonical SQLite, use the original `menus::invoke(file.saveAs)`, verify native identity rotates, and require `GuardedHost::request_consent` to reject the stored plan as `StaleProject` **before** calling even the test-only consent. No additional native AI edit occurs; GUI AI controls remain disabled.
