# V11.1 — Interrupted Undo/Redo Recovery + Keyboard Navigation

The Video Studio stores project content snapshots under a SHA-256 journal. If Shuvi crashes **after restoring the .fcproj bytes but before appending its history journal event**, the file SHA can match the immediately previous/next verified history state while the journal still refers to another state.

- \`video_history_status\` now reports \`recoverableDirection\` **only** when the current project digest exactly matches an adjacent history snapshot and that source snapshot matches its SHA-256; external arbitrary modifications remain diverged.
- A user-initiated **Recover Interrupted History** control calls \`video_history_reconcile\`, which verifies user-selected project scope, SHA and expected direction, checks the current project using the **real pinned FilmCraft CLI**, rechecks file digest and appends the missing journal transition. It **does not replace current project bytes**. No automatic destructive repair happens.
- The ignored-by-default real FilmCraft Windows integration test imports MP4, edits, Undoes/Redoes, simulates the interrupted Undo journal window with independently saved .fcproj bytes, and verifies that reconciliation makes Redo available after reopening the project.
- Keyboard controls in Video Studio only: Ctrl+Z Undo, Ctrl+Y or Ctrl+Shift+Z Redo, left/right arrows single-frame navigation. Text inputs, editable elements and IME are not intercepted. Controls are disabled in Motion Studio; native project SHA must match.
- Tests cover adjacent-state classification and pure keyboard command safety.

**Limitations:** Recovery does not repair partially written/corrupt journal JSON, damaged project bytes, or arbitrary external edits. The current journal still has a 4,000-entry cap and snapshots need an explicit retention/cleanup policy. Continuous realtime 30fps playback is not claimed. Do not mark full Windows E2E PASS until the exact HEAD workflow completes, including the WebView2 UI path.
