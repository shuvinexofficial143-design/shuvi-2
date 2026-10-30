//! A11 isolated admission gate for the ACTUAL FilmCraft Session.
//! Manual native actions and canonical A07 GuardedHost borrow ONE Mutex.
//! Production egui has NOT yet been refactored to use this gate.
//! This is NOT a model/renderer API, permission service, or approval UI.
use std::sync::{Mutex, MutexGuard, TryLockError};
use filmcraft_engine::{Session, shuvi_ai_readonly};
use serde_json::Value;
use shuvi_ai_provider::{
    guard::{GuardError, NativeOwner, Snapshot},
    host::GuardedHost,
    transactional::TransactionalLedger,
};
use crate::VideoOwner;

#[derive(Debug)]
pub enum AdmissionError {
    /// Exclusive native manual/AI Session currently has another owner.
    Busy,
    /// A previous panic invalidated the native owner; do not bypass it.
    Poisoned,
    Native(String),
    A07(GuardError),
}

/// Local, trusted, native-owner-only identity. Never accept IDs from a
/// provider plan, WebView, external request, or untrusted path.
pub struct NativeVideoAdmission {
    owned: Mutex<Session>,
    project_id: String,
    session_id: String,
}
impl NativeVideoAdmission {
    pub fn new(mut session: Session, project_id: String, session_id: String)
        -> Result<Self, AdmissionError>
    {
        // Exact same validation as the real FilmCraft -> canonical A07 adapter,
        // before the Session can become eligible for this owner gate.
        VideoOwner::new(&mut session, project_id.clone(), session_id.clone())
            .map_err(AdmissionError::Native)?;
        Ok(Self { owned: Mutex::new(session), project_id, session_id })
    }

    fn acquire(&self) -> Result<MutexGuard<'_,Session>, AdmissionError> {
        match self.owned.try_lock() {
            Ok(guard) => Ok(guard),
            Err(TryLockError::WouldBlock) => Err(AdmissionError::Busy),
            Err(TryLockError::Poisoned(_)) => Err(AdmissionError::Poisoned),
        }
    }

    /// The original manual GUI should route *all* native edit commands, tab
    /// changes, Save/Open, undo/redo and read operations through this boundary
    /// before the real AI integration may ever be enabled.
    pub fn manual_command(&self, id: &str, params: Value)
        -> Result<Value, AdmissionError>
    {
        let mut owner=self.acquire()?;
        owner.execute(id,params).map_err(|e|AdmissionError::Native(e.to_string()))
    }

    /// Return local native data for building a test or displaying a consent
    /// plan, while the original Session is under the SAME admission gate.
    pub fn native_readback(&self)
        -> Result<shuvi_ai_readonly::NativeVideoSnapshot, AdmissionError>
    {
        let mut owner=self.acquire()?;
        shuvi_ai_readonly::snapshot(&mut owner)
            .map_err(|e|AdmissionError::Native(e.to_string()))
    }

    /// Native A07 snapshot. It is a project/session VERSION, NOT consent.
    pub fn a07_snapshot(&self) -> Result<Snapshot, AdmissionError> {
        let mut owner=self.acquire()?;
        let mut bridge=VideoOwner::new(
            &mut owner, self.project_id.clone(), self.session_id.clone()
        ).map_err(AdmissionError::Native)?;
        bridge.snapshot().map_err(AdmissionError::Native)
    }

    /// Reserve, owner consent and all A07 mutations hold the SAME native lock
    /// as manual commands. Canonical SQLite GuardedHost still independently
    /// checks the persisted approved plan, intent, idempotency and receipts.
    /// Caller is trusted native integration only. It must never be exported as
    /// a JSON command directly reachable from an AI provider or frontend.
    pub fn with_guarded_a07<R>(
        &self,
        ledger:&mut TransactionalLedger,
        execute:impl FnOnce(&mut GuardedHost<'_,VideoOwner<'_>>)->Result<R,GuardError>,
    ) -> Result<R,AdmissionError> {
        let mut owner=self.acquire()?;
        let mut bridge=VideoOwner::new(
            &mut owner, self.project_id.clone(), self.session_id.clone()
        ).map_err(AdmissionError::Native)?;
        let mut guarded=GuardedHost {ledger,owner:&mut bridge};
        execute(&mut guarded).map_err(AdmissionError::A07)
    }
}
