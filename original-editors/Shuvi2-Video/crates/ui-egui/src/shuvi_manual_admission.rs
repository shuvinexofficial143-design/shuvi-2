//! V-AI13: first production FilmcraftApp command admission seam.
//! Protects the existing native menu + control command entry paths ONLY.
//! It is NOT the canonical A07 SQLite owner/approval, and it does NOT wrap
//! every direct timeline/panel/API mutation in the original FilmCraft GUI.
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use serde_json::Value;
use crate::FilmcraftApp;

#[derive(Clone, Default)]
pub(crate) struct ManualCommandAdmission {
    claimed: Arc<AtomicBool>,
    poisoned: Arc<AtomicBool>,
}

pub(crate) struct ManualCommandLease {
    owner: Arc<AtomicBool>,
    poisoned: Arc<AtomicBool>,
}

impl ManualCommandAdmission {
    pub(crate) fn blocked_reason(&self) -> Option<&'static str> {
        if self.poisoned.load(Ordering::Acquire) {
            Some("SHUVI_NATIVE_OWNER_POISONED")
        } else if self.claimed.load(Ordering::Acquire) {
            Some("SHUVI_NATIVE_OWNER_BUSY")
        } else {
            None
        }
    }

    pub(crate) fn try_claim(&self) -> Result<ManualCommandLease, &'static str> {
        if self.poisoned.load(Ordering::Acquire) {
            return Err("SHUVI_NATIVE_OWNER_POISONED");
        }
        self.claimed
            .compare_exchange(false,true,Ordering::Acquire,Ordering::Relaxed)
            .map_err(|_| "SHUVI_NATIVE_OWNER_BUSY")?;
        if self.poisoned.load(Ordering::Acquire) {
            self.claimed.store(false,Ordering::Release);
            return Err("SHUVI_NATIVE_OWNER_POISONED");
        }
        Ok(ManualCommandLease {
            owner:Arc::clone(&self.claimed),
            poisoned:Arc::clone(&self.poisoned),
        })
    }
}
impl Drop for ManualCommandLease {
    fn drop(&mut self) {
        if std::thread::panicking() {
            // A native command may have partially mutated the editor before
            // unwinding. Never resume commands without an explicit recovery.
            self.poisoned.store(true,Ordering::Release);
        }
        self.owner.store(false,Ordering::Release);
    }
}

impl FilmcraftApp {
    /// Trusted native command-route seam used by original menu, its native
    /// menu inbox and the external-control engine command dispatcher.
    /// A model cannot call this through the AI sidebar (disabled). This
    /// admission token covers ONLY one Session::execute call.
    pub(crate) fn shuvi_manual_execute(
        &mut self, command: &str, params: Value
    ) -> Result<Value,String> {
        let _claim = self.shuvi_manual_admission.try_claim()
            .map_err(str::to_owned)?;
        self.session.execute(command,params).map_err(|e|e.to_string())
    }
}

#[cfg(test)]
mod shuvi_manual_admission_tests {
    use super::*;
    use filmcraft_engine::Session;
    use serde_json::json;

    #[test]
    fn exact_real_filmcraft_manual_menu_edits_are_rejected_when_lane_claimed() {
        let mut app=FilmcraftApp::new(Session::default());
        let ctx=egui::Context::default();
        let before=app.session.revision;
        let lane=app.shuvi_manual_admission.clone();
        let lease=lane.try_claim().unwrap();
        assert!(lane.blocked_reason().is_some());
        assert!(lane.try_claim().is_err());
        let command=crate::menus::invoke(
            &mut app,&ctx,"file.newSequence",
            json!({"name":"should not be created","width":320,"height":240})
        );
        assert!(command.unwrap_err().contains("SHUVI_NATIVE_OWNER_BUSY"));
        assert_eq!(app.session.revision,before);
        assert!(app.shuvi_manual_execute("command.list",json!({})).is_err());
        drop(lease);
        assert!(lane.blocked_reason().is_none());
        crate::menus::invoke(
            &mut app,&ctx,"file.newSequence",
            json!({"name":"actual manual edit","width":320,"height":240})
        ).unwrap();
        assert!(app.session.revision>before);
    }

