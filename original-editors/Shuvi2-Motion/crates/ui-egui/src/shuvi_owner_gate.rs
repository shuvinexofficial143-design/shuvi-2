//! M-AI13: original native egui *manual command* owner admission foundation.
//!
//! This protects the two ordinary command routes (menus/shortcuts via
//! menus::frontend::run_engine and control channel engine.execute) with one
//! app-owned gate. It is NOT a complete editor-wide lock: direct Session edits,
//! custom panel mutations, script callbacks, and a production AI executor must
//! be reconciled before GuardedHost can be enabled.
//!
//! In particular, production code has NO constructor for an AI lease and this
//! file never fabricates 2.0.3 SQLite approvals or an OwnerPermit.
use std::cell::Cell;
use effectcraft_engine::Session;
use serde_json::Value;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Owner {
    Idle,
    Manual,
    Guarded,
}

/// Single-threaded original egui app owner. Every wrapped manual route uses
/// this same instance; this is NOT a cross-process mutex or authorization.
#[derive(Debug)]
pub(crate) struct MotionOwnerGate {
    owner: Cell<Owner>,
    completed: Cell<u64>,
    denied: Cell<u64>,
}

impl Default for MotionOwnerGate {
    fn default() -> Self {
        Self {
            owner: Cell::new(Owner::Idle),
            completed: Cell::new(0),
            denied: Cell::new(0),
        }
    }
}

#[derive(Debug)]
struct Lease<'a> {
    gate: &'a MotionOwnerGate,
    owner: Owner,
}
impl Drop for Lease<'_> {
    fn drop(&mut self) {
        // Every admitted route releases on normal return, error or unwind.
        // It must NEVER silently release a different owner.
        if self.gate.owner.get() == self.owner {
            self.gate.owner.set(Owner::Idle);
        }
    }
}

