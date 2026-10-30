//! Read-only FilmCraft Session evidence for the future native Shuvi AI dock.
//!
//! This module intentionally exposes NO model-originated edit dispatcher. It operates
//! on the very same Session object that the original egui frontend uses. Native
//! owner consent, durable action receipts and shared manual/AI admission MUST be
//! installed before adding any AI mutation capability.

use std::collections::BTreeSet;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::{EngineError, Result, Session};

/// A local observation, not an authorization token or persisted CAS proof.
/// A later edit MUST compare fresh native state while holding the shared owner lock.
#[derive(Debug)]
pub struct NativeVideoSnapshot {
    pub revision: u64,
    pub document_epoch: u64,
    pub active_sequence: Option<u64>,
    pub project_path: Option<String>,
    /// Native project hash computed once on readback refresh, not per UI frame.
    pub project_sha256: String,
    pub dirty: bool,
    pub project: Value,
    pub sequence: Option<Value>,
}

/// This module is NOT an AI execution integration. Do not turn these booleans
/// true merely because tests of the original engine command path pass.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NativeAiReadiness {
    pub source_session_readback: bool,
    pub ai_mutations_enabled: bool,
    pub shared_owner_lock: bool,
    pub durable_action_ledger: bool,
    pub native_owner_consent: bool,
}

pub const fn readiness() -> NativeAiReadiness {
    NativeAiReadiness {
        source_session_readback: true,
        ai_mutations_enabled: false,
        shared_owner_lock: false,
        durable_action_ledger: false,
        native_owner_consent: false,
    }
}

/// Execute only the original engine's registered *query* commands. This is
/// deliberately a closed set: it accepts neither command IDs nor params from
/// an AI provider or from the renderer.
fn query_readonly(session: &mut Session, id: &'static str) -> Result<Value> {
    let spec = crate::find_command(id).ok_or_else(|| EngineError::UnknownCommand(id.into()))?;
    if spec.journal {
        return Err(EngineError::Other(format!("refusing mutating command {id} in read-only adapter")));
    }
    let before = (
        session.revision,
        session.document_epoch,
        session.state.active_sequence,
        session.path.clone(),
        session.journal.len(),
    );
    let value = session.execute(id, json!({}))?;
    let after = (
        session.revision,
        session.document_epoch,
        session.state.active_sequence,
        session.path.clone(),
        session.journal.len(),
    );
    if before != after {
        return Err(EngineError::Other(format!("read-only command {id} changed session identity")));
    }
    Ok(value)
}

/// Collect independently queryable project and timeline evidence from the
/// editor's existing Session. All fields are local readback, not model claims.
pub fn snapshot(session: &mut Session) -> Result<NativeVideoSnapshot> {
    let revision = session.revision;
    let document_epoch = session.document_epoch;
    let active_sequence = session.state.active_sequence.map(|id| id.0);
    let project_path = session.path.clone();
    let dirty = session.is_dirty();
    let project = query_readonly(session, "project.inspect")?;
    let sequence = if active_sequence.is_some() {
        Some(query_readonly(session, "sequence.inspect")?)
    } else {
        None
    };
    if session.revision != revision
        || session.document_epoch != document_epoch
        || session.state.active_sequence.map(|id| id.0) != active_sequence
        || session.path != project_path
        || session.is_dirty() != dirty
    {
        return Err(EngineError::Other("FilmCraft session changed while collecting AI readback".into()));
    }
    let project_sha256 = a07_native_project_sha256(session);
    Ok(NativeVideoSnapshot {
        revision,
        document_epoch,
        active_sequence,
        project_path,
        project_sha256,
        dirty,
        project,
        sequence,
    })
}

/// Inspect the *actual* original registry, not a hand-written list of names.
/// Command proposals must still undergo a separate owner-scoped allowlist and
/// persisted approval before any future execution.
pub fn command_registry(session: &mut Session) -> Result<Value> {
    let registry = query_readonly(session, "command.list")?;
    if !registry.is_array() {
        return Err(EngineError::Other("FilmCraft command registry was not an array".into()));
    }
    Ok(registry)
}



#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeA07SplitPreview {
    pub revision: u64,
    pub document_epoch: u64,
    pub sequence_id: u64,
    pub clip_id: u64,
    pub source_item_id: u64,
    pub track_id: u64,
    pub track_kind: String,
    pub tick: i64,
}

/// Read-only A07 proposal preflight. This is not an approval or a capability
/// enabling edits. Output becomes stale after any change to the native Session.
pub fn a07_preflight_video_split(session: &mut Session, proposal: Value) -> Result<NativeA07SplitPreview> {
    crate::shuvi_ai_owner::preflight_a07_video_split(session, proposal)
}



/// A read-only *proposal preview*, NOT A07's SQLite-reserved plan or consent.
/// Neither these numeric IDs nor the fingerprint authorize execution.
#[derive(Debug, Clone)]
pub struct NativeA07PlanPreview {
    pub project_sha256: String,
    pub revision: u64,
    pub document_epoch: u64,
    pub active_sequence: u64,
    pub actions: Vec<NativeA07SplitPreview>,
}

/// Preview the exact A07 action list (1..=12) against ONE native project state.
/// No editor mutation, external provider, filesystem writes or owner approval.
pub fn a07_preflight_video_plan(session: &mut Session, proposal: Value) -> Result<NativeA07PlanPreview> {
    crate::shuvi_ai_owner::preflight_a07_video_plan(session, proposal)
}

