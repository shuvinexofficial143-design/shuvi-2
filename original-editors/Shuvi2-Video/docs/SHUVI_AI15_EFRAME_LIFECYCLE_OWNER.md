# Shuvi2 FilmCraft V-AI15 — Eframe Outer Lifecycle Native Session Admission

2026-10-30 / branch feature/shuvi2-original-video-ai.

## Actual original editor integration
- `FilmcraftApp::raw_input_hook` now uses one acquired same-thread reentrant native owner for its entire original hardware/synthetic raw input rewrite. A prior `blocked_reason()` check (which did not claim) had a TOCTOU gap between looking at the flag and taking events into the next native pass. On Busy/Poisoned, it still drops hardware/queued synthetic events and rejects pending input callbacks.
- `eframe::App::logic` now holds one native owner through both `logic_inner` and `finish_ime_reset_logic`. Those latter original IME operations can inspect session context; they were previously outside the pass-level owner.
- `eframe::App::ui` now holds one owner through IME begin, native UI edit pass and IME end. Existing `ui_inner` reenters, preserving same-thread nested FilmCraft commands and original draw/input behavior.
- `eframe::App::on_exit` now attempts admission BEFORE touching `Session::shutdown()`, which can update/close native persistence. Busy/Poisoned owners withhold that shutdown and leave the native recovery journal untouched; client receives no false Save success claim. Original screenshot and IME-viewports cleanup are still performed.
- Tests using the real FilmcraftApp and a competing native owner thread assert Busy prevents exit shutdown; Poisoned prevents exit shutdown. Existing UI raw-input and native command regression suites remain in the native GUI Windows CI.

## Verified earlier checks
Most recent full confirmed SUCCESS at task start was V-AI11 initial `41052649885`. Prior V-AI12/13/14 newest Windows runs had not completed at initial check. Never claim fresh compile or Windows EXE success for V-AI15 until exact commit CI has concluded.

## Still NOT production AI enabled
Original FilmcraftApp still owns a directly accessible `Session`. The eframe UI lifecycle admission is NOT identical to the separately tested canonical A07 SQLite `NativeVideoAdmission` Mutex. Native floating-window and asynchronous host callbacks still need inventory. No real owner consent dialog is installed in production, no Windows Vault/provider credential injection into this GUI, no full native all-path owner authorization. `ai_mutations_enabled` remains FALSE and buttons remain disabled. No live Windows graphical launch or MP4 export verified. On an unsafe exit, persistence shutdown intentionally fails closed; this is not a guarantee that the application itself will defer process termination.

## Floating window owner admission
Original DockArea::native_input_hook is separate from FilmcraftApp::raw_input_hook. It now clones the SAME production manual admission owner and calls raw_input::rewrite_native_window_input_admitted before queuing native floating OS window input. Busy/Poisoned rejects all keyboard and pointer events; test verifies no replay and same-thread nested pass retains normal input. This guards floating OS window input, not every possible direct floating panel draw/batch side effect or the unrelated canonical A07 bridge instance.