impl MotionOwnerGate {
    fn enter(&self, owner: Owner) -> Result<Lease<'_>, String> {
        if self.owner.get() != Owner::Idle {
            self.denied.set(self.denied.get().saturating_add(1));
            return Err("native editor owner busy: manual and guarded requests cannot overlap".into());
        }
        self.owner.set(owner);
        Ok(Lease { gate: self, owner })
    }

    fn manual(&self, session: &mut Session, cmd: &str, params: Value, strict: bool) -> Result<Value, String> {
        let _lease = self.enter(Owner::Manual)?;
        let result = if strict {
            session.execute_checked(cmd, params)
        } else {
            session.execute(cmd, params)
        };
        // Counts completed native calls, including commands returning engine errors,
        // but NOT calls rejected before admission.
        self.completed.set(self.completed.get().saturating_add(1));
        result.map_err(|e| e.to_string())
    }

    /// Used for native menu commands and shortcuts (legacy menu parameters).
    pub(crate) fn manual_menu_command(&self, session: &mut Session, cmd: &str, params: Value)
        -> Result<Value, String> {
        self.manual(session, cmd, params, false)
    }

    /// Used for control-channel engine.execute with exact schema checking.
    pub(crate) fn manual_control_command(&self, session: &mut Session, cmd: &str, params: Value)
        -> Result<Value, String> {
        self.manual(session, cmd, params, true)
    }

    /// Admit a native manual transaction that is not expressible as a single
    /// engine command (e.g. restoring the exact undo/project snapshot on
    /// cancelling an original Layer Style dialog). The caller owns all native
    /// state references; no AI/provider code can request this closure.
    pub(crate) fn manual_transaction<T>(
        &self, transaction: impl FnOnce() -> Result<T, String>
    ) -> Result<T, String> {
        let _lease = self.enter(Owner::Manual)?;
        let result = transaction();
        self.completed.set(self.completed.get().saturating_add(1));
        result
    }

    /// This is deliberately a read-only status snapshot. An AI provider cannot
    /// turn any of these values into an active mutation permit.
    pub(crate) fn status(&self) -> MotionOwnerStatus {
        MotionOwnerStatus {
            busy: self.owner.get() != Owner::Idle,
            admitted_manual_calls: self.completed.get(),
            refused_nested_calls: self.denied.get(),
            production_guarded_editing: false,
            all_manual_routes_reconciled: false,
        }
    }

    /// Stub is ALWAYS denied in shipping builds. Do not create an AI lease
    /// without trusted owner UI, a persistent SQLite ledger and a verified
    /// shared admission scheme for ALL native mutation paths.
    pub(crate) fn ai_edit_not_integrated(&self) -> Result<(), String> {
        Err("production AI editing disabled: shared native owner integration incomplete".into())
    }

    #[cfg(test)]
    fn guarded_for_test(&self) -> Result<Lease<'_>, String> {
        self.enter(Owner::Guarded)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct MotionOwnerStatus {
    pub busy: bool,
    pub admitted_manual_calls: u64,
    pub refused_nested_calls: u64,
    pub production_guarded_editing: bool,
    pub all_manual_routes_reconciled: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn real_native_manual_menu_and_control_share_exact_one_owner() {
        let gate = MotionOwnerGate::default();
        let mut session = Session::new();
        let comp = gate.manual_menu_command(&mut session,"comp.new",json!({
            "name":"Owner Bound", "width":640, "height":360,
            "frameRate":30, "duration":4
        })).unwrap()["comp"].as_u64().unwrap();
        assert!(session.project.comp(effectcraft_engine::project::ItemId(comp)).is_some());
        let tree = gate.manual_control_command(&mut session,"comp.info",json!({"comp":comp})).unwrap();
        assert_eq!(tree["width"],640);
        assert_eq!(gate.status().admitted_manual_calls,2);
        assert!(!gate.status().busy);
        assert!(!gate.status().production_guarded_editing);
        assert!(!gate.status().all_manual_routes_reconciled);
    }

    #[test]
    fn guarded_exclusivity_blocks_actual_manual_mutation_without_bypass() {
        let gate = MotionOwnerGate::default();
        let mut session = Session::new();
        let revision = session.revision;
        {
            let _guard = gate.guarded_for_test().unwrap();
            assert!(gate.status().busy);
            assert!(gate.manual_menu_command(&mut session,"comp.new",json!({"name":"Forbidden"}))
                .unwrap_err().contains("owner busy"));
            assert!(gate.manual_control_command(&mut session,"comp.new",json!({"name":"Also Forbidden"}))
                .unwrap_err().contains("owner busy"));
            assert_eq!(session.revision,revision);
            assert!(session.project.items.is_empty());
            assert!(gate.guarded_for_test().is_err());
        }
        assert!(!gate.status().busy);
        assert_eq!(gate.status().refused_nested_calls,3);
        assert_eq!(gate.status().admitted_manual_calls,0);
        gate.manual_control_command(&mut session,"comp.new",json!({"name":"After Release"})).unwrap();
        assert_eq!(session.project.items.len(),1);
    }

    #[test]
    fn command_error_releases_manual_owner_and_malformed_json_cannot_bypass_it() {
        let gate = MotionOwnerGate::default();
        let mut session = Session::new();
        assert!(gate.manual_control_command(&mut session,"unknown.command",json!({})).is_err());
        assert!(!gate.status().busy);
        assert!(gate.manual_control_command(&mut session,"comp.new",json!({
            "name":"Allowed", "notAnAcceptedField":true
        })).is_err());
        assert_eq!(session.revision,0);
        assert!(!gate.status().busy);
        gate.manual_menu_command(&mut session,"comp.new",json!({"name":"After Errors"})).unwrap();
        assert_eq!(gate.status().admitted_manual_calls,3);
    }

    #[test]
    fn nested_manual_entry_is_denied_and_lease_drop_releases_owner() {
        let gate = MotionOwnerGate::default();
        let mut session = Session::new();
        {
            let _lease = gate.enter(Owner::Manual).unwrap();
            assert!(gate.manual_control_command(&mut session,"comp.new",json!({"name":"Nested"})).is_err());
            assert!(session.project.items.is_empty());
        }
        assert!(!gate.status().busy);
        gate.manual_control_command(&mut session,"comp.new",json!({"name":"Normal"})).unwrap();
        assert_eq!(session.project.items.len(),1);
    }

    #[test]
    fn actual_effectcraft_app_control_and_menu_routes_share_admission_counter() {
        // Exercise the real original frontend, not merely calling the gate
        // in isolation. This test requires no provider/API key or edits by AI.
        use crate::{EffectcraftApp, ControlRequest};
        use crate::control::{self, Outcome};
        let mut app = EffectcraftApp::new(Session::new());
        let ctx = egui::Context::default();
        let (req, _reply) = ControlRequest::new("engine.execute",json!({
            "command":"comp.new",
            "params":{"name":"Created via Control","width":500,"height":300,
                "frameRate":30,"duration":3}
        }));
        let result = control::handle(&mut app,&ctx,&req,0.0);
        let cid = match result {
            Outcome::Done(json) => {
                assert_eq!(json["ok"],true);
                json["result"]["comp"].as_u64().unwrap()
            }
            _=>panic!("a native direct command must reply synchronously"),
        };
        assert!(app.session.project.comp(effectcraft_engine::project::ItemId(cid)).is_some());
        assert_eq!(app.motion_owner_gate.status().admitted_manual_calls,1);
        crate::menus::invoke(&mut app,&ctx,"comp.new",json!({
            "name":"Created via Menu","width":800,"height":600,
            "frameRate":24,"duration":5
        })).unwrap();
        assert_eq!(app.motion_owner_gate.status().admitted_manual_calls,2);
        assert!(app.session.project.items.values().any(|i|i.name=="Created via Menu"));
        assert!(!app.motion_owner_gate.status().busy);
        assert!(app.motion_owner_gate.ai_edit_not_integrated().is_err());
    }

    #[test]
    fn original_control_rejects_unknown_params_before_native_mutation() {
        use crate::{EffectcraftApp, ControlRequest};
        use crate::control::{self, Outcome};
        let mut app = EffectcraftApp::new(Session::new());
        let ctx=egui::Context::default();
        let before=app.session.revision;
        let (request,_receiver)=ControlRequest::new("engine.execute",json!({
            "command":"comp.new",
            "params":{"name":"Must Be Rejected","unsupportedKey":42}
        }));
        match control::handle(&mut app,&ctx,&request,0.0){
            Outcome::Done(v)=>assert_eq!(v["ok"],false),
            _=>panic!("schema rejection must be immediate"),
        }
        assert_eq!(app.session.revision,before);
        assert!(!app.session.project.items.values().any(|i|i.name=="Must Be Rejected"));
        assert_eq!(app.motion_owner_gate.status().admitted_manual_calls,1);
        assert!(!app.motion_owner_gate.status().busy);
    }

    #[test]
    fn direct_manual_project_restoration_is_refused_during_test_guarded_owner() {
        use std::sync::Arc;
        let gate=MotionOwnerGate::default();
        let mut session=Session::new();
        let original=Arc::clone(&session.project);
        {
            let _owned=gate.guarded_for_test().unwrap();
            assert!(gate.manual_transaction(|| {
                session.project=Arc::new(Default::default());
                Ok(())
            }).is_err());
            assert!(Arc::ptr_eq(&original,&session.project));
        }
        let r=gate.manual_transaction(|| {
            session.project=Arc::new(Default::default());
            Ok(())
        });
        assert!(r.is_ok());
        assert!(!Arc::ptr_eq(&original,&session.project));
        assert!(!gate.status().busy);
    }

    #[test]
    fn provider_cannot_acquire_guarded_owner_even_when_idle() {
        let gate = MotionOwnerGate::default();
        assert!(gate.ai_edit_not_integrated().is_err());
        assert!(!gate.status().busy);
        assert!(!gate.status().production_guarded_editing);
    }
}
