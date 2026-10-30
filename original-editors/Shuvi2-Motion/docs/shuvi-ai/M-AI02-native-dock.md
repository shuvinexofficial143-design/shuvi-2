# M-AI02 — Original EffectCraft Native Shuvi AI Dock

This milestone continues M-AI01 on feature/shuvi2-original-motion-ai. Original engine, compositor, timeline, effect controls, shortcuts, panels, renderer, file paths and attribution are retained.

## Implementation
- New PanelKind::ShuviAi is part of EffectCraft's actual craft-ui/egui docking enum and ALL registry, not WebView or HTML.
- Default workspace retains original right-side Preview and Properties panels; a new *inactive* Shuvi AI tab is added to the right Properties group. All Panels also includes it. Users can activate, move, float and close it through the normal native docking UI.
- Ephemeral native ShuviAiState in EffectcraftApp (not in the .ecproj file). No API key, fake provider state, browser localStorage or persisted approval flag.
- Chat accepts a bounded local note and explicitly says provider NOT CONNECTED. It does not impersonate a model or report edit success.
- Live native project summary, active composition and selected layer inspection use the existing M-AI01 typed in-process NativeMotionProbe over the *same Session* used by manual editing.
- Editable native composition proposal form validates command schema and revision, produces PendingCommand only, and explicitly disables Approve & execute.
- Local Discard Preview does not claim cancellation of any in-flight native operation. Changed manual revision clears a stale proposed plan.
- Automation widget IDs for input, send, preview and discard; tests cover default dock tab presence, bounded chat, not-connected state, revision invalidation and honest stop wording.

## Evidence and limits
CI workflow motion-ai-native.yml tests the M-AI01 read-only native probe, M-AI02 panel states, dock tests and compiles a native x64 EffectCraft desktop executable from this branch with original attribution. CI success proves tests and compilation only, not a launched GUI, real provider response, owner approval, video/PNG export, or real native AI action. Do not claim those tests until completed.

## Next
M-AI03 native approved *typed* mutation adapter requires a shared manual/AI owner admission lock, SQLite durable task/action intent+receipts, atomic revision guard and independent readback. Must integrate with existing 2.0.3 AI Director rather than adding a conflicting ledger. Enable no AI editing without a trusted native owner approval.
