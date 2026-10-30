# Shuvi Video Studio — V01 native engine proof

Branch: feature/shuvi2-video-studio. Video Studio only.
FilmCraft source: vendor/filmcraft at c49efe070fab862df6c21d61a503605eb6f07105.

## Actual integration

The Tauri command video_engine_probe invokes a built filmcraft-cli child process. It calls the real headless engine to create a 16 x 16, 24 fps sequence, saves it to an isolated temporary .fcproj, reopens it, and reads sequence.inspect. Success requires a nonempty saved project and a parsed nonempty sequence object. Temporary data are deleted afterward.

The CLI operation is a fixed, allowlisted command sequence. No AI text, user-supplied shell commands, scripts, external editor windows, or untrusted bridges are involved. The executable path is an absolute trusted deployment configuration, not a model input.

## Local engine setup

Build FilmCraft from pinned source with Rust >= 1.95:

    git submodule update --init --recursive
    cargo build --locked --manifest-path vendor/filmcraft/Cargo.toml -p filmcraft-cli

Set SHUVI_FILMCRAFT_CLI_PATH to the absolute path of the resulting vendor/filmcraft/target/debug/filmcraft-cli.exe. Launch Tauri in the same environment. The typed client is src/studios/video/engine.ts, exposing probeVideoEngine(). This proof is backend-only.

Run non-engine native regressions:

    cargo test --manifest-path src-tauri/Cargo.toml

The real-engine test is intentionally ignored in routine cargo test and must NEVER be reported as passed unless explicitly run against a compiled CLI:

    cargo test --manifest-path src-tauri/Cargo.toml --lib video::tests::real_filmcraft_smoke -- --exact --ignored --nocapture

The PR Windows video job checks out both submodules, compiles pinned FilmCraft CLI, and invokes that real test.

## Limitations

V01 establishes a native engine command, persistence and readback verification. It is not yet media import, playable timeline, preview, export, AI editing, or a manual video UI. engine_status deliberately remains runtimeReady=false until broader integration. V02 owns reproducible Windows build fixes. No modifications to Shuvi 1 or Motion Studio.
