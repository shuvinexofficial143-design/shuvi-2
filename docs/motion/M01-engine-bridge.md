# Shuvi 2 Motion Studio — M01 Native Engine Boundary

## Scope
This milestone introduces a **real** strongly typed Rust adapter, not a browser canvas or a
mock compositor. The implementation uses the unchanged submodule at
`vendor/effectcraft`, pinned to `fa9cf47175834162806b6b03d83fb2f4bdaeeafa`.

- Isolated code: `crates/shuvi-motion-bridge/`.
- Upstream: `effectcraft_engine::Session::execute_checked("comp.new", …)`.
- Readback: inspect `Session::project` for the created native Comp and ItemId.
- Verify: comp id/name/dimensions/frame rate/duration and an increased project revision.
- Security: typed constrained spec, no arbitrary AI-command JSON, no exposed localhost socket,
  no independent EffectCraft window, no copied Adobe code.
- Separate Video Studio files/branches remain untouched.

## Reproduce on Windows (Rust 1.95 or newer)

```powershell
git submodule update --init --recursive
cargo test --manifest-path crates/shuvi-motion-bridge/Cargo.toml --all-targets
cargo run --manifest-path crates/shuvi-motion-bridge/Cargo.toml --bin motion-smoke
```

The smoke program must exit 0 and print a JSON object containing
`"ok":true`, `"command":"comp.new"` and
`"proof":"native-project-readback"`. A plan, missing submodule, fake command response,
or a failed compilation is NOT a passing test.

Dedicated GitHub Actions: `.github/workflows/motion-smoke.yml` on the motion branch
and pull requests; it performs recursive submodule checkout and runs tests plus the
headless smoke executable on `windows-latest`.

## Deliberately not claimed in M01
No Tauri IPC wiring, editable visual canvas, frame preview, layer timeline, animation
export, AI provider, installer, or completed Windows end-to-end editing. The new
adapter owns one Session and is intended to be connected to a private Tauri IPC
boundary only after the native CI test passes.

## M02
Reproduce the actual Windows build on an exact commit; fix toolchain, dependency or
submodule failures without touching Video Studio files or shared pins. Only then
proceed to save/reopen in M03 and real preview in M06.

## M02: Windows dependency compatibility repair

Exact M01 PR run `40848117403` failed while compiling `craft-pdf`, before any
Shuvi engine smoke test executed. The failure was `hayro-syntax 0.7.2`
from crates.io missing `DecodeLimits` and `Pdf::new_with_password_and_limits`.

Root cause: Cargo only honors `[patch.crates-io]` from the *active workspace
root*, not from nested dependency workspaces. The reviewed EffectCraft upstream
`Cargo.toml` already patches `hayro-syntax` and `hayro-jbig2` to commit
`92d392cff132eaf53e13afff77f38b5c11b73aa0` of
`storytold/craft-libs`. Shuvi's isolated Motion bridge has its own Cargo
workspace root, so the patches were not inherited and an incompatible public
crates.io version was selected.

Repair: redeclare the **exact same two upstream patch pins** in
`crates/shuvi-motion-bridge/Cargo.toml` without changing pinned EffectCraft
or Video Studio. A Windows CI preflight reads real `cargo metadata` and rejects
an unpatched `hayro-syntax` source before compiling. No PDF parser safety
limits were removed, and no alternative unverified PDF library was substituted.

A source patch is not proof of M02 success: require a successful run at the exact
post-repair SHA including patched-source check, complete `cargo test --all-targets`
and a zero-exit headless `motion-smoke` executable. Root shell/front-end green
checks are distinct from Engine M01/M02 evidence.
