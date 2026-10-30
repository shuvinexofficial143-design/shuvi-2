//! FilmCraft's typed, native, in-process owner-only edit kernel.
//!
//! SECURITY BOUNDARY: This module is PRIVATE to filmcraft-engine. Nothing here
//! is an AI/model/renderer invocation endpoint or an owner approval mechanism.
//! It may only become callable by a reviewed A07 native owner adapter after the
//! shared manual+AI lock, persisted task/plan binding, consent and durable
//! idempotent receipt are fully integrated. Until then AI editing stays OFF.
//!
//! A Rust &mut Session gives exclusive *local* access for the duration of this
//! synchronous operation. It does NOT prove a cross-component/process owner
//! lock or provide persisted authorization.
use std::sync::Arc;

use serde::Deserialize;
use serde_json::{Value, json};
use crate::project::ClipId;
use crate::time::{Tick, TICKS_PER_SECOND};

use crate::{EngineError, Result, Session, project::{ItemId, Project}, shuvi_ai_readonly};

/// Deliberately closed action vocabulary. Never pass a model-supplied free-form
/// command name, raw script, arbitrary path or unbounded JSON params to execute.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum TypedVideoEdit {
    SplitAllTracksAt { tick: i64 },
    /// A07's video.split is clip-specific, NOT an all-track razor.
    SplitClipAt { clip_id: u64, tick: i64 },
}

/// A volatile in-memory fence; it is NOT a durable project hash/consent token.
/// The A07 integration must add project identity, persistent task UUID, plan
/// hash, action UUID, exclusive admission lock and commit receipt separately.
pub(crate) struct SessionFence {
    revision: u64,
    document_epoch: u64,
    active_sequence: ItemId,
    path: Option<String>,
    project_pointer: Arc<Project>,
}

impl SessionFence {
    pub(crate) fn capture(session: &Session) -> Result<Self> {
        let active_sequence = session.state.active_sequence.ok_or(EngineError::NoSequence)?;
        if session.project.sequence(active_sequence).is_none() {
            return Err(EngineError::NoSequence);
        }
        Ok(Self {
            revision: session.revision,
            document_epoch: session.document_epoch,
            active_sequence,
            path: session.path.clone(),
            project_pointer: Arc::clone(&session.project),
        })
    }

    fn verify(&self, session: &Session) -> Result<()> {
        if self.revision != session.revision
            || self.document_epoch != session.document_epoch
            || Some(self.active_sequence) != session.state.active_sequence
            || self.path != session.path
            || !Arc::ptr_eq(&self.project_pointer, &session.project)
        {
            return Err(EngineError::Other(
                "STALE_NATIVE_VIDEO_PROJECT: revision, document or original Session differs; require fresh owner review".into(),
            ));
        }
        Ok(())
    }
}

#[derive(Debug)]
pub(crate) struct NativeEditReadback {
    pub(crate) before_revision: u64,
    pub(crate) after_revision: u64,
    pub(crate) sequence_id: u64,
    pub(crate) cuts: u64,
    pub(crate) before_clips: usize,
    pub(crate) after_clips: usize,
    /// Exact independently inspected right-half clip ID, if one named clip was split.
    pub(crate) created_clip_id: Option<u64>,
}

fn timeline_clip_count(sequence: &Value) -> Result<usize> {
    let mut count = 0usize;
    for kind in ["video", "audio"] {
        let tracks = sequence[kind].as_array().ok_or_else(|| {
            EngineError::Other(format!("native timeline readback missing {kind} track array"))
        })?;
        for track in tracks {
            let items = track["items"].as_array().ok_or_else(|| {
                EngineError::Other(format!("native timeline readback missing {kind} clip list"))
            })?;
            count += items.len();
        }
    }
    Ok(count)
}


/// A07 model proposal's exact video.split shape (not a consent or execution
/// request). The canonical A07 Rust enum and SQLite ledger remain on the
/// AI Director branch: this video-owned *adapter* does not copy either.
/// This parser is PRIVATE and never grants model-originated execution.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase", deny_unknown_fields)]
enum A07VideoProposal {
    #[serde(rename = "video.split")]
    VideoSplit { clip_id: u64, seconds: f64 },
}

