# M-AI05 — Exclusive Manual/AI Session Gate + Native Save/Reopen Proof

Branch: \`feature/shuvi2-original-motion-ai\`
Owner: Shuvi 2.0.2 Original EffectCraft AI
Authoritative ledger: \`feature/shuvi2-ai-director\` fixed SHA \`64bf23e4cb9b4c95ca88b2f07ce9d57f7c2fa3e4\`

## Real implementation
This milestone enhances **only the isolated cross-branch native integration harness**, leaving the original EffectCraft desktop egui UI, its original editable effects, film editor and shared Tauri app unchanged.

\`ExclusiveMotionSession\` holds the same EffectCraft \`Session\` in a single-threaded \`RefCell\`. The \`manual_command\`, \`with_native_owner\`, live \`native_inventory\` and \`revision\` methods all use \`try_borrow_mut\` / \`try_borrow\` to fail with a *busy* result instead of allowing a nested manual edit during native guarded admission / action / receipt. This matches the source's single-threaded egui model but is **NOT** a thread-safe or cross-process gate; it still needs the full 2.0.5 OS/native integration before desktop editing is authorized.

## New tests against actual EffectCraft Session and the REAL SQLite ledger
1. Real manual \`comp.new\` changes the same session that the guarded owner reads, and the inventory reflects its actual object ID.
2. A re-entrant manual edit or inventory read during \`with_native_owner\` fails closed and the same session is available after release.
3. A real SQLite task reserve -> persisted owner-consent claim -> \`GuardedHost::execute\` causes a real native composition edit. An explicit **test-only** consent callback tries to re-enter the manual UI and is blocked. The SQLite step is marked verified. After releasing the gate, normal manual editing resumes. A replay of the guarded task is refused.
4. A real manual edit after SQLite reservation changes the revision: \`request_consent\` rejects a stale project **before** invoking any owner callback.
5. After a real SQLite-approved \`comp.new\`, the original engine's \`file.saveAs\` writes a genuine \`.ecproj\` file to a temporary test directory. A second \`Session::new\` opens it via \`file.open\`, verifies the saved native composition dimensions/duration and checks disk SHA-256 and that SQLite retained a verified step.
6. A two-step SQLite plan uses existing native composition ID and two different title layers. After the first native \`layer.newText\` yields verified SQLite receipt, Stop commits between steps. The second step cannot execute and the second layer is absent, including after the ledger reopens.
7. Existing M-AI04 tests still check real project/native text-layer readback, denied consent, Stop before first edit, stale version rejection and the true 2.0.3 provider action allowlist.

## Strict truth boundary
- M-AI05 tests run in a separate isolated crate under \`integrations/shuvi-director-motion\` with temporary on-disk SQLite. **The consent is explicitly a test double; never represent it as user approval.**
- The exclusive \`RefCell\` gate does NOT cover the actual original UI yet, and is not a lock across threads/processes; the release integrator must replace/adapt it to the real single-owner path covering all manual and AI calls.
- The production UI's Approve button is disabled. \`OwnerPermit\` in the M-AI03 adapter has no production constructor. No actual AI-generated plan is run here, no actual provider API call is made, no real Windows native approval is shown, and no installer/E2E GUI test is claimed.
- The test-only save/reopen happens in a temporary directory, not in a real user project. It does verify real serialized EffectCraft file bytes, rather than a simulated file.
- The original effect editor, original native source, and all other component branches remain intact.
- Final PASS status requires the exact current HEAD GitHub Actions workflow conclusion, not only a successful older workflow.

## Next M-AI06
Audit actual M-AI05 CI output, fix any compile/schema/lock errors. Extend vetted typed Motion actions toward shapes/effects/transforms only after independent geometry/object readback checks. The release integration branch owns full UI binding and OS trust boundary.
