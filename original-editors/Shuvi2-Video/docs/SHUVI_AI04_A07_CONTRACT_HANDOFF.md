# Shuvi Video V-AI04 — A07 Contract Review + Native Clip-Specific Adapter

2026-10-30 | Branch: `feature/shuvi2-original-video-ai`

## Primary source and provenance
Canonical AI Director A07 remains at **branch `feature/shuvi2-ai-director`**, reviewed HEAD `64bf23e4cb9b4c95ca88b2f07ce9d57f7c2fa3e4`. Its original `src-tauri/src/ai_director/src/{guard,host,ipc,plan,transactional,windows_vault}.rs` and `src/ai-director/provider-gateway.mjs` are not copied into FilmCraft and not silently merged.

A07 implements `Action::VideoSplit {clip_id:u64,seconds:f64}` and maps proposal type `"video.split"` to its typed Rust enum. The primary host requires reserve -> one trusted native owner approval -> guarded execute -> durable SQLite receipt. The canonical OpenAI adapter uses fixed official HTTPS endpoint and Windows Credential Manager target `Shuvi2/OpenAI`, but no real FilmCraft adapter has registered those host functions yet.

## This Video-owned milestone (real code)
1. `crates/engine/src/shuvi_ai_owner.rs` now supports `SplitClipAt {clip_id,tick}`, in addition to the prior all-track split.
2. A strict `deny_unknown_fields` parser accepts **only** A07 `{"type":"video.split","clipId":<native-id>,"seconds":<finite>}`, rejects additional `approved`, unknown actions, IDs, and out-of-range seconds.
3. Native exact clip-ID preflight checks the existing active sequence clip and precise in/out; no invented IDs, selected-track fallbacks, mouse automation, external shell or arbitrary command dispatch.
4. Uses actual original FilmCraft `filmcraft_edit::razor_items` through `Session::edit_sequence` and validates one cut, one extra clip, unchanged unrelated tracks from independent `sequence.inspect` readback; real native Undo remains available.
5. Tests cover typed A07 schema, real clip-specific split/undo, untouched unrelated tracks, invalid clip rejection and fail-closed status.

## Unresolved / not authorized
- The Video branch does NOT include or register the A07 transactional ledger, provider gateway or Windows vault. No duplicated ledger was introduced.
- This owner-only private kernel remains non-provider-accessible and in-process. It does not claim task approval, shared manual/AI lock, crash-safe idempotency, actual project SHA-256 from persisted source bytes or native affected-object SHA.
- A real provider proposal from A07 is **untrusted** and cannot call this kernel until the canonical ledger is merged by reviewed Integration 2.0.5 owner, project identity and native consent enforced, and manual edits share the exact same owner lock. False positive capability flags remain false.
- Windows Release EXE is a compile artifact, not GUI/E2E evidence; screenshots and actual H264 export await V-AI05.
- Check CI results at the commit/run URL; committed code is not automatically PASS.

## Next V-AI05
After Windows CI is green, pursue reviewed A07 owner integration or cross-branch handoff to 2.0.5. Test real Windows owner click and native clip split, save/reopen, export with media, recover-from-uncertain and duplicate suppression. Do not install silently or fabricate video output.

## Verified A07 provider inventory preparation (additional V-AI04 increment)
`shuvi_ai_readonly::a07_video_inventory` now derives exactly `{"clipIds":[...],"mediaIds":[...]}` from real in-memory FilmCraft Project and active Timeline. IDs are sorted, unique, nonzero and <= JS safe integer, with <=128 per list. The result exposes no project file path or media URL and cannot execute anything. Tests check the stable read-only contract and inventory bounds.

This workflow now runs an independent native Rust test of **pinned canonical A07** source via a second read-only checkout at `64bf23e4cb9b4c95ca88b2f07ce9d57f7c2fa3e4`, in a separate Windows job. A separate successful provider/ledger crate test is not proof it is registered inside the real FilmCraft GUI.
