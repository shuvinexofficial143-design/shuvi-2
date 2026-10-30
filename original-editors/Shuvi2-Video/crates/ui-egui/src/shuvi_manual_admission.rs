//! V-AI13: first production FilmcraftApp command admission seam.
//! Protects the existing native menu + control command entry paths ONLY.
//! It is NOT the canonical A07 SQLite owner/approval, and it does NOT wrap
//! every direct timeline/panel/API mutation in the original FilmCraft GUI.
use std::sync::{Arc,Mutex};
use std::thread::{self,ThreadId};
use serde_json::Value;
use crate::FilmcraftApp;

#[derive(Default)]
struct OwnerState { thread: Option<ThreadId>, depth: usize, poisoned: bool }

#[derive(Clone,Default)]
pub(crate) struct ManualCommandAdmission { shared: Arc<Mutex<OwnerState>> }

pub(crate) struct ManualCommandLease { shared: Arc<Mutex<OwnerState>>, thread: ThreadId }

impl ManualCommandAdmission {
    pub(crate) fn blocked_reason(&self)->Option<&'static str>{
        let Ok(owner)=self.shared.lock() else {
            return Some("SHUVI_NATIVE_OWNER_POISONED");
        };
        if owner.poisoned {
            Some("SHUVI_NATIVE_OWNER_POISONED")
        } else if owner.thread.is_some_and(|id|id!=thread::current().id()) {
            Some("SHUVI_NATIVE_OWNER_BUSY")
        } else {None}
    }
    pub(crate) fn try_claim(&self)->Result<ManualCommandLease,&'static str>{
        let mut owner=self.shared.lock().map_err(|_|"SHUVI_NATIVE_OWNER_POISONED")?;
        if owner.poisoned {return Err("SHUVI_NATIVE_OWNER_POISONED");}
        let current=thread::current().id();
        if owner.thread.is_some_and(|id|id!=current) {
            return Err("SHUVI_NATIVE_OWNER_BUSY");
        }
        let depth=owner.depth.checked_add(1)
            .ok_or("SHUVI_NATIVE_OWNER_DEPTH_EXCEEDED")?;
        owner.thread=Some(current);
        owner.depth=depth;
        Ok(ManualCommandLease{shared:Arc::clone(&self.shared),thread:current})
    }
}
impl Drop for ManualCommandLease {
    fn drop(&mut self){
        let Ok(mut owner)=self.shared.lock() else {return};
        if thread::panicking() || owner.thread!=Some(self.thread)
            || thread::current().id()!=self.thread || owner.depth==0 {
            owner.poisoned=true;
        }
        if owner.depth>0 {owner.depth-=1;}
        if owner.depth==0 {owner.thread=None;}
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
    use std::sync::{Arc,Barrier};

    #[test]
    fn ui_thread_reenters_native_menu_and_engine_without_deadlock() {
        let mut app=FilmcraftApp::new(Session::default());
        let ctx=egui::Context::default();
        let previous=app.session.revision;
        let gate=app.shuvi_manual_admission.clone();
        let pass=gate.try_claim().unwrap();
        let nested=gate.try_claim().unwrap();
        assert_eq!(gate.blocked_reason(),None);
        crate::menus::invoke(&mut app,&ctx,"file.newSequence",
            json!({"name":"real nested UI manual action","width":320,"height":240})).unwrap();
        assert!(app.session.revision>previous);
        drop(nested);drop(pass);
        assert_eq!(gate.blocked_reason(),None);
    }

    #[test]
    fn worker_owns_original_native_lane_and_blocks_real_menu_control_and_logic_pass() {
        let mut app=FilmcraftApp::new(Session::default());
        let shared=app.shuvi_manual_admission.clone();
        let barrier=Arc::new(Barrier::new(2));
        let wait=Arc::clone(&barrier);
        let worker=std::thread::spawn(move||{
            let _owner=shared.try_claim().unwrap();
            wait.wait();wait.wait();
        });
        barrier.wait();
        let initial=app.session.revision;
        let ctx=egui::Context::default();
        let blocked=crate::menus::invoke(&mut app,&ctx,"file.newSequence",
            json!({"name":"must not exist","width":320,"height":240}));
        assert!(blocked.unwrap_err().contains("SHUVI_NATIVE_OWNER_BUSY"));
        for method in ["ui.click","ui.key","ui.drag","ui.type","engine.commands"] {
            let (request,_receiver)=crate::control::ControlRequest::new(method,json!({}));
            let crate::control::Outcome::Done(result)=crate::control::handle(&mut app,&ctx,&request) else {
                panic!("busy command must reject synchronously")
            };
            assert_eq!(result["error"],"SHUVI_NATIVE_OWNER_BUSY");
        }
        app.logic_inner(&ctx);
        assert_eq!(app.session.revision,initial);
        assert!(app.synthetic.is_empty());
        barrier.wait();worker.join().unwrap();
        crate::menus::invoke(&mut app,&ctx,"file.newSequence",
            json!({"name":"allowed after release","width":320,"height":240})).unwrap();
        assert!(app.session.revision>initial);
    }

    #[test]
    fn nested_native_panic_stays_poisoned_and_prevents_replay() {
        let mut app=FilmcraftApp::new(Session::default());
        let shared=app.shuvi_manual_admission.clone();
        let _=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||{
            let _pass=shared.try_claim().unwrap();
            let _nested=shared.try_claim().unwrap();
            panic!("injected test-only native edit failure")
        }));
        assert_eq!(shared.blocked_reason(),Some("SHUVI_NATIVE_OWNER_POISONED"));
        let ctx=egui::Context::default();
        assert!(crate::menus::invoke(&mut app,&ctx,"file.newSequence",
            json!({"name":"must not edit"})).unwrap_err().contains("POISONED"));
        assert!(shared.try_claim().is_err());
    }

    #[test]
    fn real_remote_engine_registry_reenters_on_same_ui_thread() {
        let mut app=FilmcraftApp::new(Session::default());
        let _owner=app.shuvi_manual_admission.try_claim().unwrap();
        let (request,_reply)=crate::control::ControlRequest::new(
            "engine.commands",json!({})
        );
        let crate::control::Outcome::Done(result)=crate::control::handle(
            &mut app,&egui::Context::default(),&request
        ) else {panic!("expected native registry result")};
        assert_eq!(result["ok"],true);
    }
}
