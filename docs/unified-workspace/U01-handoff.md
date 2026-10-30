# SHUVI 2.0.4 U01 — Native-backed Unified Workspace

## Ownership and baseline
Repository: shuvinexofficial143-design/shuvi-2. Branch: feature/shuvi2-unified-workspace, created from verified main de53c060111909351ba73744a5e652a7cdc21276.
All additions are in src/unified-workspace/**, src/desktop-ui/**, tests/unified-ui-*.test.mjs, docs/unified-workspace/**.
Never merge or change main, src/main.ts, index.html, src-tauri/**, package.json, either existing studio branch or pinned submodules in this chat.

## What is real
- src/unified-workspace/native.ts invokes the actual Video and Motion Tauri command names. No command is emulated in production.
- src/unified-workspace/core.mjs manages the single editing state used by both manual UI and future AI Director proposals.
- Native Video readback -> exact SHA-256 -> Video timeline edit -> disk re-inspection -> same SHA-256 must match the edit receipt.
- Native Motion composition / text / layer readback / PNG rendering / native project saving / opening / transparent PNG exporting.
- Native frame previews only render received FilmCraft PNG bytes or EffectCraft PNG base64. UI never creates fake video pixels.
- Chat panel stays visible while switching studios, but is draft-only (no provider). AI task actions require explicit one-time owner approval, bound to project SHA and typed video action.
- Stop does not falsely claim to preempt a native operation. It quarantines uncertain state until refreshed.
- Unit/contract tests mock IPC only inside tests, never in production modules.

## Integration handoff to Chat 2.0.5
Current main does NOT register the Video and Motion commands. This branch deliberately does not edit shared files, so the module must be mounted by the reviewed integration branch after both PRs are reconciled.
Integration entrypoint example:

```ts
import { mountUnifiedWorkspace } from './desktop-ui/workspace';
const root = document.getElementById('unified-root');
if (!root) throw Error('Missing unified root');
mountUnifiedWorkspace(root);
```

Create one #unified-root element in the existing Tauri window. Review and replace the old Video and Motion DOM bootstraps; DO NOT mount competing studio bootstraps simultaneously.
Native Video commands required: video_project_snapshot, video_timeline_apply, video_import_media, video_preview_frame, video_export_mp4, video_history_restore.
Native Motion command required: motion_command. No arbitrary shell command routing.
Shared host integration (owned by 2.0.5): src-tauri/src/lib.rs, src-tauri/Cargo.toml, index.html, src/main.ts and any conflicting Vite/CSS bootstraps.

## Known limitations (explicit)
- The UI module is not yet mounted in a combined Windows binary; source and unit tests do not prove real WebView2 user interactions.
- Motion IPC supports native project revision readback but no atomic expectedRevision compare-and-swap; AI Motion writes MUST stay disabled until the integration owner implements a server-side guard.
- Stop cannot interrupt a running EffectCraft worker or FilmCraft CLI. Native completion may have occurred; refresh is mandatory.
- Video createSequence assumes an opened valid project; initial .fcproj creation from an empty path remains the owning Video Studio's UX responsibility.
- Video imported media ID is currently a manual entry (must match a real FilmCraft item); choosing media visually and cross-studio property inspector are future UI improvements.
- Chat thread persists through studio switching within this app window only; no durable cross-restart history or configured AI provider.
- Real Windows bundled installer, exact merged SHA E2E, and production readiness are NOT proven in U01.

## Quality gates
npm test
npm run build
Final integrated Windows WebView2 click -> native IPC -> real preview -> timeline/layer readback -> disk save/reopen -> export, plus actual CI on the SAME final integration SHA.

## NEXT U02
Add native media picker/selection (without editing shared files), motion properties/keyframe inspector, robust per-studio revision recovery and updated DOM interaction tests; hand off a reviewed integration checklist to 2.0.5.
