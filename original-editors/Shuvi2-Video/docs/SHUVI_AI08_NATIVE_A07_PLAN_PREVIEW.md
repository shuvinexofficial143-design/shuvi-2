# Shuvi Video V-AI08 — Native multi-step A07 plan preview

Branch: `feature/shuvi2-original-video-ai`. Preserves original FilmCraft native editor and all previous source/licensing. No sibling branch touched.

## Real implementation
- Typed `NativeA07PlanPreview` derives from ONE native `filmcraft_engine::Session` readback with active sequence, document epoch, project SHA-256, revision and a bounded list of checked target Clip IDs, media item IDs, track IDs, clip kind and native cut tick.
- Accepts canonical untrusted planner shape `{"reason":"...","actions":[...]}` (strict keys), or standalone JSON array of actions; UI also wraps a single action in an array as a local shorthand. Enforces **1–12** actions exactly, rejects duplicate Clip IDs, unknown action types, extra `approved` booleans, missing/locked clips and invalid cut ticks.
- Every action uses the existing exact source FilmCraft timeline readback and no-op native A07 preflight. The entire set is checked against the same session snapshot, so it cannot silently switch project/sequence between actions.
- Exposes `a07_check_plan_preview_fresh` that rejects revision, document epoch, sequence and canonical native Project SHA mismatches when a human manually edits after preview.
- Actual egui Shuvi AI sidebar now has `Inspect plan (no edit)` with per-step native clip/track/tick evidence and project SHA. Refresh clears all stale previews, while Send/Approve/Stop buttons remain disabled.
- Native tests cover read-only 2-step plan, revision-stale rejection, duplicate and 13-step rejection, unknown action/extra keys rejection and no project/ledger mutation. UI test covers invalidation.

## NOT production-ready AI integration
A07's canonical `GuardedHost`, SQLite WAL, trusted owner prompt and WinCred adapter still belong to `feature/shuvi2-ai-director`; they are independently tested on Windows but NOT merged into this native FilmCraft UI. This read-only preview is **not the canonical approved plan hash**, not a ledger intent, not owner consent and not an executor. Project SHA alone is not a project/session UUID or authorization. No AI edit requests are executed.

## Pending verification
Latest commit Windows Actions run tests and compile the native GUI. Previous V-AI07 run may be pending; do not report success until this exact V-AI08 HEAD passes and native Windows artifacts are uploaded. Installer GUI, Save/Reopen and H264 remain unverified.
