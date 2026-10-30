# M09 — Advanced Native Mask Properties & Live Effect Parameter Inspector

Working branch: `feature/shuvi2-motion-studio` of
`shuvinexofficial143-design/shuvi-2`. No main merge or Video Studio
modification. Pinned native EffectCraft engine remains
`fa9cf47175834162806b6b03d83fb2f4bdaeeafa`.

## Real native editing changes

`crates/shuvi-motion-bridge/src/advanced.rs` adds native mask
`feather`, `expansion`, `opacity` changes using EffectCraft's
`prop.set` against the mask instance's **UID-resolved**
`masks/#index/{parameter}` path in the existing owner Session.
It inspects EffectCraft `build::mask` and re-reads the actual native
mask property group after every write. The mask feather is symmetric
2D `[px, px]`; values are finite and range-checked. Negative expansion
is allowed (shrink), mask opacity is 0–100%.

The effect inspector resolves **both the exact effect instance UID
and approved effect ID** before reading its native scalar property.
It reports the current native value and the allowed UI min/max
for Gaussian Blur (`blurriness`) and Brightness/Contrast
(`brightness`, `contrast`). The UI does not substitute old form
values for actual engine state.

Tauri's existing `motion_command` gains typed actions
`getMaskSettings`, `setMaskProperty` and
`inspectEffectParameter`. Unsupported property names, arbitrary
effect IDs, JS evaluation, plugin loads and untrusted file operations
are not exposed.

## Desktop controls

The same Shuvi Desktop Window's Motion tab reads effect parameter
values when the selected instance or parameter changes, and displays
Mask Feather / Expansion / Opacity with native state. All three mask
form values are range-checked **before** applying changes to reduce
partial-write risks; editing operations remain separate native
commands, not an atomic transaction. Edits refresh Layer/Effect/Mask
lists and native PNG frame render. No browser-generated fake frame.

## Windows proof & acceptance

```powershell
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path crates/shuvi-motion-bridge/Cargo.toml --all-targets
cargo run --manifest-path crates/shuvi-motion-bridge/Cargo.toml --bin motion-advanced-proof
```

The new `advanced_mask.rs` integration suite verifies:
- Native Feather and Expansion edit the actual mask tree.
- Rendered PNG pixels change between hard and softened masks.
- Native mask opacity edits pixels again.
- Full `.ecproj` save/reopen preserves effect UID/parameter, mask
  UID/properties, and exact rendered RGBA bytes.
- Native Effect Parameter Inspector sees updates, not defaults.
- Invalid values, wrong mask UID or unauthorized parameters leave
  the live project revision unchanged.

The `motion-advanced-proof` executable writes:
`m09_advanced.ecproj`, `m09_hard.png`, `m09_soft.png`,
`m09_translucent.png`, `m09_verified_export.png`,
and `m09_receipt.json`. These files are uploaded **only after
the Windows Motion smoke program passes**; output retains genuine
EffectCraft RGBA rendering and reopened session pixel equality.

**Do not mark M09 PASS based on the source commit.** Inspect both
exact branch HEAD Windows workflows and verify real test/pixel proof
before claiming success.

## Limitations and next milestone

- No true human-click Windows WebView E2E evidence or distributed
  signed Windows installer yet.
- Symmetric feather controls only; custom Bezier tangent editing,
  per-vertex feather, animated mask paths and Roto Brush remain future.
- No MP4/alpha codec export or AI chat editing authorization yet.
- Video Studio shares native Tauri glue on a distinct branch; merge
  conflicts must be manually reconciled before final unified app.
- The next milestone should prioritize native app lifecycle,
  interactive WebView click-to-edit smoke, guard UI render races,
  and then reviewed unified FilmCraft+EffectCraft host integration.
