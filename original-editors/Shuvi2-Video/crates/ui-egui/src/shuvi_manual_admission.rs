//! V-AI13: first production FilmcraftApp command admission seam.
//! Protects the existing native menu + control command entry paths ONLY.
//! It is NOT the canonical A07 SQLite owner/approval, and it does NOT wrap
//! every direct timeline/panel/API mutation in the original FilmCraft GUI.
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use filmcraft_engine::Session;
use serde_json::Value;
use crate::FilmcraftApp;

#[derive(Clone, Default)]
pub(crate) struct ManualCommandAdmission {
    claimed: Arc<AtomicBool>,
}

pub(crate) struct ManualCommandLease {
    owner: Arc<AtomicBool>,
}

impl ManualCommandAdmission {
    pub(crate) fn is_claimed(&self) -> bool {
        self.claimed.load(Ordering::Acquire)
    }

    pub(crate) fn try_claim(&self) -> Result<ManualCommandLease, &'static str> {
        self.claimed
            .compare_exchange(false,true,Ordering::Acquire,Ordering::Relaxed)
            .map_err(|_| "SHUVI_NATIVE_OWNER_BUSY")?;
        Ok(ManualCommandLease {owner:Arc::clone(&self.claimed)})
    }
}
impl Drop for ManualCommandLease {
    fn drop(&mut self) {
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
    use serde_json::json;

    #[test]
    fn exact_real_filmcraft_manual_menu_edits_are_rejected_when_lane_claimed() {
        let mut app=FilmcraftApp::new(Session::default());
        let ctx=egui::Context::default();
        let before=app.session.revision;
        let lane=app.shuvi_manual_admission.clone();
        let lease=lane.try_claim().unwrap();
        assert!(lane.is_claimed());
        assert!(lane.try_claim().is_err());
        let command=crate::menus::invoke(
            &mut app,&ctx,"file.newSequence",
            json!({"name":"should not be created","width":320,"height":240})
        );
        assert!(command.unwrap_err().contains("SHUVI_NATIVE_OWNER_BUSY"));
        assert_eq!(app.session.revision,before);
        assert!(app.shuvi_manual_execute("command.list",json!({})).is_err());
        drop(lease);
        assert!(!lane.is_claimed());
        crate::menus::invoke(
            &mut app,&ctx,"file.newSequence",
            json!({"name":"actual manual edit","width":320,"height":240})
        ).unwrap();
        assert!(app.session.revision>before);
    }

    #[test]
    fn admission_lease_releases_on_panics_without_overwriting_original_project() {
        let app=FilmcraftApp::new(Session::default());
        let lane=app.shuvi_manual_admission.clone();
        let _=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||{
            let _lease=lane.try_claim().unwrap();
            assert!(lane.is_claimed());
            panic!("expected test-only simulated manual callback panic")
        }));
        assert!(!lane.is_claimed());
        let _lease=lane.try_claim().unwrap();
        assert!(lane.is_claimed());
        // Unlike a poisoned Session Mutex this atomic guard only fences
        // command admission; it does not claim to recover unknown edits.
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
