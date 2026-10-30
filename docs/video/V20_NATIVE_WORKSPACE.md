# V20 — Native FilmCraft Workspace Shell and Searchable Media Bin

Video Studio now foregrounds a functional three-pane workspace: real FilmCraft Media Bin, Program Monitor with native PNG output, and Controls/Inspector. The existing editable FilmCraft timeline, marker navigator, approval card and native action buttons remain in the timeline.

The left Media Bin is generated strictly from saved `inspect project` media items, is bounded to 120 visible items and supports case-insensitive name/type/id search. Clicking an item selects it in the real FilmCraft Place Media target selector; it never writes the .fcproj or makes fake thumbnails. All external file names are placed via `textContent`, not innerHTML.

Video mode changes shell phase/status and hides M0 diagnostic demo controls. Switching to Motion restores its foundation status and placeholder shell, without modifying Motion Studio files or engine behavior. The real FilmCraft runtime is still verified only by the explicit Verify Engine action.

Windows WebView2 E2E additionally imports an actual H264 MP4, checks real Media Bin count, searches, selects the real media ID, ensures .fcproj bytes unchanged, then continues the existing strict Sequence→Place→Undo/Redo→Chat→Drag→Preview→Export path.

Do not claim latest V20 full Windows E2E passed until its exact-commit Actions run succeeds. Windows production installer is unsigned and separate from the CI-only CDP instrumented executable.