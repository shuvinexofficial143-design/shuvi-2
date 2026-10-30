# M-AI03 — Native typed motion owner adapter

## Changed source
The original EffectCraft egui/engine is retained; new shuvi_motion_owner.rs implements:
- Typed MotionCreateComposition, MotionAddText and MotionEditText mapping to the actual comp.new, layer.newText and layer.setText engine commands.
- Validated bounded parameters aligned to 2.0.3 AI Director guard schema, real active composition and text-layer preflight, project revision compare, native command schema check.
- Exact object ID extraction only as a locator, followed by independent lookup in actual EffectCraft Project, checking native comp dimensions and text layer content/position.
- Errors after attempting a native edit yield OutcomeUncertain; never blindly retry. Native receipts contain verified object JSON, before/after revisions and IDs.

Seven tests execute genuine EffectCraft native edits using a cfg(test)-only trusted permit, then verify real native Project state, stale revision rejection, invalid parameters, missing objects, and duplicate write protection.

## Critical integration boundary
NO production OwnerPermit constructor exists; this adapter cannot be called by M-AI02 chat/preview/approval or external model. It does not by itself implement a cross-task lock, durable SQLite ledger, real owner approval or provider connection. Real AI editing and Approve remain DISABLED.

The authoritative 2.0.3 SQLite WAL/FULL ledger, persisted action intent and SHA-256 receipts, trusted one-approval and Stop/Recovery are only on feature/shuvi2-ai-director. They must be reviewed and merged by integration 2.0.5 rather than duplicated. A single lock used by both original manual edits and the native guarded AI owner must encompass SQLite intent admission, this adapter's synchronous mutation, independent native readback and durable receipt commit. A trusted native consent must authorize the exact stored plan; no frontend-supplied approval booleans or forged IPC.

The CI build is pending until its workflow conclusion; a test pass does not imply live owner approved AI, real Windows GUI E2E or installer.