/// Convert an untrusted provider proposal into a bounded native typed request.
/// It is NOT sufficient approval: the caller must separately use the
/// persisted A07 plan, one native owner-consent and shared owner lock.
/// No other video action or arbitrary command is accepted at this stage.
#[allow(dead_code)]
fn parse_a07_video_split(value: Value, session: &Session) -> Result<TypedVideoEdit> {
    let proposal: A07VideoProposal = serde_json::from_value(value).map_err(|_| {
        EngineError::Other("A07_ACTION_REJECTED: invalid or unsupported video action schema".into())
    })?;
    match proposal {
        A07VideoProposal::VideoSplit { clip_id, seconds } => {
            if clip_id == 0 || !seconds.is_finite() || !(0.0..=21_600.0).contains(&seconds) {
                return Err(EngineError::Other("A07_ACTION_REJECTED: invalid clip or seconds".into()));
            }
            // Convert exactly once and snap to the ACTIVE native sequence rate.
            let tick = (seconds * TICKS_PER_SECOND as f64).round();
            if !tick.is_finite() || tick < i64::MIN as f64 || tick > i64::MAX as f64 {
                return Err(EngineError::Other("A07_ACTION_REJECTED: time overflow".into()));
            }
            let tick = session.sequence_rate().snap_nearest(Tick(tick as i64)).0;
            Ok(TypedVideoEdit::SplitClipAt { clip_id, tick })
        }
    }
}

/// Locate the exact clip ID on the ORIGINAL project timeline and ensure the
/// split lies strictly inside it; no fallback to timeline selection or targeted
/// tracks is allowed. A model cannot invent an ID and get another clip edited.
fn clip_target_in(sequence: &Value, clip_id: u64, tick: i64) -> Result<(String, u64)> {
    for kind in ["video", "audio"] {
        let tracks = sequence[kind].as_array().ok_or_else(|| EngineError::Other("missing native tracks".into()))?;
        for track in tracks {
            let items = track["items"].as_array().ok_or_else(|| EngineError::Other("missing native items".into()))?;
            for item in items {
                if item["clip"].as_u64() != Some(clip_id) {
                    continue;
                }
                let start = item["start"].as_i64().ok_or_else(|| EngineError::Other("native clip missing start".into()))?;
                let end = item["end"].as_i64().ok_or_else(|| EngineError::Other("native clip missing end".into()))?;
                if tick <= start || tick >= end {
                    return Err(EngineError::Other("SPLIT_OUT_OF_RANGE: tick must lie inside exact native clip".into()));
                }
                if track["locked"].as_bool() != Some(false) {
                    return Err(EngineError::Other("A07_CLIP_LOCKED: refuse to edit a locked or unverifiable track".into()));
                }
                let track_id = track["id"].as_u64().ok_or_else(|| EngineError::Other("native track missing id".into()))?;
                return Ok((kind.to_string(), track_id));
            }
        }
    }
    Err(EngineError::Other("A07_CLIP_NOT_FOUND: no exact clip ID in active sequence".into()))
}



fn preview_action_on_snapshot(
    session: &Session,
    before: &shuvi_ai_readonly::NativeVideoSnapshot,
    proposal: Value,
) -> Result<shuvi_ai_readonly::NativeA07SplitPreview> {
    let action = parse_a07_video_split(proposal, session)?;
    let TypedVideoEdit::SplitClipAt { clip_id, tick } = action else {
        return Err(EngineError::Other("A07_ACTION_REJECTED: unsupported native preview action".into()));
    };
    let sequence = before.sequence.as_ref().ok_or(EngineError::NoSequence)?;
    let (track_kind, track_id) = clip_target_in(sequence, clip_id, tick)?;
    let source_item_id = sequence[track_kind.as_str()].as_array()
        .and_then(|tracks| tracks.iter().find(|t| t["id"].as_u64() == Some(track_id)))
        .and_then(|track| track["items"].as_array())
        .and_then(|items| items.iter().find(|item| item["clip"].as_u64() == Some(clip_id)))
        .and_then(|clip| clip["item"].as_u64())
        .ok_or_else(|| EngineError::Other("A07_PREFLIGHT_INCOMPLETE: native clip source identity missing".into()))?;
    Ok(shuvi_ai_readonly::NativeA07SplitPreview {
        revision: before.revision,
        document_epoch: before.document_epoch,
        sequence_id: before.active_sequence.ok_or(EngineError::NoSequence)?,
        clip_id,
        source_item_id,
        track_id,
        track_kind,
        tick,
    })
}

