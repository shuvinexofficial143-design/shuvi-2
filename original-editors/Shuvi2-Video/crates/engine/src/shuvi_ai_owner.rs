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

use serde_json::{Value, json};

use crate::{EngineError, Result, Session, project::{ItemId, Project}, shuvi_ai_readonly};

/// Deliberately closed action vocabulary. Never pass a model-supplied free-form
/// command name, raw script, arbitrary path or unbounded JSON params to execute.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum TypedVideoEdit {
    SplitAllTracksAt { tick: i64 },
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

    let (command, params) = match action {
        TypedVideoEdit::SplitAllTracksAt { tick } => {
            let end = original_sequence["duration"].as_i64().ok_or_else(|| {
                EngineError::Other("native timeline duration missing".into())
            })?;
            if tick <= 0 || tick >= end {
                return Err(EngineError::Other("SPLIT_OUT_OF_RANGE: split tick must be strictly inside native sequence".into()));
            }
            ("sequence.addEditAllTracks", json!({"time": tick}))
        }
    };

    // Execute only the precise original FilmCraft registered command, against
    // the SAME in-memory Session as the human's editing. Never use UIA or TCP.
    let result = session.execute(command, params)?;
    let cuts = result["cuts"].as_u64().ok_or_else(|| {
        EngineError::Other("UNKNOWN_NATIVE_VIDEO_OUTCOME: cut count missing; do not retry blindly".into())
    })?;
    let after = shuvi_ai_readonly::snapshot(session)?;
    let after_sequence = after.sequence.as_ref().ok_or_else(|| {
        EngineError::Other("UNKNOWN_NATIVE_VIDEO_OUTCOME: sequence disappeared; do not retry blindly".into())
    })?;
    let after_clips = timeline_clip_count(after_sequence)?;
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
    fn shuvi_ai_owner_has_no_public_provider_or_approval_path() {
        let readiness = shuvi_ai_readonly::readiness();
        assert!(!readiness.ai_mutations_enabled);
        assert!(!readiness.native_owner_consent);
        assert!(!readiness.shared_owner_lock);
        assert!(!readiness.durable_action_ledger);
    }
}
