# M-AI01 — Shuvi 2 Motion Native Foundation

Source: original EffectCraft v0.18.0 (upstream commit c3600f9b59b109da97871a43a6898683a0163cb1).
Baseline: 2ba1e4e72b0a046278c18fac5c49a68b16950ccc.
Owned branch: feature/shuvi2-original-motion-ai.

This checkpoint preserves the actual original egui/editor UI, native timeline, comp/render engine, crate tree and license notices. It adds a typed in-process native read-only adapter to the original UI crate, using the **same** effectcraft_engine::Session and Session::execute_checked. Readback supports project.summary, editor.state, comp.info, layer.tree, app.capabilities and command.describe. Strict expected revision checking rejects stale manual edits. Read-only queries verify no change to project Arc, undo history or command journal. Composition creation preview validates bounds and real native command schema. It cannot execute any AI edit or grant owner approval.

The source's optional --control TCP endpoint is unauthenticated: NEVER use it as persistent Shuvi AI transport. There is no provider connection, credential store, user AI sidebar, durable SQLite ledger, real edit completion, GUI screenshot or Windows E2E verification in M-AI01. Do not report those as completed.

Native Rust test suite exercises same-session manual edit readback, stale revisions, non-mutating queries, registry introspection, strict plan validation and the absence of an edit executor.

CI: .github/workflows/motion-ai-native.yml runs Windows tests, builds original real native editor executable from OUR committed source and packages original license and attribution files. Check CI conclusion and artifact before claiming build pass. A build pass is NOT a GUI E2E pass.

Next: M-AI02 native egui AI dock and live inspector, fail-closed provider state. Later M-AI03 implements authorized typed edits with a durable ledger, shared lock, idempotency and verified receipts. M-AI04 adds real provider/vault and one scoped owner approval.