/// Neither the UI nor a model can create A07 approval, owner identity or a
/// durable plan hash by calling this read-only multi-action preview.
pub(crate) fn preflight_a07_video_plan(
    session: &mut Session,
    proposals: Value,
) -> Result<shuvi_ai_readonly::NativeA07PlanPreview> {
    // Exact accepted untrusted planner shapes: [actions] OR
    // {"reason":"...","actions":[...]}, with no other fields.
    let actions = match proposals {
        Value::Array(items) => items,
        Value::Object(mut document) => {
            if document.len() != 2 || !document.contains_key("reason") || !document.contains_key("actions") {
                return Err(EngineError::Other("A07_PLAN_REJECTED: unexpected proposal fields".into()));
            }
            let reason = document.remove("reason").and_then(|v| v.as_str().map(str::to_owned))
                .ok_or_else(|| EngineError::Other("A07_PLAN_REJECTED: invalid reason".into()))?;
            if reason.len() > 2000 {
                return Err(EngineError::Other("A07_PLAN_REJECTED: reason too long".into()));
            }
            document.remove("actions").and_then(|v| v.as_array().cloned())
                .ok_or_else(|| EngineError::Other("A07_PLAN_REJECTED: invalid action list".into()))?
        }
        _ => return Err(EngineError::Other("A07_PLAN_REJECTED: expected action list".into())),
    };
    if !(1..=12).contains(&actions.len()) {
        return Err(EngineError::Other("A07_PLAN_REJECTED: expected 1..12 actions".into()));
    }
    let source = shuvi_ai_readonly::snapshot(session)?;
    let mut seen_clip_ids = std::collections::BTreeSet::new();
    let mut evaluated = Vec::with_capacity(actions.len());
    for raw in actions {
        let view = preview_action_on_snapshot(session, &source, raw)?;
        // The next cut would change original clip geometry. We do not attempt
        // to simulate dependent multi-step IDs or implicitly replay edits.
        if !seen_clip_ids.insert(view.clip_id) {
            return Err(EngineError::Other("A07_PLAN_REJECTED: duplicate clip action; replan after readback".into()));
        }
        evaluated.push(view);
    }
    if session.revision != source.revision
        || session.document_epoch != source.document_epoch
        || session.state.active_sequence.map(|id| id.0) != source.active_sequence
        || shuvi_ai_readonly::a07_native_project_sha256(session) != source.project_sha256
    {
        return Err(EngineError::Other("A07_PLAN_PREVIEW_STALE: editor changed while examining proposal".into()));
    }
    Ok(shuvi_ai_readonly::NativeA07PlanPreview {
        source_project: std::sync::Arc::clone(&session.project),
        source_project_path: session.path.clone(),
        project_sha256: source.project_sha256,
        revision: source.revision,
        document_epoch: source.document_epoch,
        active_sequence: source.active_sequence.ok_or(EngineError::NoSequence)?,
        actions: evaluated,
    })
}

pub(crate) fn preflight_a07_video_split(
    session: &mut Session,
    proposal: Value,
) -> Result<shuvi_ai_readonly::NativeA07SplitPreview> {
    let before = shuvi_ai_readonly::snapshot(session)?;
    let result = preview_action_on_snapshot(session, &before, proposal)?;
    if session.revision != before.revision
        || session.document_epoch != before.document_epoch
        || session.state.active_sequence.map(|id| id.0) != before.active_sequence
        || shuvi_ai_readonly::a07_native_project_sha256(session) != before.project_sha256
    {
        return Err(EngineError::Other("A07_PREFLIGHT_STALE: native Session changed during inspection".into()));
    }
    Ok(result)
}

/// Read back that a clip-specific split did not touch ANY unrelated track.
/// The A07 host additionally needs SHA-256 native object proof and a SQLite
/// committed receipt; a per-track equality check is not those assurances.
fn confirm_other_tracks_unchanged(before: &Value, after: &Value, kind: &str, target_track: u64) -> Result<()> {
    for key in ["video", "audio"] {
        let original = before[key].as_array().ok_or_else(|| EngineError::Other("missing before tracks".into()))?;
        let current = after[key].as_array().ok_or_else(|| EngineError::Other("missing after tracks".into()))?;
        if original.len() != current.len() {
            return Err(EngineError::Other("UNKNOWN_NATIVE_VIDEO_OUTCOME: track count changed".into()));
        }
        for (a, b) in original.iter().zip(current) {
            if a["id"] != b["id"] {
                return Err(EngineError::Other("UNKNOWN_NATIVE_VIDEO_OUTCOME: track identity changed".into()));
            }
            if !(key == kind && a["id"].as_u64() == Some(target_track)) && a != b {
                return Err(EngineError::Other("UNKNOWN_NATIVE_VIDEO_OUTCOME: unrelated track changed".into()));
            }
        }
    }
    Ok(())
}


