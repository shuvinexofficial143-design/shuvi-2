# V15 — FilmCraft native track lock/mute/visibility awareness

Video Studio now reads the saved FilmCraft `sequence.inspect` track flags (`locked`, `muted`, `enabled`, `solo`) rather than inferring them from a DOM prototype. Track titles indicate LOCKED, Muted, OFF and Solo, with visual locked pattern.

A locked native track blocks mouse drag and the corresponding typed Place, Move, Split, Trim and Delete preflight. A locked destination blocks moves from another unlocked source, and an invalid/missing native clip fails closed. Undo/Redo remain available as legitimate project history operations.

Both manual controls and approved model/local Chat commands pass the same pure preflight. **Important:** this UI validation is additive; the Rust FilmCraft locked-track and SHA checks remain the authoritative safety boundary.

The pure frontend test suite verifies track flag extraction, allowed actions, cross-family moving, missing clips, and locked source/destination rejection. No real locked-track GUI E2E pass is claimed until Windows CI verifies this commit.