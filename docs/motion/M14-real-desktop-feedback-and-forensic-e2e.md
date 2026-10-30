# M14 — Windows desktop reliability and forensic WebView2 acceptance

Branch: `feature/shuvi2-motion-studio`.
The existing draft Motion PR remains unmerged. Video Studio, main and both
native vendor pins are unchanged.

## Main engineering problems addressed

A Native Windows build can succeed while real user clicks are still broken.
The prior M10 Windows E2E failed **before its first click** from malformed
`async` callbacks. M13 repaired the syntax and introduced Node preflight.
M14 adds protection against another class of misleading Windows UI evidence:
silent busy clicks and incomplete error diagnostics.

### Owner commands are not silently lost

Before M14, Motion Studio's `execute(label,action)` returned immediately
when another action had `busy=true`, without a visible acknowledgement.
A user could click Add Shape, Save, or a Native Undo button and mistakenly
believe that their second requested edit was executed.

Now:
- a busy click is **explicitly rejected**, not queued or secretly executed;
- the rejection appears in `#motion-command-notice` with `role=alert`;
- the notice persists until a later accepted action (rather than being
  instantly replaced by the in-flight action's success message);
- native operation SUCCESS is reported only **after the UI has returned to
  its idle state**; all failures are reported as failures;
- the existing native worker remains bounded to 32 admitted requests with
  an expiry guard. This change does not grant AI agents editing consent.

### Forensic Windows GUI E2E evidence

`tests/motion/desktop-e2e.mjs` still requires real Tauri WebView2 launched
by the official Windows WebDriver and real underlying EffectCraft native IPC.
There is no browser-only fake, mocked invoke or screenshot substitution.

Before and after each real click-test phase it now writes a
`proof/motion-desktop/progress.json` report explicitly marked `ok:false`,
listing completed vs in-progress stages. If an action fails, it attempts to
capture:
- `motion-failed.png`: native WebView2 screenshot from the failed session;
- `motion-failed-webview-dom.html`: actual driver-reported WebView DOM;
- native `#motion-status` text and JavaScript stack;
- `receipt.json` with `ok:false`, failed stage and error.

A passing receipt is still issued **only after** mask/effect pixel
differences, actual project PNG export/no-overwrite, owner native Undo/Redo,
same-session and cold-process project reopen, byte-for-byte PNG SHA-256
checks, and all real Windows screenshots.

### Windows CI throughput and artifact hygiene

`.github/workflows/motion-smoke.yml` now groups matching branch runs with
a `concurrency` key and `cancel-in-progress: true`, so **new** commits
don't continue consuming Windows native build time on already superseded
Motion source. Cancellation is NOT a PASS. Existing older runs that used
a workflow version without this group may still appear in GitHub's queue.

The PowerShell WebDriver launcher now downloads `msedgedriver.exe` under
runner temporary storage, not the `proof/motion-desktop/` artifact folder.
The uploaded artifact thus contains receipts/screenshots/driver logs, not an
unnecessary third-party executable.

### Additional fail-fast tests

New `tests/motion-desktop-controls.test.mjs`, included in `npm test`,
asserts that the actual Motion UI has the controls used by WebDriver and
that every click has the exact native completion label it expects. It also
guards against invalid `async=>`, mock preview alternatives, missing
cold-restart checks and missing failure evidence.

`tests/motion-ui.test.mjs` now covers explicit busy rejection, status
ordering, progressive screenshots and CI concurrency. A same-turn
in-process V8 source-contract evaluation found the existing 19 source checks
and all 3 new selector/label checks passing. This is **not** a substitute
for the real Node/Rust GitHub Actions or Windows WebView2 interaction.

## Acceptance and honest status

M14 is not considered Windows-verified merely because it is committed.
The following must be checked **for one exact M14 SHA**:

1. Windows Foundation frontend `npm test` + TypeScript/Vite build PASS.
2. Windows native Tauri Rust tests + EffectCraft bridge/real PNG proofs PASS.
3. Actual `motion-desktop-e2e-windows` job PASS, not queued/skipped.
4. Screenshot and receipt artifacts exist and
   `scripts/motion/verify-desktop-proof.ps1` confirms all required evidence.
5. Then, and only then, a Windows NSIS installer can be built and uploaded
   as an **unsigned CI candidate**, not a signed public release.

M14 does not merge FilmCraft+EffectCraft branches, publish a signed installer,
enable unattended AI edits, or implement Motion MP4 export. The unified shell
conflict audit and integration protocol remain in
`docs/motion/M13-windows-e2e-recovery-and-unified-host-handoff.md`.
