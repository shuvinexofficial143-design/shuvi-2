# SHUVI 2.0.4 — U07 Independent Studio Recovery & UI Guard Repair

Repository `shuvinexofficial143-design/shuvi-2`; owned branch `feature/shuvi2-unified-workspace`.
U06 checkpoint `e9fbb30d83e15ac0a01e82b9955706247b2d42d1` Windows Foundation CI run `41021785929`: frontend 67/67 tests, TypeScript/Vite, and native Rust tests **SUCCESS**. These are source/build checks, not installed GUI E2E.

## U07 engineering milestone

1. **Independent native recovery:** The shared Workspace Controller tracks `recoveryByStudio: {video:boolean,motion:boolean}`. Video and Motion may both have uncertain native outcomes. A successful FilmCraft refresh clears only Video's flag, while an EffectCraft status or native project reopen clears only Motion's. The other engine remains quarantined.
2. **Legacy summary:** Existing `needsReload` remains true if either Studio needs recovery. Existing `recoveryStudio` identifies the selected studio when it needs refresh, otherwise the other quarantined studio. Its value alone is never used as permission to clear a separate studio.
3. **Scoped read/write permissions:** The controller's `requireReady` and `run` check exact Studio flags; all existing IPC failures that call `set({needsReload:true,recoveryStudio:studio})` accumulate quarantine rather than overwriting another engine's state.
4. **Diagnostic integrity:** `nativeDiagnosticReport()` returns `recoveryByStudio` and independently labels Video and Motion as `recovery-required`; it does not expose a stale SHA/revision under quarantine. Error evidence stays bounded and private.
5. **UI repair:** Removed sticky `button.disabled=button.disabled||...` Motion logic that prevented a newly selected layer's controls from re-enabling. A pure `workspaceActionAvailable` computes each control on every render using native project presence, real clip track locks, selected Motion layer, inspector project revision, selected effect UID and mask UID.
6. **Cross-layer safety:** Motion transform/effect/mask edits are visibly disabled when the inspector still belongs to a different layer or an older native revision. The UI must request native reinspection before enabling those controls.
7. **Recovery navigation:** Both Studio tabs can display recovery indicators simultaneously; switching does not lose either flag. Native refresh actions and diagnostics remain available, while stale edit actions are disabled.
8. **UI synchronization:** Selecting a real FilmCraft clip immediately re-renders tool capabilities; changing effect/mask selector recomputes affected control permissions.

## Tests
New `tests/unified-ui-u07.test.mjs` checks dual-engine failure and sequential recovery; exact native operation counts; UI layer selection and revision freshness; native track locks; permission/approval state; privacy-safe diagnostic dual quarantine; source wiring and regression against permanent disabled controls.

Run `npm test`, `npm run build` and exact-sha Windows native CI. Unit tests and Windows builds do **not** prove that `mountUnifiedWorkspace` is running inside an installed Tauri WebView2 shell.

## Integration handoff
The owner of `feature/shuvi2-release-integration` (Shuvi 2.0.5) must reconcile mounting one unified window; do not cherry-pick without reviewing interface changes. Shared `src/main.ts`, Tauri native host/command registry and AI Director native task guard were intentionally untouched in U07. The AI Director's model-originated actions remain restricted to native guarded, durable, owner-approved execution, which is NOT enabled here.
