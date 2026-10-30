# V12 typed chat approval

The Shuvi Video chat now recognizes deterministic typed commands. This is **not an AI model**; no provider is connected.
Supported instructions: `split selected at 0.5`, `move selected to V2 at 2`, `trim selected out -3 frames`, `delete selected`, `place selected on V1 at 0`, `undo`, `redo`.
Parsing inspects only actual FilmCraft clip and imported media IDs; arbitrary shell commands, paths, unknown IDs and unsupported instructions are rejected.
A command becomes a visible approval card. Only a separate click on Approve executes a typed FilmCraft Rust IPC operation.
Before execution the active project SHA and selected root/path are rechecked and in-flight preview is drained. Rust independently verifies the project content and lock.
After execution the project is re-opened and SHA compared with the native command receipt. Mismatch is a failure, never a false PASS.
Motion Studio remains separate. Switching away from Video clears pending proposals. Full model-backed conversational editing is still pending.