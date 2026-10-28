# Shuvi 2 architecture — draft M0

## Product contract
One native Windows application with one visible window: studio navigation at left, live editable workspace at center, AI chat at right. Same project state for AI commands and manual edit interactions. Status displayed only from verified runtime state.

## Why an isolated codebase
Shuvi 1 is a Windows computer-use agent designed around external apps. It currently has permission/recovery/UI focus blockers. Shuvi 2 must not import these problematic external-app adapters by default.

## Main components
- Tauri2 desktop shell (WebView2, typed IPC, local credential storage to be ported).
- Direct command SDK for video and motion engines, **not yet implemented**.
- Upstream FilmCraft and EffectCraft sources pinned as submodules.
- AI provider adapter (to be selectively ported), task authorization, audit, task ledger.
- Render/preview worker: headless first, optionally native embedded drawing only after technical verification.

## Integration constraint
FilmCraft and EffectCraft use Rust and native egui interfaces. Existing egui windows cannot simply be nested as HTML elements in Tauri. Our first milestone is a Tauri shell with a real backend SRT serializer. Next prove headless engine commands and preview frames over IPC; then implement a manual timeline UI driven by the same model, or evaluate whether a unified native renderer is viable. No visible separate studio windows in the product experience.

Submodules are source references, not vendored app binaries or a working integration. Download via git submodule update --init --recursive. Do not run their desktop binaries as the final UX.

## Verification gates
M0: root shell, source-pinned submodules, internal Rust function, copied Shuvi budget module and provenance.
M1: Windows build and UI test, no outside editor windows.
M2: FilmCraft media import -> cut -> preview frame -> MP4 export.
M3: EffectCraft text motion -> preview -> export/overlay.
M4: AI command planning, owner task-scope approval, audit receipts, verified edits, retry policy.
M5: manual timeline edits and AI edits in a shared undoable state; process/memory budgets; signed installer.

M0 is not proof of M1-M5. Cues serialized in a Rust test are not evidence that a video was edited.

## Security
Allowlist typed engine commands; no arbitrary model-supplied shell command. Strict path scope for input/output media and confirmations for destructive actions. Do not put API tokens in app logs, Git commits or command arguments. No silent retry on uncertain editing outcomes.
