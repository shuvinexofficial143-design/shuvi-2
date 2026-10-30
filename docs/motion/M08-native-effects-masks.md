# M08 — Native EffectCraft Effects and Editable Polygon Masks

Branch: `feature/shuvi2-motion-studio`. This milestone extends the M07
single-window **real EffectCraft Session**. It does not launch a separate
EffectCraft app, replace the native compositor with fake rendering, or
change the FilmCraft/EffectCraft submodule pins.

## Real engine integration

The new `crates/shuvi-motion-bridge/src/effects_masks.rs` invokes
`effect.apply`, `prop.set`, `effect.toggle`, `effect.remove`,
`mask.new`, `mask.setVertex` and `mask.remove` with
`Session::execute_checked`. After mutations it reads the actual Project
`effects` and `masks` property trees for unique UIDs and parameter/path
values. Only the **pinned, built-in** Gaussian Blur (`ec.blur.gaussian`)
and Brightness & Contrast (`ec.color.brightnesscontrast`) are exposed
in this first owner-facing UI; external effects, arbitrary command IDs,
plugins, scripts and engine-JSON passthrough remain unavailable.

Typed Tauri IPC actions through the existing single-owner worker:
`addEffect`, `listEffects`, `setEffectParameter`,
`toggleEffect`, `removeEffect`, `addPolygonMask`,
`listMasks`, `setMaskVertex`, `removeMask`.
The native Motion tab adds corresponding controls and layer-scoped
effect/mask listings. All actions alter the one project shared by
manual editing, preview render and save/open.

The polygon mask accepts 3–64 bounded finite layer-space vertices,
rejects zero-area shapes, and creates a closed Add path. Vertex editing
preserves the mask UID. Numeric effect changes are allowlisted and
bounded, with readback checking. The existing project persistence
verifies a whole native Project read-after-write, preventing simple JSON
success-echo from counting as an edited document.

## CI proof obligations

```powershell
git submodule update --init --recursive
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path crates/shuvi-motion-bridge/Cargo.toml --all-targets
cargo run --manifest-path crates/shuvi-motion-bridge/Cargo.toml --bin motion-effects-proof
```

M08 unit/integration tests must prove:
1. Brightness Effect visibly changes native rendered pixels.
2. Effect UID/parameter persist after disk save + fresh EffectCraft reopen.
3. Native enable/disable changes output; remove deletes the effect.
4. Gaussian Blur can be applied with its supported blurriness parameter.
5. Closed editable polygon mask changes native alpha/compositing, survives
   save/reopen with identical pixels, supports vertex change/remove.
6. Invalid effect kinds, unsafe values and invalid polygon vertices
   are rejected without changing the native revision.
7. Tauri worker accepts **only typed camelCase actions** and preserves
   one project Session; frontend UI tests require real IPC bindings.

Windows Actions run `motion-effects-proof` and upload its output to
`shuvi-motion-proof`: a native `.ecproj`, original/effected/masked
PNG frames and an `m08_receipt.json`. A proof run is marked PASS only
after verifying output and the exact branch SHA.

## Known limitations

- Effects UI currently exposes two common native effects, not the
  complete built-in catalog or advanced masks/roto tools.
- One simple closed polygon mask editor exists, not full mask feather,
  bezier handle graph, animated masks or 3D layering.
- Neither a real Windows WebView user-click/screenshot E2E test nor a
  packaged installer is claimed by the Rust and static frontend CI.
- AI chat remains a draft UI: no external AI provider or permission
  escalation from chat into editing.
- Video Studio branch changes shared Tauri glue separately; coordinate
  a reviewed integration merge, never overwrite Video registrations.

A source commit alone is **PENDING** until Windows GitHub Actions fully
passes on the exact SHA. Never report a simulated render as native proof.
