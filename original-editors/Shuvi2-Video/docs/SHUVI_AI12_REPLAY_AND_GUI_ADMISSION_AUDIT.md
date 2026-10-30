# Shuvi FilmCraft V-AI12 — Native editor access audit and A07 replay hardening

Date: 2026-10-30. Project and branch: original-editors/Shuvi2-Video, feature/shuvi2-original-video-ai.
Base e8aa6c09b59f2340ab831a6c66448c88cc7b3da1.

## Verified baseline
V-AI10 exact SHA 814f708495b1925d5d8ef409169c285e3ab09532: GitHub Actions run 41044558164 SUCCESS (original FilmCraft native Tests, Windows Release EXE & ZIP, independently pinned A07 Vault/Provider, SQLite and native guarded FilmCraft integration tests).
V-AI11 first SHA df165a725b42902fc6848a0dc61a76cceac9a73b had independently finished its canonical A07 SQLite/native bridge test job successfully at the start of this batch. Its native release job and the later V-AI11 identity-rotation run may not have finished.

## New V-AI12 regression tests
- Two separately stored canonical A07 plans on the SAME real native FilmCraft Session may both reserve and obtain the test-only owner consent before any edit. Only the first may mutate. The second MUST fail with StaleProject before native intent or clip mutation. SQLite verified/not_started states must survive reopening the real DB.
- One already-approved A07 plan must become stale if a real manual FilmCraft SaveAs changes the editor's trusted native document context; no new A07 edit intent and no replay.
- A forced panic inside an A07 owner closure POISONS the mutex. Subsequent manual command, snapshot, readback and A07 guarded attempts must all fail closed with Poisoned, never silently recover the potentially invalid Session.
- A real manual native newSequence AFTER A07 consent but BEFORE its first edit must force StaleProject with SQLite state not_started.
- Existing V-AI11 tests still cover same Mutex conflicting manual/new/open/save/undo command rejection while canonical SQLite native guarded execution is holding that Mutex, task denial, session ID rotation on reopen and stale prior consent.

## Production GUI route audit (actual source)
- `crates/ui-egui/src/lib.rs` declares `FilmcraftApp { pub session: Session }`, not `NativeVideoAdmission`. That session is directly accessed from many draw/input/persistence paths.
- `crates/ui-egui/src/menus.rs` routes ordinary edit menu calls to `app.session.execute(id,params)`; it also has direct preference/source/clipboard command calls. `crates/ui-egui/src/control.rs` routes engine.execute/ui.menu.invoke through `menus::invoke`, while synthetic pointer/key commands go through the original UI input pipeline.
- `crates/ui-egui/src/app.rs` directly calls persistence, render-job and event handlers on the Session; exact native panel editing can use engine APIs without going through `menus::invoke`.
- Therefore wrapping ONLY menu commands in a new mutex would be a dangerous false claim: native panel, background and import/save paths could bypass it. The V-AI11 testable `NativeVideoAdmission` is currently built as a separate standalone bridge crate outside the original egui workspace.

## Integration requirements (MUST NOT claim completed)
1. Design the single authoritative editor Session owner at the production `FilmcraftApp` boundary. All original GUI manual changes, drag-and-drop, keyboard, autosave/export jobs, tab/document switching and A07 mutations need correct admission or event-driven serialization.
2. Preserve render/frame pool lifetime semantics, mutable Session borrowing, Undo/Redo and original GUI responsiveness. A synchronous mutex held during a modal owner consent prompt can block the UI, so a reviewed asynchronous/2-phase trusted native consent protocol is required. Approval state must be durable and the live Session rechecked before any mutation.
3. Bind canonical SQLite ledger, A07 WinCred key retrieval, native project/session IDs, stale/version readback and a genuine operator UI; do NOT expose model-controlled command IDs to arbitrary native execution.
4. Production `nativeGuarded`, `sameOwnerAsManual`, `ownerConsent` and `ai_mutations_enabled` readiness flags remain FALSE until end-to-end audited.
5. Successful CI source build and isolated Rust tests are not proof the actual Windows GUI was opened or a real owner clicked a button; no external MP4/export integration is claimed here.

## Testing
`cargo test --manifest-path original-editors/Shuvi2-Video/a07-native-bridge/Cargo.toml --test shared_owner_admission -- --nocapture` (Windows CI also runs all bridge tests). Only report PASS once the exact new commit's job finishes.

## Direct FilmCraft editing path admitted in isolated gate
V-AI12 adds `NativeVideoAdmission::with_manual_session` for **trusted** native gestures which invoke `Session::edit_sequence`, `Session::edit_group`, or other direct FilmCraft mutation methods without passing through `Session::execute`. This is the same mutex as A07 reserve/consent/action. Regression tests attempt a real native `filmcraft_edit::razor_items` while the A07 gate owns the Session (must return Busy and not change project SHA), then perform the direct razor under manual admission after a SQLite plan reservation (must change SHA, and make the pending A07 owner consent fail StaleProject with no prompt or edit intent).

The new method deliberately accepts a trusted Rust closure and is not exposed as a model- or JSON-controlled dispatcher. Its presence in the isolated bridge **does not** mean that the original production FilmcraftApp has been migrated: the application still has public direct Session access. An admission API alone is not a complete audit of GUI code paths.
