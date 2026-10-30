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
    fn provider_cannot_acquire_guarded_owner_even_when_idle() {
        let gate = MotionOwnerGate::default();
        assert!(gate.ai_edit_not_integrated().is_err());
        assert!(!gate.status().busy);
        assert!(!gate.status().production_guarded_editing);
    }
}
