# V02 — Reproducible Windows video engine and experimental Shuvi package

The V01 FilmCraft source pin is unchanged:
- `vendor/filmcraft` = `c49efe070fab862df6c21d61a503605eb6f07105`
- FilmCraft workspace version = `0.13.0`, Rust toolchain `1.95.0`
- Windows target: `x86_64-pc-windows-msvc` only.

## Real native build and staging

Run in Windows PowerShell 7 from the repository root after installing Rust 1.95.0 and the Windows MSVC toolchain:

    git submodule update --init --recursive
    pwsh -File scripts/video/build-engine.ps1

The script checks the **actual pinned Git submodule** against the manifest and an exact Git SHA, compiles using Cargo.lock (`--locked`), copies the executable to:

    src-tauri/binaries/filmcraft-cli-x86_64-pc-windows-msvc.exe

It verifies matching SHA-256 of the compiled/staged files and `filmcraft-cli --version`. A build manifest (SHA-256, Rust target, source commit, lockfile SHA-256, binary size) is generated beside it and neither file is committed.

## One-window bundled distribution

The experimental Tauri variant is `src-tauri/tauri.video.conf.json`. It layers on the shared Tauri configuration, sets NSIS bundling, and packages the engine as a Tauri v2 **external binary**. Shuvi itself owns the only visible app window. The headless CLI is an internal child process.

    npm install --no-audit --no-fund
    npm run tauri -- build --config src-tauri/tauri.video.conf.json

On Windows Tauri strips the target triple when installing the sidecar beside Shuvi's executable (`filmcraft-cli.exe`). The V01 Tauri command now resolves that sibling executable automatically, falling back to the explicitly configured absolute `SHUVI_FILMCRAFT_CLI_PATH` for development/CI; it never searches PATH.

The shared `src-tauri/tauri.conf.json` retains `bundle.active=false`; the experimental config is opt-in, so the Motion Studio branch, root app, and usual native tests are unaffected.

## CI evidence gates

The PR workflow must: checkout pinned submodules; compile Windows FilmCraft with Cargo.lock; SHA-verify the staged CLI; execute the **real** V01 sequence save/reload smoke against that staged copy; build an NSIS package with the opt-in config; check a nonempty installer and upload it as a workflow artifact. This file describes intended gates, NOT a claim of passing CI. Check the exact commit's run and its job steps.

A CI-produced unsigned Windows installer is an internal experiment, **not** a verified production release or code-signed distribution. Actual installation, runtime sidecar discovery and laptop memory measurements still need a Windows desktop E2E verification. The default application still does not have a real timeline/editor and the `runtimeReady` flag remains false.

Source and binary redistributions must preserve FilmCraft's dual MIT/Apache-2.0 license and NOTICE / attribution obligations, including a separate dependency review before public distribution.
