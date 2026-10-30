# M03 — Native EffectCraft project persistence

This milestone implements a **real** `.ecproj` file save/reopen boundary for Shuvi 2
Motion Studio. It does not introduce an independent EffectCraft desktop window or
a simulated project state. The bridge owns `effectcraft_engine::Session` and invokes
the pinned upstream `file.saveAs` and `file.open` commands.

## Native flows

- `MotionBridge::save_project(trusted_workspace, basename)` — accepts one existing,
  caller-trusted workspace folder and one validated ASCII `.ecproj` basename, then
  executes `file.saveAs` through `Session::execute_checked`.
- After the native write, a **separate** EffectCraft Session executes `file.open`
  against the on-disk bytes. The entire `Project` struct is compared for equality
  (including item IDs, next ID, settings, layers and properties), not just a JSON
  status reply. This check also rejects projects that open only after automatic
  repair. The write service is upstream EffectCraft's `FsServices`, which calls
  its native `config::atomic_write`.
- `MotionBridge::open_project` loads into a fresh native Session. The owner's
  existing session is only replaced after the new file is fully opened and checked.
  Any unsaved changes block replacement.
- `ProjectReceipt` contains the absolute path, actual byte count, native comp
  snapshots and `verified_from_disk`. Reopening can advance the live session
  revision; **stable item IDs**, rather than volatile revision counters, identify
  compositions across launches.

## Filesystem safety

The desktop UI will eventually supply the trusted workspace folder. This method
**must not be called with an AI-generated arbitrary root**. Project basenames
must be 1–80 ASCII letters/digits/underscores/hyphens plus `.ecproj`.
Traversal, nested paths, wrong extensions, symlink targets, missing workspaces,
and attempts to overwrite unrelated existing files are rejected. Updating the
same project after prior open/save in the same session is permitted. The
readback parser limits on-disk projects to 64 MiB and rejects a corrupt file
without discarding an existing valid session.

This is a safe single-process boundary; not a multi-process locking system.
There is no automatic overwrite of external user files, and no unrestricted
AI read/write filesystem tool.

## Exact native proof

```powershell
git submodule update --init --recursive
cargo test --manifest-path crates/shuvi-motion-bridge/Cargo.toml --all-targets
cargo run --manifest-path crates/shuvi-motion-bridge/Cargo.toml --bin motion-smoke
cargo run --manifest-path crates/shuvi-motion-bridge/Cargo.toml --bin motion-persistence-smoke
```

The new smoke executable creates a real 1920×1080 / 30 FPS / 10-second
composition, writes a `.ecproj`, drops the writer session, constructs a new
EffectCraft session, reopens the physical file, and checks stable id, title,
dimensions, FPS, duration and no-dirty state. Tests also create two differently
sized and timed compositions, reopen them, create a third to prove ID allocator
continuity, then save and reopen the updated project.

**M03 is verified only when the exact branch HEAD Windows GitHub Actions run
passes the tests and the independent persistence smoke.** A successful source
commit alone is PENDING.

## Out of scope

No Tauri UI integration, Preview Canvas, Layers editor, Keyframes, alpha video
export, standalone installer or AI provider is claimed in M03. M04 adds genuine
text/shape layers and transform editing while preserving this native file
persistence.