/// An in-memory UI warning/stale fence. The canonical A07 ledger must do an
/// independent equivalent check inside its exclusive native Owner lock.
pub fn a07_check_plan_preview_fresh(session: &Session, plan: &NativeA07PlanPreview) -> Result<()> {
    if session.revision != plan.revision
        || session.document_epoch != plan.document_epoch
        || session.state.active_sequence.map(|id| id.0) != Some(plan.active_sequence)
        || a07_native_project_sha256(session) != plan.project_sha256
    {
        return Err(EngineError::Other("A07_PLAN_PREVIEW_STALE: project changed, refresh and replan".into()));
    }
    Ok(())
}

/// SHA-256 of the ORIGINAL editable FilmCraft project's native serialized
/// document, including unsaved edits. No UI/renderer/model-provided hash is
/// accepted. This fingerprint is a plan VERSION, not an approval or owner ID.
/// The canonical A07 host must separately bind a unique native editor session,
/// canonical project ID and a durable task plan while holding the shared lock.
pub fn a07_native_project_sha256(session: &Session) -> String {
    let encoded = filmcraft_format::encode(&session.project, false);
    format!("{:x}", Sha256::digest(&encoded))
}

/// SHA-256 of the precise original native clip object, queried from the active
/// sequence in memory. Does not send clip metadata or media paths to an AI.
/// The canonical A07 host must still validate its ledger binding, before/after
/// revision fence and independently read this hash after applying a named edit.
pub fn a07_native_clip_sha256(session: &Session, clip_id: u64) -> Result<String> {
    if clip_id == 0 || clip_id > MODEL_ID_LIMIT {
        return Err(EngineError::Other("A07_CLIP_PROOF_INVALID: invalid clip ID".into()));
    }
    let sequence = session.active_sequence().ok_or(EngineError::NoSequence)?;
    let clips = sequence.video_tracks.iter().chain(sequence.audio_tracks.iter());
    let mut found = None;
    for track in clips {
        if let Some(clip) = track.items.iter().find(|clip| clip.id.0 == clip_id) {
            if found.is_some() {
                return Err(EngineError::Other("A07_CLIP_PROOF_AMBIGUOUS: reused clip ID".into()));
            }
            let bytes = serde_json::to_vec(clip)
                .map_err(|_| EngineError::Other("A07_CLIP_PROOF_UNAVAILABLE: native serialization failed".into()))?;
            found = Some(format!("{:x}", Sha256::digest(&bytes)));
        }
    }
    found.ok_or_else(|| EngineError::Other("A07_CLIP_PROOF_NOT_FOUND: native clip missing".into()))
}

/// Read-only binding that remains stable across read-only inspection, changes
/// after a real native project edit, and never reads or exposes a secret.
pub fn a07_readonly_native_fingerprint(session: &mut Session) -> Result<Value> {
    let view = snapshot(session)?;
    let project_sha256 = view.project_sha256.clone();
    let active_sequence = view.active_sequence;
    if session.revision != view.revision
        || session.document_epoch != view.document_epoch
        || session.state.active_sequence.map(|id| id.0) != active_sequence
    {
        return Err(EngineError::Other("A07_NATIVE_FINGERPRINT_STALE: session changed".into()));
    }
    Ok(json!({
        "editor": "video",
        "versionSha256": project_sha256,
        "revision": view.revision,
        "documentEpoch": view.document_epoch,
        "activeSequenceId": active_sequence,
    }))
}

/// A07 NativeModelRequest requires exactly {"clipIds":[],"mediaIds":[]};
/// build the inventory from the real FilmCraft Session, never from untrusted
/// browser/model JSON, and never include any absolute path or source metadata.
const MODEL_ID_LIMIT: u64 = 9_007_199_254_740_991;
const MODEL_INVENTORY_LIMIT: usize = 128;

fn native_ids_for_provider(ids: impl IntoIterator<Item = u64>) -> Result<Vec<u64>> {
    let mut unique = BTreeSet::new();
    for id in ids {
        if id == 0 || id > MODEL_ID_LIMIT || !unique.insert(id) || unique.len() > MODEL_INVENTORY_LIMIT {
            return Err(EngineError::Other("A07_NATIVE_INVENTORY_INVALID: duplicate, invalid or too many IDs".into()));
        }
    }
    Ok(unique.into_iter().collect())
}

/// Sanitize the exact current editor's IDs for canonical A07 proposal planning.
/// This is information for planning ONLY; it grants no edit authority.
pub fn a07_video_inventory(session: &mut Session) -> Result<Value> {
    let before = snapshot(session)?;
    let sequence = session.active_sequence();
    let mut native_clips = Vec::new();
    if let Some(sequence) = sequence {
        for track in sequence.video_tracks.iter().chain(sequence.audio_tracks.iter()) {
            native_clips.extend(track.items.iter().map(|item| item.id.0));
        }
    }
    let clip_ids = native_ids_for_provider(native_clips)?;
    let media_ids = native_ids_for_provider(session.project.items.iter()
        .filter(|(_, item)| item.as_media().is_some())
        .map(|(id, _)| id.0))?;
    if session.revision != before.revision || session.document_epoch != before.document_epoch
        || session.state.active_sequence.map(|id| id.0) != before.active_sequence
    {
        return Err(EngineError::Other("A07_NATIVE_INVENTORY_STALE: editor changed during readback".into()));
    }
    Ok(json!({"clipIds": clip_ids, "mediaIds": media_ids}))
}

#[cfg(test)]
mod a07_inventory_bounds_tests {
    use super::*;
    #[test]
    fn refuses_invalid_duplicates_out_of_range_and_over_128() {
        for ids in [vec![0], vec![8,8], vec![MODEL_ID_LIMIT+1], (1..=129).collect::<Vec<_>>()] {
            assert!(native_ids_for_provider(ids).is_err());
        }
        assert_eq!(native_ids_for_provider(vec![7, 2, 4]).unwrap(), vec![2, 4, 7]);
    }
}