/// Stronger than revision/count: inspect the named clip's unchanged source,
/// original left-hand ID and new right-hand ID at the exact native cut tick.
/// Unaffected clips must remain byte-for-byte equal in the query values.
/// This is not a SHA-256 proof; A07 must still hash the canonical native
/// affected objects before committing its durable action receipt.
fn confirm_named_split(
    before: &Value,
    after: &Value,
    kind: &str,
    track_id: u64,
    clip_id: u64,
    tick: i64,
) -> Result<u64> {
    // Explicit lifetime is required: the returned track borrows its specific
    // before/after snapshot, not a shared closure lifetime inferred from capture.
    fn find_track<'a>(sequence: &'a Value, kind: &str, track_id: u64) -> Result<&'a Value> {
        sequence[kind].as_array()
            .and_then(|tracks| tracks.iter().find(|t| t["id"].as_u64() == Some(track_id)))
            .ok_or_else(|| EngineError::Other("UNKNOWN_NATIVE_VIDEO_OUTCOME: exact track is missing".into()))
    }
    let old_track = find_track(before, kind, track_id)?;
    let new_track = find_track(after, kind, track_id)?;
    let old_items = old_track["items"].as_array().ok_or_else(|| EngineError::Other("native source items missing".into()))?;
    let new_items = new_track["items"].as_array().ok_or_else(|| EngineError::Other("native edited items missing".into()))?;
    let old_clip = old_items.iter().find(|c| c["clip"].as_u64() == Some(clip_id))
        .ok_or_else(|| EngineError::Other("UNKNOWN_NATIVE_VIDEO_OUTCOME: source clip missing".into()))?;
    let left = new_items.iter().find(|c| c["clip"].as_u64() == Some(clip_id))
        .ok_or_else(|| EngineError::Other("UNKNOWN_NATIVE_VIDEO_OUTCOME: left clip missing".into()))?;
    let right_candidates: Vec<&Value> = new_items.iter().filter(|c|
        c["clip"].as_u64().is_some_and(|id| !old_items.iter().any(|old| old["clip"].as_u64() == Some(id)))
    ).collect();
    if right_candidates.len() != 1 {
        return Err(EngineError::Other("UNKNOWN_NATIVE_VIDEO_OUTCOME: right clip missing or ambiguous".into()));
    }
    let right = right_candidates[0];
    if left["start"] != old_clip["start"] ||
        left["end"].as_i64() != Some(tick) ||
        right["start"].as_i64() != Some(tick) ||
        right["end"] != old_clip["end"] ||
        left["item"] != old_clip["item"] ||
        right["item"] != old_clip["item"] ||
        left["sourceIn"] != old_clip["sourceIn"] ||
        left["reverse"] != old_clip["reverse"] ||
        right["reverse"] != old_clip["reverse"] ||
        new_items.len() != old_items.len() + 1
    {
        return Err(EngineError::Other("UNKNOWN_NATIVE_VIDEO_OUTCOME: wrong split object or boundaries".into()));
    }
    for existing in old_items.iter().filter(|c| c["clip"].as_u64() != Some(clip_id)) {
        if new_items.iter().find(|c| c["clip"] == existing["clip"]) != Some(existing) {
            return Err(EngineError::Other("UNKNOWN_NATIVE_VIDEO_OUTCOME: unrelated clip changed".into()));
        }
    }
    right["clip"].as_u64().ok_or_else(|| EngineError::Other("UNKNOWN_NATIVE_VIDEO_OUTCOME: new clip identity missing".into()))
}

