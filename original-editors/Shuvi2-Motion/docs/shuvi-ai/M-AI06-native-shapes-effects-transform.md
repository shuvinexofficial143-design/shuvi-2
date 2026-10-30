# Shuvi 2.0.2 — M-AI06 Real Native Shapes, Effects and Transforms

Repository: shuvinexofficial143-design/shuvi-2
Branch: feature/shuvi2-original-motion-ai
Base native engine: Original EffectCraft v0.18.0
AI Director source: feature/shuvi2-ai-director at pinned SHA 64bf23e4cb9b4c95ca88b2f07ce9d57f7c2fa3e4

## Implemented in the isolated integration harness

The real 2.0.3 GuardedHost and SQLite WAL/FULL TransactionalLedger now authorize typed Motion actions against the actual EffectCraft Session; the engine is not mocked. Native object SHA-256 receipts derive from independently inspected EffectCraft Project properties and geometry.

1. MotionAddShape -> native layer.newShape: supported rect, ellipse and rounded only. Independently checks new shape layer ID, source, name, position, native shape path, original width and height, roundness and fill colour. Polygon and star are rejected before native admission until their geometry can be independently verified.
2. MotionSetTransform -> native prop.set: position/scale vector and rotation/opacity scalar from original native layer props. Only directly verifiable, static native properties are supported; unknown types or unchanged values fail closed before SQLite step intent.
3. MotionAddEffect -> native effect.apply: fixed whitelisted 2.0.3 gaussianBlur maps to original ec.blur.gaussian, brightnessContrast maps to ec.color.brightnesscontrast. Native readback compares the returned UID with actual original Effects group and registry match ID; existing duplicate effect type is rejected.
4. Real native model inventory now enumerates composition and layer IDs plus real effect and mask group UIDs; no invented IDs, network paths, credentials or file data.

M-AI06 regression cases include SQLite-authorized genuine native shape creation with colour/geometry SHA proof; two sequential SQLite-confirmed transforms and EffectCraft Gaussian Blur; unknown effects, unchanged transforms and deliberately unsupported polygon action fail closed. M-AI05 tests still cover single-owner reentrancy, real project save/reopen, one-shot consent and Stop between verified steps.

## Real CI failure found and corrected

Run 41035448211 on earlier commit 760ea84437e8e191fd866c51264267585624760f failed while compiling pinned craft-pdf, BEFORE compiling the isolated Motion bridge. The separate Cargo workspace did not inherit the original EffectCraft crates.io patch pins, so public hayro-syntax 0.7.2 was selected; the pinned craft-pdf requires DecodeLimits and Pdf::new_with_password_and_limits from the patched source.

Fix commit bef0feb9f3e262e83c7b59d33ce87055ce0494fc copies the EXACT original EffectCraft patch entries to the isolated integration manifest, with no edits to upstream source or versions. Current HEAD CI still needs to pass; old failure must not be mislabeled as a Motion bridge test failure.

## Explicit restrictions

This implementation is in the isolated integration test harness, NOT registered in the shipping egui/Tauri app. The test-only owner consent is not a real human approval. The RefCell-based single-threaded owner gate is not a shared cross-process desktop lock. Production owner consent, protected OS-private SQLite storage, Windows credential provider, shared manual/AI UI transaction lock, project save/reopen GUI verification, render output verification and installer E2E remain pending. Original egui AI Edit/Approve controls remain disabled. No actual provider-originated edit was performed.
