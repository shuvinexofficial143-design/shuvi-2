//! Read-only FilmCraft Session evidence for the future native Shuvi AI dock.
//!
//! This module intentionally exposes NO model-originated edit dispatcher. It operates
//! on the very same Session object that the original egui frontend uses. Native
//! owner consent, durable action receipts and shared manual/AI admission MUST be
//! installed before adding any AI mutation capability.

use serde_json::{Value, json};

use crate::{EngineError, Result, Session};

/// A local observation, not an authorization token or persisted CAS proof.
/// A later edit MUST compare fresh native state while holding the shared owner lock.
#[derive(Debug)]
pub struct NativeVideoSnapshot {
    pub revision: u64,
    pub document_epoch: u64,
    pub active_sequence: Option<u64>,
    pub project_path: Option<String>,
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
    Ok(NativeVideoSnapshot {
        revision,
        document_epoch,
        active_sequence,
        project_path,
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
