# V16 — Real FilmCraft timeline zoom and horizontal pan

Native Video Studio now has a 1×/2×/4×/8×/16×/32× Timeline Zoom selector plus horizontal Pan control, important for inspecting long footage and precisely dragging short clips.
Visual viewport computes positions from saved FilmCraft sequence timestamps, clips outside the window are not rendered, and partially visible clips are clipped to viewport with dotted edges.
Zooming and panning never alter the original `.fcproj` or fake a timeline operation. Drag time is computed from the visible viewport duration but remains absolute project seconds, then snapped to the saved rational FPS.
On release, the same typed Rust FilmCraft move operation applies and the renderer reloads the real project and checks the clip start position and SHA. Old full-sequence behavior is unchanged at 1×.
Unit tests cover a 2-hour sequence, fractional track clipping, pan bounds, and zoomed drag mapping. The GUI with actual pointer interaction remains pending Windows E2E verification.