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
