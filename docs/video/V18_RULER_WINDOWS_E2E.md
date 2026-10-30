# V18.1 — Strict real Windows ruler and preview proof

Ruler time seeking has exact 24fps fractional-EOF clamping rather than rounding to an end-of-sequence frame. Unit tests cover both exact-frame and partial-frame durations.
Keyboard activation of the ruler uses the currently inspected playhead position instead of interpreting a keyboard-click x=0 as a mouse at timeline start.
Windows real WebView2 E2E now clicks the ruler midpoint, waits for the **native FilmCraft decoded frame at 0.5 seconds**, and asserts .fcproj bytes unchanged. It independently checks slider scrub at 0.75s to avoid a stale previous-frame false positive.
This is a strict UI integration test, not a mocked preview. Do not claim it succeeded until the exact-commit Windows workflow passes.