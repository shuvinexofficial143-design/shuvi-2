# M18 — First real Windows WebView2 editor E2E success; repair corrupted proof verifier

Repository: `shuvinexofficial143-design/shuvi-2`
Owner branch: `feature/shuvi2-motion-studio`.
This document distinguishes **real test evidence** from a still-failing
CI release gate. Do NOT merge or change Video Studio or either engine pin.

## 1. Precisely observed M17 source-run results

Actual GitHub Actions [M17 Motion workflow 41016823398](https://github.com/shuvinexofficial143-design/shuvi-2/actions/runs/41016823398):

- Native EffectCraft Bridge test/proofs: **SUCCESS**.
- Production Tauri Windows EXE compiled and found: **SUCCESS**.
- `npm test`/front-end preflight in GUI job: **SUCCESS**.
- Real Windows 2022 WebView2 Tauri WebDriver: **all 11 user-click stages PASSED**.
- Owner-selected `.ecproj` saved to disk and reopened in the same process.
- Real native PNG frame, Gaussian Blur effect, mask, undo/redo, three-frame
  image-sequence export (no overwrite) all successfully verified from disk.
- Switched Video -> Motion without losing native composition.
- Fully quit the desktop process, relaunched, reopened the same `.ecproj`
  and compared real native PNG SHA-256 across restart: **equal**.
- Native screenshot and receipt artifact:
  [GitHub artifact 12961190555](https://github.com/shuvinexofficial143-design/shuvi-2/actions/runs/41016823398/artifacts/12961190555)
  contains **four real PNG desktop screenshots** and a
  `receipt.json` with `ok:true`, exact engine pin and 11 actual steps.
  The evidence was independently retrieved and the PNG signatures and
  lengths inspected in this M18 developer chat; it is not generated imagery.
- Exact artifact evidence receipt source SHA:
  `bff3f63754de7d785b21c6108b3ce4c0b087ffc9`.
  Native EffectCraft source pin:
  `fa9cf47175834162806b6b03d83fb2f4bdaeeafa`.
- Independent recorded SHA-256 for original exported PNG, PNG sequence
  first frame, and after full-process reopen:
  `f6a8809841e0955649b58af7dc8bfbf6cf9e8f15959742a24155c6053a1b63aa`.
- Foundation [41016823325](https://github.com/shuvinexofficial143-design/shuvi-2/actions/runs/41016823325):
  both frontend and native tests **SUCCESS**.

**But the M17 Motion workflow was overall FAILURE.** After all 11 GUI
steps were PASS, the `Independently verify actual GUI screenshot and
cold-restart artifact before release` PowerShell step aborted with:

```
ParserError: scripts/motion/verify-desktop-proof.ps1:36
The string is missing the terminator: '.
```

Inspecting the committed script discovered a truncated SHA256 regex at
line 36 and a repeated trailing block after the initial final PASS
message. This was a **broken PowerShell script**, not a failed native
editor, not a failed screenshot and not an installer build failure.
Because the verifier failed, the gated unsigned NSIS installer job was
correctly SKIPPED. No signed or unsigned installer artifact exists
from that workflow.

## 2. Exact M18 repair

1. Entire `scripts/motion/verify-desktop-proof.ps1` rewritten as one
   complete fail-closed script, without duplicated blocks or cut-off
   strings. It checks: actual `ok:true` real Windows/Tauri source,
   exact GitHub runner/receipt SHA equality, reviewed EffectCraft
   Gitlink pin, 11 exact ordered GUI stages, Undo/Redo, entire-process
   cold reopen, 3-frame owner PNG sequence, exported/first-sequence/
   cold-reopen SHA-256 equality, nonempty project/PNG, four real PNG
   screenshots and native screenshot reference.
2. The Windows **Native Engine job** now runs the real PowerShell parser
   on GUI verifier, negative-gate tests, WebDriver launcher, and NSIS
   packaging script **before** the heavy Rust compilation.
3. Added `scripts/motion/test-desktop-proof-failclosed.ps1`.
   After the actual real E2E passes and its true receipt is verified,
   the script copies that genuine artifact into temporary isolated
   folders, falsifies **one dimension per case** (8 variants:
   false success, fake commit, fake engine pin, frame SHA, cold restart
   SHA, omitted native edit stage, missing screenshot, broken PNG
   signature), and requires the independent verifier to **reject
   every one**. Originals are never modified. This produces no fake
   positive acceptance.
4. The actual Windows E2E job must PASS both real verifier and these
   eight negative tamper tests before it is green and can unblock
   installer packaging. The installer job continues to require
   `needs: motion-desktop-e2e-windows` and exact Git SHA.
5. Frontend source contract tests protect original bug symptoms (one
   expected array and one final PASS, valid SHA regex, no duplicate
   block), full 11-step contract, parser preflight, 8 forgeries and
   required order. Same-turn in-process V8 source audit:
   **29/29 PASS**. This is not a completed new Windows CI run.

## 3. What has NOT happened

- No exact-M18-head independent PowerShell gate PASS or 8/8 negative
  Windows tamper suite has yet been observed.
- No unsigned NSIS executable / verified installer SHA-256 has yet
  been produced for M18.
- FilmCraft+EffectCraft unified desktop has NOT been merged.
- Motion PNG image-sequence is NOT an MP4 exporter.
- The right-side AI chat is not connected and has no authorized editing.

M18 must be graded by the new exact-head Windows jobs, not the
historical M17 source run or the local source contract evaluation.
