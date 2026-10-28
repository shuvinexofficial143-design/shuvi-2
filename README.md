# Shuvi 2 — AI Creative Desktop Studio

A new, independent Windows creative workstation: one Shuvi window, a dockable editor, and an AI chat panel. The editor is intended to work with in-process/headless editing engines, **not** by launching visible Adobe applications or relying on screen clicks.

## Current state

**M0: Initial source integration and desktop shell, not a functioning video editor yet.** This is a new project; the earlier Shuvi repository is not modified.

## Source components (pinned, not downloaded into this GitHub page until submodules are checked out)

- FilmCraft video editor source: `vendor/filmcraft` from `storytold/filmcraft`.
- EffectCraft motion-graphics source: `vendor/effectcraft` from `storytold/effectcraft`.
- Selected reusable modules from Shuvi 1 are copied individually, with provenance in `docs/SOURCES.md`.

When source submodules are present:

```bash
git clone --recurse-submodules https://github.com/shuvinexofficial143-design/shuvi-2.git
# or for an existing clone:
git submodule update --init --recursive
```

The product shell uses Tauri 2 / Rust and TypeScript/Vite. It starts as an honest nonfunctional integration surface until the editing engines compile and the embedded UI bridge is verified. **No fake editing success indicators.**

## Product rules

1. One visible app window; separate hidden helpers may be used if needed.
2. Manual timeline changes and agent changes share the same project state, with undo and verification.
3. A single task-scoped approval for bounded edits; ask again for outside-scope, destructive, or sensitive operations.
4. Never retry an unknown edit outcome blindly.
5. First prove import → cut → preview → export before expanding to more studios.
6. Do not assume a submodule is an app: the Rust sources must be built and integrated.

See `docs/ARCHITECTURE.md` and `docs/SOURCES.md` for verified boundaries.

## Build

After installing Node.js, Rust, Windows WebView2 prerequisites and fetching the submodules:

```bash
npm install
npm run tauri dev
```

The desktop shell can run before the editor engine is integrated; it will clearly show the engines as unavailable.

## License

Third-party code remains under its original licenses (see source repositories). Shuvi 1 files reused in this repository are independently attributed and reviewed. Logos, names, third-party trademarks, and dependencies are not automatically relicensed.