    #[test]
    fn admission_poison_is_sticky_after_a_panicking_native_command() {
        let app=FilmcraftApp::new(Session::default());
        let lane=app.shuvi_manual_admission.clone();
        let _=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||{
            let _lease=lane.try_claim().unwrap();
            assert_eq!(lane.blocked_reason(),Some("SHUVI_NATIVE_OWNER_BUSY"));
            panic!("expected test-only simulated manual callback panic")
        }));
        assert_eq!(lane.blocked_reason(),Some("SHUVI_NATIVE_OWNER_POISONED"));
        assert_eq!(lane.try_claim().err(),Some("SHUVI_NATIVE_OWNER_POISONED"));
        // The narrow command gate is stuck closed. The original GUI's direct
        // panel edit paths are still not fully guarded (A13 phase one only).
    }


    #[test]
    fn concurrent_native_command_claim_blocks_actual_menu_edit_until_release() {
        use std::sync::{Arc,Barrier};
        let mut app=FilmcraftApp::new(Session::default());
        let lane=app.shuvi_manual_admission.clone();
        let barrier=Arc::new(Barrier::new(2));
        let worker_barrier=Arc::clone(&barrier);
        let worker=std::thread::spawn(move || {
            let _claim=lane.try_claim().unwrap();
            worker_barrier.wait();
            worker_barrier.wait();
        });
        barrier.wait();
        let ctx=egui::Context::default();
        let before=app.session.revision;
        let blocked=crate::menus::invoke(
            &mut app,&ctx,"file.newSequence",json!({"name":"must stay absent","width":320,"height":240})
        );
        assert!(blocked.unwrap_err().contains("SHUVI_NATIVE_OWNER_BUSY"));
        assert_eq!(app.session.revision,before);
        barrier.wait();
        worker.join().unwrap();
        crate::menus::invoke(
            &mut app,&ctx,"file.newSequence",json!({"name":"can run now","width":320,"height":240})
        ).unwrap();
        assert!(app.session.revision>before);
    }


    #[test]
    fn claimed_or_poisoned_lane_never_enqueues_synthetic_control_pointer_or_keyboard() {
        let mut app=FilmcraftApp::new(Session::default());
        let ctx=egui::Context::default();
        let lane=app.shuvi_manual_admission.clone();
        let first=lane.try_claim().unwrap();
        let before=app.synthetic.len();
        for (method,params) in [
            ("ui.key",json!({"key":"a"})),
            ("ui.type",json!({"text":"unsafe"})),
            ("ui.click",json!({"x":200,"y":200})),
            ("ui.drag",json!({"fromX":1,"fromY":1,"toX":5,"toY":5})),
            ("engine.execute",json!({"command":"file.newSequence"})),
        ] {
            let (request,_reply)=crate::control::ControlRequest::new(method,params);
            let result=crate::control::handle(&mut app,&ctx,&request);
            let crate::control::Outcome::Done(value)=result else {
                panic!("busy native owner must return immediately")
            };
            assert_eq!(value["ok"],false);
            assert_eq!(value["error"],"SHUVI_NATIVE_OWNER_BUSY");
            assert_eq!(app.synthetic.len(),before);
        }
        drop(first);
        // Simulate an original native edit that panics while claiming the
        // command lane; the poison becomes sticky even after unwinding.
        let _=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||{
            let _claim=lane.try_claim().unwrap();
            panic!("test-only native editor panic")
        }));
        let (request,_reply)=crate::control::ControlRequest::new(
            "ui.type",json!({"text":"do not queue"})
        );
        let crate::control::Outcome::Done(response)=crate::control::handle(&mut app,&ctx,&request) else {
            panic!("poisoned owner must reject input")
        };
        assert_eq!(response["error"],"SHUVI_NATIVE_OWNER_POISONED");
        assert_eq!(app.synthetic.len(),before);
    }

    #[test]
    fn menu_and_remote_command_list_use_exact_same_manual_lane() {
        let mut app=FilmcraftApp::new(Session::default());
        let ctx=egui::Context::default();
        let gate=app.shuvi_manual_admission.clone();
        let claim=gate.try_claim().unwrap();
        let (request, _reply)=crate::control::ControlRequest::new(
            "engine.commands",json!({})
        );
        let output=crate::control::handle(&mut app,&ctx,&request);
        let crate::control::Outcome::Done(payload)=output else {
            panic!("expected immediate native command-list response")
        };
        assert_eq!(payload["ok"],false);
        assert!(payload["error"].as_str().unwrap().contains("SHUVI_NATIVE_OWNER_BUSY"));
        drop(claim);
        assert!(crate::menus::invoke(&mut app,&ctx,"command.list",json!({})).is_ok());
    }
}
