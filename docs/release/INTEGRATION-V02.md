# Integration V02 — installed Windows editing verification recovery

Status: **NOT READY** until exact-commit Windows execution supplies real evidence.

## Baseline and scope

Parent: `b2051170a47e650250d05e7ba5964692d00681cd`.
Previously integrated source checkpoints remain Video `1e9860a0a67eba6c8dea420192b648667a969f39`
and Motion `535ee43147b78ce3f3516afb1734826f38fdb351`. This batch merges **no new lane HEAD**.
Native engine gitlinks stay FilmCraft `c49efe070fab862df6c21d61a503605eb6f07105` and
EffectCraft `fa9cf47175834162806b6b03d83fb2f4bdaeeafa`.

The old exact-parent integrated run [41002150168](https://github.com/shuvinexofficial143-design/shuvi-2/actions/runs/41002150168)
passed native tests, NSIS build, silent install and installed process launch. Video GUI failed
because its CDP endpoint did not answer; Motion was skipped. The separate Motion run
[41002155737](https://github.com/shuvinexofficial143-design/shuvi-2/actions/runs/41002155737)
passed native engine tests but its desktop script could not parse three `async=>` callbacks.
28 local baseline tests still passed despite that syntax defect.

## Compatibility / ownership matrix

| Area | Integrated baseline | Integration decision |
|---|---|---|
| `src-tauri/src/lib.rs` | Both Video commands and managed MotionHost registered | Preserve both; future AI approval/guard commands must join this host |
| `src-tauri/Cargo.toml` | FilmCraft boundary, EffectCraft bridge and parser pins coexist | Preserve pins and reviewed dependencies |
| `src/main.ts`, `index.html` | Video entry and Motion bootstrap share one window | Preserve live Video DOM and handlers; do not mount a competing workspace yet |
| `package.json`, capabilities | Existing Video dialogs and build/test tools | Unchanged this batch |
| Tauri config / sidecar | Existing production NSIS overlay ships FilmCraft executable | Test installed production binary; no debugging config added to product |
| AI Director | Isolated upstream contract, not wired here | Require durable native task ledger, approval and atomic project guards before writes |
| Unified Workspace | Separate upstream component, not mounted here | Review final contract and preserve both studios' features before replacing bootstrap |
| Workflows | Repeated expensive Video/Motion/Foundation builds on integration PR | Integration runs all native tests once; redundant lane jobs skip this PR only |

Fresh upstream snapshot during this batch (2026-10-30; these are NOT integrated):

| Lane | SHA | Exact-head checks at inspection |
|---|---|---|
| Video | `e7a62cf801e83052089512fb2feef59a024722bf` | Foundation FAILURE; Video Windows in progress |
| Motion | `dea267247c333143e08c37bda11bcca3e6d78b1f` | Motion workflow FAILURE; Foundation queued |
| AI | `573ac4f03d6cbabd61f50515bde85b1e0a74f3b3` | AI A02 SUCCESS; Foundation queued |
| UI | `db38bbb1e78328de17ee0208e5e7d9ca5395484d` | Foundation queued |

Refresh all HEADs/checks before a later integration. Active branches are advancing independently.

## Implemented recovery

- Parse-check both actual GUI programs in `npm test`, before expensive Windows native builds.
- Correct Motion callbacks and require byte-for-byte native PNG identity after app close/relaunch.
- Use Tauri's Windows WebDriver route for the installed production EXE. No CDP configuration,
  registry override, test-side Tauri invoke, or different instrumented executable in this release workflow.
- Installation receipt binds checkout SHA, both engine pins, installer hash, installed app hash and
  installed sidecar hash. Installed bytes must equal the just-built originals.
- Video GUI uses real controls for MP4 import, sequence/place, persistent Undo/Redo, decoded preview,
  keyboard scrub, H264 export, overwrite refusal, studio switch and project reopen after restart.
  The installed FilmCraft sidecar independently probes the real exported file.
- Both suites use the same installed path and hash. Motion still runs if the Video script returns
  failure, allowing both diagnostics to be collected. A failure cannot publish a passing candidate.
- Final gate validates receipts, hashes and required GUI PNG files. It marks only
  `editingSliceVerified`; **`releaseReady` stays false** while provider AI/UI acceptance is unfinished.
- One integrated Windows build runs previously ignored real FilmCraft smoke/media/timeline/frame/
  export/history tests explicitly, plus EffectCraft and Tauri tests. Native caching also saves on failure.
- Driver downloads stay in runner temp, outside the screenshot/evidence archive.

Reference: [Tauri manual WebDriver setup](https://v2.tauri.app/develop/tests/webdriver/manual-setup/).

## Validation and limits

Local `npm test`: 42/42 pass (28 existing + 14 release-gate/syntax tests).
Receipt tests use clearly labelled synthetic fixtures, including rejection of stale SHA,
wrong application path/hash, missing screenshots, modified disk bytes and incomplete restart.
Workflow YAML parses; `git diff --check` passes.

Local full TypeScript/Vite build could not run: this executor lacks installed `tsc`/Vite and Rust.
No local Windows runtime, real installed editing, new installer or native media output is claimed.
The final commit's Windows CI must independently build and execute everything.

## Remaining acceptance

Provider credential storage; durable native approval/idempotency ledger; atomic guarded Video/Motion
execution; live approved provider edit in the same state as manual edits; current Unified Workspace
integration without feature loss; Motion MP4 encoder; exact-commit installed GUI PASS and owner acceptance.
The installer is unsigned. Do not merge main or label the full product ready from frontend test PASS.

Next milestone: resolve any V02 Windows failure with its exact job logs, then integrate verified
current AI/UI checkpoints and native guarded execution, preserving both editing studios.
