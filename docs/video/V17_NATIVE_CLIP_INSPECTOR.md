# V17 — Real FilmCraft Clip Inspector and Marker Navigation

All clip and marker values come directly from native FilmCraft sequence.inspect JSON, not demo arrays.
Selected clip details include track, item ID, start/duration/end, source-in/out, speed, reverse, gain, effects count and native lock state.
Marker navigation uses actual numeric marker IDs and exact FilmCraft time ticks.
Reveal Clip changes viewport pan only; seek marker requests real native PNG and does not edit project bytes.
Tests validate real JSON shape, tick conversion, duplicate markers and time-centered reveal.
The full Windows UI E2E gate remains separate and is not yet verified.