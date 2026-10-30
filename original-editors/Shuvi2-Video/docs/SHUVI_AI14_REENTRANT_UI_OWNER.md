# Shuvi2 Video V-AI14 — original FilmCraft UI/Logic pass admission

## Real changes
- The original production FilmcraftApp menu lane is now a thread-aware, same-thread reentrant owner with bounded nesting depth and sticky poison flag instead of a non-reentrant atomic bool.
- FilmcraftApp::logic_inner holds one owner throughout the actual hidden-logic pass including control drain, background autosave, native job updates and original event handling.
- FilmcraftApp::ui_inner holds one owner through the actual graphical editing pass: draw, keyboard, drag-and-drop and timeline panels. Nested menu and Session::execute operations on the SAME thread are admitted instead of rejected; other threads cannot claim simultaneously.
- menus::invoke acquires an owner at entry, including direct native menu actions, not just the Session::execute fallback. Remote engine and synthetic-input entry retain their cross-thread Busy/Poisoned fail-closed check.
- Real production FilmcraftApp tests validate same-thread reentrant command edits, a second thread blocking menu/native control/logic, sticky panic poison and original engine command registry under nested UI ownership.

## Limits and protection
This is a real source-level UI event-pass owner, not an A07 SQLite-integrated owner. The full native FilmcraftApp still has public direct Session references, some hooks enter outside ui_inner/logic_inner, and work on background workers can have their own side effects. A07 NativeVideoAdmission exists separately in a bridge crate and has NOT yet been connected to the production graphical app; trusted Windows approval, native credential vault connection, verified persistence and exact transaction binding are still missing. Therefore native AI editing remains disabled, including Send/Approve/Stop buttons.

Tests must be run on the exact commit's GitHub Actions Windows CI before claiming build success; earlier V-AI13 CI may still be pending.

## Catch-unwind continuation hardening
The original native FilmcraftApp::ui_inner deliberately catches panics inside panel drawing and graphics notice rendering. A catch does not unwind the outer UI owner lease, so it formerly left the admission lane erroneously healthy. This change explicitly calls ManualCommandAdmission::poison() in both caught-panic branches. The gate then blocks all covered new edits even after the current UI pass returns, until explicit trusted recovery / application restart. New regression simulates this exact caught-while-owner-active case and verifies no native newSequence can run after poison.
