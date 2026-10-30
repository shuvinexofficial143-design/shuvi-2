# V14.1 — Native drag verification and Windows E2E

- Clip horizontal pointer release calls real typed FilmCraft `timeline.move`, never merely mutates HTML position.
- The UI now compares **actual saved clip start** to target within about half a frame after refreshing project+sequence; a valid SHA alone is not interpreted as successful drag.
- Pointer-capture synthetic clicks after a drag no longer select or redraw old detached DOM clips during a native edit.
- Drag quantization floors the final visible frame to avoid extending beyond fractional-frame sequence bounds.
- Strict Windows Playwright E2E uses native mouse pointer events, verifies .fcproj bytes change after move, and then Undo restores byte-exact previous file. The test is gated on real WebView2 CDP and therefore is NOT claimed PASS until that runner completes.
- Pure JS tests cover fractional-sequence boundary and normal dragging. Cross-track drag/continuous playback remain out of scope.