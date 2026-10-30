# V11 Manual Studio Undo/Redo UI

- Cross-session Undo/Redo now appear on the native Video Timeline, rather than relying on FilmCraft in-process edit history.
- The UI reads the actual persistent history status for the currently selected, canonically validated \`.fcproj\` and enables actions only if a verified snapshot is available.
- Every Undo/Redo requires the exact refreshed project SHA-256. The Rust backend restores a real snapshot, reopens it with pinned FilmCraft and appends the durable journal event.
- On success, UI discards previously rendered PNG and stale clip selection, reloads actual project/sequence and displays the backup filename and SHA.
- The buttons are disabled for diverged external project edits. The user must refresh and perform a new edit to establish a new history branch. Import-only operations are not covered by this timeline history.
- This UI uses native Tauri IPC and real project bytes; not a mocked array of clips. It needs its own GitHub E2E and Windows user-session tests before being called fully verified.
