# V18 — Native Timeline Time Ruler

Added an actual viewport-aligned timeline ruler at 1×–32× zoom: labeled time ticks, playhead indicator and real FilmCraft saved marker positions. All ruler geometry derives from `sequence.inspect` duration and the existing viewport, not synthetic edit state.
Clicking the ruler snaps a real playhead timestamp to the sequence FPS, clamps to the last playable frame (never EOF), updates the scrub slider and asks the existing serialized FilmCraft native preview coordinator to render the PNG. It does not fake image frames or write .fcproj bytes.
Pure node tests cover 2h timeline tick bounds, 12fps snap, 30fps zoomed offsets, EOF, invalid geometry, and offscreen marker/playhead visibility. Windows Playwright UI integration remains a separate strict gate.
Full Windows installer and CDP E2E are not yet confirmed at this commit.