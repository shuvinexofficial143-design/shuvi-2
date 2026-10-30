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