/// Testable real native editing primitive, deliberately NOT exported from the
/// crate. There is NO model-facing or renderer-facing caller in this milestone.
///
/// The caller must hold the actual owner lock and a persisted approved A07 plan
/// before this may be wired into the production AI flow. No rollback/blind retry
/// is attempted if the original engine reports an uncertain result.
#[allow(dead_code)]
pub(crate) fn execute_owner_only(
    session: &mut Session,
    fence: &SessionFence,
    action: TypedVideoEdit,
) -> Result<NativeEditReadback> {
    fence.verify(session)?;
    let before = shuvi_ai_readonly::snapshot(session)?;
    let original_sequence = before.sequence.as_ref().ok_or(EngineError::NoSequence)?;
    let before_clips = timeline_clip_count(original_sequence)?;

    // All edits use the true original engine's synchronous Session. The exact
    // clip-specific A07 variant never falls back to selected/targeted tracks.
    let clip_target = match action {
        TypedVideoEdit::SplitClipAt { clip_id, tick } => {
            Some(clip_target_in(original_sequence, clip_id, tick)?)
        }
        TypedVideoEdit::SplitAllTracksAt { .. } => None,
    };
    let cuts = match action {
        TypedVideoEdit::SplitAllTracksAt { tick } => {
            let end = original_sequence["duration"].as_i64().ok_or_else(|| {
                EngineError::Other("native timeline duration missing".into())
            })?;
            if tick <= 0 || tick >= end {
                return Err(EngineError::Other("SPLIT_OUT_OF_RANGE: split tick must be strictly inside native sequence".into()));
            }
            let result = session.execute("sequence.addEditAllTracks", json!({"time": tick}))?;
            result["cuts"].as_u64().ok_or_else(|| {
                EngineError::Other("UNKNOWN_NATIVE_VIDEO_OUTCOME: cut count missing; do not retry blindly".into())
            })?
        }
        TypedVideoEdit::SplitClipAt { clip_id, tick } => {
            let razor_at = Tick(tick);
            // Direct original FilmCraft edit algebra, with ONE precise clip ID,
            // rather than menu focus, synthetic input or Selection fallback.
            let ids = session.edit_sequence("Shuvi Native Split Clip", |seq, ctx, _| {
                Ok(filmcraft_edit::razor_items(seq, &[ClipId(clip_id)], razor_at, ctx))
            })?;
            ids.len() as u64
        }
    };
    let after = shuvi_ai_readonly::snapshot(session)?;
    let after_sequence = after.sequence.as_ref().ok_or_else(|| {
        EngineError::Other("UNKNOWN_NATIVE_VIDEO_OUTCOME: sequence disappeared; do not retry blindly".into())
    })?;
    let after_clips = timeline_clip_count(after_sequence)?;
    let mut created_clip_id = None;
    if let Some((kind, target_track)) = clip_target {
        confirm_other_tracks_unchanged(original_sequence, after_sequence, &kind, target_track)?;
        if let TypedVideoEdit::SplitClipAt { clip_id, tick } = action {
            created_clip_id = Some(confirm_named_split(original_sequence, after_sequence, &kind, target_track, clip_id, tick)?);
        }
        if after_clips != before_clips + 1 || cuts != 1 {
            return Err(EngineError::Other("UNKNOWN_NATIVE_VIDEO_OUTCOME: expected exactly one target clip split".into()));
        }
    }
    if after.active_sequence != before.active_sequence
        || after.document_epoch != before.document_epoch
        || cuts == 0 || after_clips <= before_clips || after.revision <= before.revision
    {
        return Err(EngineError::Other(
            "UNKNOWN_NATIVE_VIDEO_OUTCOME: independent timeline readback mismatch; do not retry blindly".into(),
        ));
    }
    Ok(NativeEditReadback {
        before_revision: before.revision,
        after_revision: after.revision,
        sequence_id: fence.active_sequence.0,
        cuts,
        before_clips,
        after_clips,
        created_clip_id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn demo() -> Session {
        let mut s = Session::default();
        s.execute("file.openDemoProject", json!({})).unwrap();
        s
    }

    #[test]
    fn shuvi_ai_owner_real_split_undo_and_independent_readback() {
        let mut session = demo();
        let tick = session.sequence_rate().tick_of(48).0;
        let fence = SessionFence::capture(&session).unwrap();
        let evidence = execute_owner_only(&mut session, &fence, TypedVideoEdit::SplitAllTracksAt { tick }).unwrap();
        assert!(evidence.cuts > 0);
        assert_eq!(evidence.sequence_id, session.state.active_sequence.unwrap().0);
        assert!(evidence.after_revision > evidence.before_revision);
        assert!(evidence.after_clips > evidence.before_clips);
        session.execute("edit.undo", json!({})).unwrap();
        let reverted = shuvi_ai_readonly::snapshot(&mut session).unwrap();
        let clips = timeline_clip_count(reverted.sequence.as_ref().unwrap()).unwrap();
        assert_eq!(clips, evidence.before_clips);
    }

    #[test]
    fn shuvi_ai_owner_rejects_stale_revision_before_command() {
        let mut session = demo();
        let fence = SessionFence::capture(&session).unwrap();
        session.execute("file.newSequence", json!({"name": "Manual edit"})).unwrap();
        let baseline = (session.revision, session.journal.len());
        let res = execute_owner_only(&mut session, &fence, TypedVideoEdit::SplitAllTracksAt { tick: 1 });
        assert!(res.unwrap_err().to_string().contains("STALE_NATIVE_VIDEO_PROJECT"));
        assert_eq!((session.revision, session.journal.len()), baseline);
    }

    #[test]
    fn shuvi_ai_owner_rejects_different_session_same_revision_and_ids() {
        let first = demo();
        let fence = SessionFence::capture(&first).unwrap();
        let mut different_session = demo();
        // Equal revision and sequence IDs do not imply the same live Session.
        assert_eq!(different_session.revision, first.revision);
        assert_eq!(different_session.state.active_sequence, first.state.active_sequence);
        let baseline = (different_session.revision, different_session.journal.len());
        let res = execute_owner_only(&mut different_session, &fence, TypedVideoEdit::SplitAllTracksAt { tick: 1 });
        assert!(res.unwrap_err().to_string().contains("STALE_NATIVE_VIDEO_PROJECT"));
        assert_eq!((different_session.revision, different_session.journal.len()), baseline);
    }

    #[test]
    fn shuvi_ai_owner_out_of_range_is_rejected_without_editing() {
        let mut session = demo();
        let fence = SessionFence::capture(&session).unwrap();
        let length = session.active_sequence().unwrap().duration().0;
        let baseline = (session.revision, session.journal.len());
        for tick in [-5, 0, length, i64::MAX] {
            let res = execute_owner_only(&mut session, &fence, TypedVideoEdit::SplitAllTracksAt { tick });
            assert!(res.unwrap_err().to_string().contains("SPLIT_OUT_OF_RANGE"));
            assert_eq!((session.revision, session.journal.len()), baseline);
        }
    }


    #[test]
    fn shuvi_a07_video_split_parser_rejects_model_extra_fields_and_other_actions() {
        let session = demo();
        let valid = json!({"type":"video.split","clipId":7,"seconds":2.0});
        assert!(matches!(parse_a07_video_split(valid, &session).unwrap(), TypedVideoEdit::SplitClipAt { clip_id: 7, .. }));
        for invalid in [
            json!({"type":"video.split","clipId":7,"seconds":2,"approved":true}),
            json!({"type":"video.delete","clipId":7}),
            json!({"type":"system.shell","command":"rm"}),
            json!({"type":"video.split","clipId":0,"seconds":2}),
            json!({"type":"video.split","clipId":7,"seconds":-1}),
            json!({"type":"video.split","clipId":7,"seconds":21601}),
            json!({"type":"video.split","clipId":"7","seconds":2}),
        ] {
            assert!(parse_a07_video_split(invalid, &session).is_err());
        }
    }

    #[test]
    fn shuvi_a07_native_video_split_changes_only_named_clip_and_can_undo() {
        let mut session = demo();
        let tick = session.sequence_rate().tick_of(48);
        let sequence = session.active_sequence().unwrap();
        let clip = sequence.video_tracks[0].items.iter()
            .find(|x| x.start < tick && tick < x.end()).expect("source clip crossing frame 48").id.0;
        let before = shuvi_ai_readonly::snapshot(&mut session).unwrap();
        let proposal = json!({"type":"video.split","clipId":clip,"seconds":2.0});
        let action = parse_a07_video_split(proposal, &session).unwrap();
        let fence = SessionFence::capture(&session).unwrap();
        let result = execute_owner_only(&mut session, &fence, action).unwrap();
        assert_eq!(result.cuts, 1);
        assert_eq!(result.after_clips, result.before_clips + 1);
        let new_id = result.created_clip_id.expect("real right-half native clip ID");
        assert_ne!(new_id, clip);
        assert!(session.active_sequence().unwrap().find_item(ClipId(new_id)).is_some());
        let after = shuvi_ai_readonly::snapshot(&mut session).unwrap();
        // The only changed native track is confirmed inside the adapter;
        // Undo restores the full previous sequence.
        session.execute("edit.undo", json!({})).unwrap();
        let undone = shuvi_ai_readonly::snapshot(&mut session).unwrap();
        assert_eq!(undone.sequence, before.sequence);
        assert!(after.revision > before.revision);
    }

    #[test]
    fn shuvi_a07_missing_or_outside_clip_does_not_edit_or_change_selection() {
        let mut session = demo();
        let tick = session.sequence_rate().tick_of(48).0;
        let original_selection = session.state.selection.clone();
        let baseline = (session.revision, session.journal.len());
        let fence = SessionFence::capture(&session).unwrap();
        for action in [
            TypedVideoEdit::SplitClipAt { clip_id: u64::MAX, tick },
            TypedVideoEdit::SplitClipAt { clip_id: 0, tick },
        ] {
            assert!(execute_owner_only(&mut session, &fence, action).is_err());
            assert_eq!((session.revision, session.journal.len()), baseline);
            assert_eq!(session.state.selection, original_selection);
        }
    }


    #[test]
    fn shuvi_a07_locked_native_track_refuses_before_any_edit() {
        let mut session = demo();
        let tick = session.sequence_rate().tick_of(48).0;
        let clip_id = session.active_sequence().unwrap().video_tracks[0].items.iter()
            .find(|c| c.start.0 < tick && tick < c.end().0).unwrap().id.0;
        // Model can name this clip, but the trusted editor decides it is locked.
        let sequence_id = session.state.active_sequence.unwrap();
        std::sync::Arc::make_mut(&mut session.project)
            .sequence_mut(sequence_id).unwrap().video_tracks[0].locked = true;
        let fence = SessionFence::capture(&session).unwrap();
        let before = (session.revision, session.journal.len());
        let err = execute_owner_only(&mut session, &fence, TypedVideoEdit::SplitClipAt {clip_id,tick}).unwrap_err();
        assert!(err.to_string().contains("A07_CLIP_LOCKED"), "{err}");
        assert_eq!((session.revision, session.journal.len()), before);
    }

    #[test]
    fn shuvi_a07_seconds_are_snapped_to_native_sequence_framerate() {
        let session = demo();
        let proposal = json!({"type":"video.split","clipId":17,"seconds":2.0});
        let TypedVideoEdit::SplitClipAt { clip_id, tick } = parse_a07_video_split(proposal, &session).unwrap()
            else { panic!("valid A07 action must map to exact typed split") };
        assert_eq!(clip_id, 17);
        let expected = session.sequence_rate().snap_nearest(Tick((2.0 * TICKS_PER_SECOND as f64).round() as i64)).0;
        assert_eq!(tick, expected);
    }


    #[test]
    fn shuvi_ai06_preflight_reads_actual_clip_and_does_not_mutate_session() {
        let mut session = demo();
        let tick = session.sequence_rate().tick_of(48).0;
        let clip = session.active_sequence().unwrap().video_tracks[0].items.iter()
            .find(|c| c.start.0 < tick && tick < c.end().0).unwrap();
        let (clip_id, item_id) = (clip.id.0, clip.item.0);
        let (revision, journal) = (session.revision, session.journal.len());
        let view = shuvi_ai_readonly::a07_preflight_video_split(
            &mut session, json!({"type":"video.split","clipId":clip_id,"seconds":2.0})
        ).unwrap();
        assert_eq!(view.clip_id, clip_id);
        assert_eq!(view.source_item_id, item_id);
        assert_eq!(view.track_kind, "video");
        assert_eq!(view.sequence_id, session.state.active_sequence.unwrap().0);
        assert_eq!(view.revision, revision);
        assert_eq!((session.revision, session.journal.len()), (revision, journal));
    }

    #[test]
    fn shuvi_ai06_preflight_is_fail_closed_for_unknown_or_outside_clip() {
        let mut session = demo();
        let before = (session.revision, session.journal.len());
        for proposal in [
            json!({"type":"video.split","clipId":u64::MAX,"seconds":2.0}),
            json!({"type":"video.split","clipId":2,"seconds":0.0}),
            json!({"type":"video.split","clipId":2,"seconds":36000.0}),
            json!({"type":"video.split","clipId":2,"seconds":2.0,"approved":true}),
        ] {
            assert!(shuvi_ai_readonly::a07_preflight_video_split(&mut session, proposal).is_err());
            assert_eq!((session.revision, session.journal.len()), before);
        }
    }


    #[test]
    fn shuvi_ai08_multi_step_preview_read_only_and_fenced_after_manual_edit() {
        let mut session = demo();
        let tick = session.sequence_rate().tick_of(48);
        let mut targets = Vec::new();
        for track in &session.active_sequence().unwrap().video_tracks {
            for item in &track.items {
                if item.start < tick && tick < item.end() {
                    targets.push(item.id.0);
                }
            }
        }
        for track in &session.active_sequence().unwrap().audio_tracks {
            for item in &track.items {
                if item.start < tick && tick < item.end() {
                    targets.push(item.id.0);
                }
            }
        }
        assert!(targets.len() >= 2, "demo must expose at least two native clips across video/audio");
        let before = (session.revision, session.journal.len(), shuvi_ai_readonly::a07_native_project_sha256(&session));
        let json = json!({"reason":"two distinct clips","actions":[
            {"type":"video.split","clipId":targets[0],"seconds":2.0},
            {"type":"video.split","clipId":targets[1],"seconds":2.0}
        ]});
        let plan = shuvi_ai_readonly::a07_preflight_video_plan(&mut session, json).unwrap();
        assert_eq!(plan.actions.len(), 2);
        assert_eq!(plan.project_sha256, before.2);
        assert_eq!(session.journal.len(), before.1);
        assert_eq!(session.revision, before.0);
        assert!(shuvi_ai_readonly::a07_check_plan_preview_fresh(&session, &plan).is_ok());
        session.execute("file.newSequence", json!({"name":"manual"})).unwrap();
        let err = shuvi_ai_readonly::a07_check_plan_preview_fresh(&session, &plan).unwrap_err();
        assert!(err.to_string().contains("STALE"));
    }

    #[test]
    fn shuvi_ai08_plan_rejects_duplicate_clip_and_extra_claims_without_edits() {
        let mut session = demo();
        let tick = session.sequence_rate().tick_of(48);
        let clip = session.active_sequence().unwrap().video_tracks[0].items.iter()
            .find(|x| x.start < tick && tick < x.end()).unwrap().id.0;
        let action = json!({"type":"video.split","clipId":clip,"seconds":2.0});
        let before = (session.revision, session.journal.len(), shuvi_ai_readonly::a07_native_project_sha256(&session));
        for invalid in [
            json!([]),
            json!([action.clone(),action.clone()]),
            json!({"reason":"r","actions":[action.clone()],"approved":true}),
            json!({"reason":"r","actions":[]}),
            json!([{"type":"video.delete","clipId":clip}]),
            json!(vec![action.clone(); 13]),
        ] {
            assert!(shuvi_ai_readonly::a07_preflight_video_plan(&mut session, invalid).is_err());
            assert_eq!((session.revision, session.journal.len(), shuvi_ai_readonly::a07_native_project_sha256(&session)), before);
        }
    }


    #[test]
    fn shuvi_ai08_preview_rejects_different_session_even_with_identical_sha_and_revision() {
        let mut first = demo();
        let clip = first.active_sequence().unwrap().video_tracks[0].items.iter()
            .find(|c| c.start.0 < first.sequence_rate().tick_of(48).0 &&
                first.sequence_rate().tick_of(48).0 < c.end().0).unwrap().id.0;
        let plan = shuvi_ai_readonly::a07_preflight_video_plan(
            &mut first,
            json!([{"type":"video.split","clipId":clip,"seconds":2.0}])
        ).unwrap();
        let second = demo();
        assert_eq!(first.revision, second.revision);
        assert_eq!(first.document_epoch, second.document_epoch);
        assert_eq!(shuvi_ai_readonly::a07_native_project_sha256(&first),
            shuvi_ai_readonly::a07_native_project_sha256(&second));
        let rejected = shuvi_ai_readonly::a07_check_plan_preview_fresh(&second, &plan).unwrap_err();
        assert!(rejected.to_string().contains("STALE"));
        assert!(shuvi_ai_readonly::a07_check_plan_preview_fresh(&first, &plan).is_ok());
    }

    #[test]
    fn shuvi_ai_owner_has_no_public_provider_or_approval_path() {
        let readiness = shuvi_ai_readonly::readiness();
        assert!(!readiness.ai_mutations_enabled);
        assert!(!readiness.native_owner_consent);
        assert!(!readiness.shared_owner_lock);
        assert!(!readiness.durable_action_ledger);
    }
}
