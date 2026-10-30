//! V-AI13: first production FilmcraftApp command admission seam.
//! Protects the existing native menu + control command entry paths ONLY.
//! It is NOT the canonical A07 SQLite owner/approval, and it does NOT wrap
//! every direct timeline/panel/API mutation in the original FilmCraft GUI.
use std::sync::{Arc,Mutex};
use std::thread::{self,ThreadId};
use serde_json::Value;
use crate::FilmcraftApp;

/// Per-running-native-app trusted A07 task identity. This is a native
/// document/session identity fence, never an approval token or provider key.
/// The random state is created exclusively by FilmcraftApp::new and is not
/// supplied by any model, script, JSON request or external renderer.
#[derive(Clone)]
pub(crate) struct NativeA07Identity {
    seed: std::collections::hash_map::RandomState,
    instance: u64,
}

impl Default for NativeA07Identity {
    fn default()->Self {
        static NEXT:std::sync::atomic::AtomicU64=std::sync::atomic::AtomicU64::new(1);
        Self {
            seed:std::collections::hash_map::RandomState::new(),
            instance:NEXT.fetch_add(1,std::sync::atomic::Ordering::Relaxed),
        }
    }
}

impl NativeA07Identity {
    fn current(&self,session:&filmcraft_engine::Session)->(String,String) {
        use std::hash::BuildHasher;
        // The project ID is local to this editor lifetime and rotates on
        // native document open/reopen and SaveAs. No original file path leaks.
        let project=self.seed.hash_one((
            self.instance,session.document_epoch,session.path.as_deref()
        ));
        let bound_session=self.seed.hash_one((
            self.instance,session.document_epoch,session.path.as_deref(),
            session.state.active_sequence.map(|id|id.0)
        ));
        (format!("p-{project:016x}"),format!("s-{:016x}-{bound_session:016x}",self.instance))
    }
}

#[derive(Default)]
struct OwnerState {
    thread: Option<ThreadId>,
    depth: usize,
    poisoned: bool,
    /// Reserved ONLY for trusted native A07 Rust integration. Same-thread
    /// nested manual menus are forbidden while an A07 mutation is active.
    ai_transaction: bool,
}

#[derive(Clone,Default)]
pub(crate) struct ManualCommandAdmission { shared: Arc<Mutex<OwnerState>> }

pub(crate) struct ManualCommandLease {
    shared: Arc<Mutex<OwnerState>>,
    thread: ThreadId,
    ai_transaction: bool,
}

impl ManualCommandAdmission {
    /// Stop all subsequent covered edits after a caught native panel panic.
    /// Catching a panic must not make an uncertain edit safe to replay.
    pub(crate) fn poison(&self) {
        if let Ok(mut owner)=self.shared.lock() {
            owner.poisoned=true;
        }
    }
    pub(crate) fn blocked_reason(&self)->Option<&'static str>{
        let Ok(owner)=self.shared.lock() else {
            return Some("SHUVI_NATIVE_OWNER_POISONED");
        };
        if owner.poisoned {
            Some("SHUVI_NATIVE_OWNER_POISONED")
        } else if owner.ai_transaction {
            Some("SHUVI_NATIVE_AI_TRANSACTION_ACTIVE")
        } else if owner.thread.is_some_and(|id|id!=thread::current().id()) {
            Some("SHUVI_NATIVE_OWNER_BUSY")
        } else {None}
    }
    pub(crate) fn try_claim(&self)->Result<ManualCommandLease,&'static str>{
        let mut owner=self.shared.lock().map_err(|_|"SHUVI_NATIVE_OWNER_POISONED")?;
        if owner.poisoned {return Err("SHUVI_NATIVE_OWNER_POISONED");}
        // The same-thread recursion allowed for original manual UI passes
        // must NEVER bypass an active native AI mutation/owner confirmation.
        if owner.ai_transaction {
            return Err("SHUVI_NATIVE_AI_TRANSACTION_ACTIVE");
        }
        let current=thread::current().id();
        if owner.thread.is_some_and(|id|id!=current) {
            return Err("SHUVI_NATIVE_OWNER_BUSY");
        }
        let depth=owner.depth.checked_add(1)
            .ok_or("SHUVI_NATIVE_OWNER_DEPTH_EXCEEDED")?;
        owner.thread=Some(current);
        owner.depth=depth;
        Ok(ManualCommandLease{
            shared:Arc::clone(&self.shared),thread:current,ai_transaction:false
        })
    }

    /// Exclusive A07 transaction admission is NOT reentrant, even for
    /// the UI thread. It cannot be upgraded from a live normal manual pass;
    /// a trusted native host must dispatch after the UI pass releases.
    /// No provider, IPC/JSON or model can access this method.
    fn try_claim_ai(&self)->Result<ManualCommandLease,&'static str> {
        let mut owner=self.shared.lock().map_err(|_|"SHUVI_NATIVE_OWNER_POISONED")?;
        if owner.poisoned {return Err("SHUVI_NATIVE_OWNER_POISONED");}
        if owner.thread.is_some() || owner.depth != 0 || owner.ai_transaction {
            return Err("SHUVI_NATIVE_OWNER_BUSY");
        }
        let current=thread::current().id();
        owner.thread=Some(current);
        owner.depth=1;
        owner.ai_transaction=true;
        Ok(ManualCommandLease{
            shared:Arc::clone(&self.shared),thread:current,ai_transaction:true
        })
    }
}
impl Drop for ManualCommandLease {
    fn drop(&mut self){
        let Ok(mut owner)=self.shared.lock() else {return};
        if thread::panicking() || owner.thread!=Some(self.thread)
            || thread::current().id()!=self.thread || owner.depth==0
            || owner.ai_transaction != self.ai_transaction {
            owner.poisoned=true;
        }
        if owner.depth>0 {owner.depth-=1;}
        if owner.depth==0 {
            owner.thread=None;
            owner.ai_transaction=false;
        }
    }
}

impl FilmcraftApp {
    /// Trusted host-derived A07 project/session identity from the ORIGINAL
    /// editor's current document, never from model or front-end input.
    /// Only valid while the same native owner is held; the canonical ledger
    /// separately checks native project SHA and durable task plan binding.
    pub fn shuvi_trusted_a07_identity(&self)->(String,String) {
        self.shuvi_a07_native_identity.current(&self.session)
    }

    /// Canonical A07 integration entry: host-selected identity is computed
    /// INSIDE the already exclusive owner transaction from the current
    /// original FilmCraft Session. Unlike caller-provided identity strings,
    /// this pair cannot be substituted by an AI plan or renderer JSON.
    pub fn with_shuvi_trusted_a07_context<R>(
        &mut self,
        action:impl FnOnce(&mut filmcraft_engine::Session,String,String)->Result<R,String>,
    )->Result<R,String> {
        let identity=self.shuvi_a07_native_identity.clone();
        self.with_shuvi_trusted_ai_transaction(move |session|{
            let (project_id,session_id)=identity.current(session);
            action(session,project_id,session_id)
        })
    }

    /// A real UI-side admission entry point for the isolated canonical A07
    /// adapter. Claims an exclusive native owner and borrows this EXACT
    /// original editor Session for the duration of the trusted Rust callback.
    /// Unlike a normal UI lease, it REFUSES to nest into a manual pass,
    /// and refuses ANY manual edit or raw input on the same/other thread.
    ///
    /// No model/JSON/remote control exposes this method. Production A07
    /// GuardedHost, SQLite receipts and owner consent MUST still be checked
    /// by the trusted callback; simply borrowing a Session never grants edit
    /// approval. GUI AI editing remains disabled until full integration.
    pub fn with_shuvi_trusted_ai_transaction<R>(
        &mut self,
        action:impl FnOnce(&mut filmcraft_engine::Session)->Result<R,String>,
    )->Result<R,String> {
        let _owner=self.shuvi_manual_admission.try_claim_ai()
            .map_err(str::to_owned)?;
        // A provider failure, SQLite error, or refused approval must not
        // silently leave a half-edited original FilmCraft project editable.
        // Compare the ORIGINAL mutable native project, not a caller-provided
        // revision/version; SHA catches edits that forget to bump revision.
        let before_sha=filmcraft_engine::shuvi_ai_readonly::a07_native_project_sha256(
            &self.session);
        let before_revision=self.session.revision;
        let before_epoch=self.session.document_epoch;
        let before_sequence=self.session.state.active_sequence;
        let before_path=self.session.path.clone();
        let result=action(&mut self.session);
        let changed=before_sha != filmcraft_engine::shuvi_ai_readonly::a07_native_project_sha256(
                &self.session)
            || before_revision != self.session.revision
            || before_epoch != self.session.document_epoch
            || before_sequence != self.session.state.active_sequence
            || before_path != self.session.path;
        if changed {
            // Even a successful, verified native edit invalidates all
            // original GUI read-only previews from the previous revision.
            self.shuvi_ai.readback=None;
            self.shuvi_ai.preview_plan=None;
            self.shuvi_ai.preview_feedback=None;
        }
        if changed && result.is_err() {
            // The owner callback must return success ONLY after the pinned
            // A07 ledger has durably verified its object receipt. A native
            // project changed before an error may have an uncertain outcome.
            // Never re-open manual editing, save or replay automatically.
            self.shuvi_manual_admission.poison();
            self.ui.status="SHUVI_NATIVE_AI_OUTCOME_UNCERTAIN".into();
            return Err("SHUVI_NATIVE_AI_OUTCOME_UNCERTAIN".into());
        }
        result
    }

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
    fn caught_panel_panic_poison_prevents_new_native_menu_commands() {
        let mut app=FilmcraftApp::new(Session::default());
        let owner=app.shuvi_manual_admission.clone();
        let outer=owner.try_claim().unwrap();
        // Simulate FilmcraftApp::ui_inner catching a panel panic while its
        // outer UI pass lease stays live, so Drop alone would not poison it.
        let caught=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||{
            panic!("test-only caught panel panic")
        }));
        assert!(caught.is_err());
        owner.poison();
        assert_eq!(owner.blocked_reason(),Some("SHUVI_NATIVE_OWNER_POISONED"));
        drop(outer);
        let ctx=egui::Context::default();
        let revision=app.session.revision;
        let error=crate::menus::invoke(&mut app,&ctx,"file.newSequence",
            json!({"name":"must not be created"})).unwrap_err();
        assert!(error.contains("POISONED"));
        assert_eq!(app.session.revision,revision);
    }


    #[test]
    fn exclusive_ai_owner_blocks_same_thread_manual_menu_and_control_input() {
        let mut app=FilmcraftApp::new(Session::default());
        let ctx=egui::Context::default();
        let before=app.session.revision;
        let gate=app.shuvi_manual_admission.clone();
        let claim=gate.try_claim_ai().unwrap();
        assert_eq!(gate.blocked_reason(),Some("SHUVI_NATIVE_AI_TRANSACTION_ACTIVE"));
        assert_eq!(gate.try_claim().err(),Some("SHUVI_NATIVE_AI_TRANSACTION_ACTIVE"));
        assert_eq!(gate.try_claim_ai().err(),Some("SHUVI_NATIVE_OWNER_BUSY"));
        let blocked=crate::menus::invoke(&mut app,&ctx,"file.newSequence",
            json!({"name":"AI must block this manual edit"})).unwrap_err();
        assert!(blocked.contains("SHUVI_NATIVE_AI_TRANSACTION_ACTIVE"));
        for method in ["engine.execute","ui.key","ui.drag","ui.click","ui.type"] {
            let (request,_reply)=crate::control::ControlRequest::new(method,json!({}));
            let crate::control::Outcome::Done(result)=
                crate::control::handle(&mut app,&ctx,&request) else {
                panic!("exclusive AI owner must reject input immediately");
            };
            assert_eq!(result["error"],"SHUVI_NATIVE_AI_TRANSACTION_ACTIVE");
        }
        assert_eq!(app.session.revision,before);
        assert!(app.synthetic.is_empty());
        drop(claim);
        assert_eq!(gate.blocked_reason(),None);
        crate::menus::invoke(&mut app,&ctx,"file.newSequence",
            json!({"name":"allowed after exclusive AI owner exits",
                "width":320,"height":240})).unwrap();
        assert!(app.session.revision>before);
    }

    #[test]
    fn real_ai_session_borrow_is_blocked_inside_original_ui_manual_pass() {
        let mut app=FilmcraftApp::new(Session::default());
        let gate=app.shuvi_manual_admission.clone();
        let manual=gate.try_claim().unwrap();
        let before=app.session.revision;
        let error=app.with_shuvi_trusted_ai_transaction(|session|{
            session.execute("file.openDemoProject",json!({}))
                .map_err(|e|e.to_string())?;
            Ok(())
        }).unwrap_err();
        assert_eq!(error,"SHUVI_NATIVE_OWNER_BUSY");
        assert_eq!(app.session.revision,before);
        drop(manual);
        // A read-only trusted native A07 snapshot closure is permitted once
        // the original UI pass fully releases its manual lease.
        let session_revision=app.with_shuvi_trusted_ai_transaction(
            |session| Ok(session.revision)
        ).unwrap();
        assert_eq!(session_revision,before);
    }

    #[test]
    fn panic_during_trusted_ai_session_borrow_poison_blocks_manual_replay() {
        let mut app=FilmcraftApp::new(Session::default());
        let result=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||{
            let _=app.with_shuvi_trusted_ai_transaction(|_|->Result<(),String>{
                panic!("test-only A07 native owner panic")
            });
        }));
        assert!(result.is_err());
        assert_eq!(app.shuvi_manual_admission.blocked_reason(),
            Some("SHUVI_NATIVE_OWNER_POISONED"));
        assert!(app.shuvi_manual_execute("file.newSequence",
            json!({"name":"must not replay"})).unwrap_err().contains("POISONED"));
    }

    #[test]
    fn trusted_ai_error_after_real_native_mutation_poison_blocks_manual_edit_and_clears_preview() {
        let mut app=FilmcraftApp::new(Session::default());
        let mut preview=filmcraft_engine::shuvi_ai_readonly::snapshot(&mut app.session).unwrap();
        preview.dirty=false;
        app.shuvi_ai.readback=Some(preview);
        app.shuvi_ai.preview_feedback=Some("stale prior preview".into());
        let before=app.session.revision;
        let failed=app.with_shuvi_trusted_ai_transaction(|native| -> Result<(),String> {
            native.execute("file.newSequence",
                json!({"name":"simulated partially completed native A07",
                    "width":320,"height":240}))
                .map_err(|e|e.to_string())?;
            Err("injected SQLite receipt failure AFTER native mutation".into())
        });
        assert_eq!(failed.unwrap_err(),"SHUVI_NATIVE_AI_OUTCOME_UNCERTAIN");
        assert!(app.session.revision>before);
        assert_eq!(app.shuvi_manual_admission.blocked_reason(),
            Some("SHUVI_NATIVE_OWNER_POISONED"));
        assert_eq!(app.ui.status,"SHUVI_NATIVE_AI_OUTCOME_UNCERTAIN");
        assert!(app.shuvi_ai.readback.is_none());
        assert!(app.shuvi_ai.preview_feedback.is_none());
        assert!(app.shuvi_manual_execute("file.newSequence",json!({"name":"blocked"}))
            .unwrap_err().contains("POISONED"));
    }

    #[test]
    fn trusted_ai_error_before_native_mutation_returns_original_error_and_keeps_manual_editor_usable() {
        let mut app=FilmcraftApp::new(Session::default());
        let before=app.session.revision;
        let result=app.with_shuvi_trusted_ai_transaction(|_|->Result<(),String>{
            Err("A07_CONSENT_DENIED_BEFORE_EDIT".into())
        });
        assert_eq!(result.unwrap_err(),"A07_CONSENT_DENIED_BEFORE_EDIT");
        assert_eq!(app.shuvi_manual_admission.blocked_reason(),None);
        assert_eq!(app.session.revision,before);
        assert!(app.shuvi_manual_execute("file.newSequence",
            json!({"name":"normal manual edit after owner denial",
                "width":320,"height":240})).is_ok());
    }

    #[test]
    fn trusted_ai_success_after_native_edit_invalidates_old_sidebar_readback() {
        let mut app=FilmcraftApp::new(Session::default());
        app.shuvi_ai.refresh(&mut app.session);
        assert!(app.shuvi_ai.readback.is_some());
        let before=app.session.revision;
        app.with_shuvi_trusted_ai_transaction(|native| {
            native.execute("file.newSequence",
                json!({"name":"trusted native edit test",
                    "width":320,"height":240}))
                .map_err(|e|e.to_string())?;
            Ok(())
        }).unwrap();
        assert!(app.session.revision>before);
        assert!(app.shuvi_ai.readback.is_none());
        assert_eq!(app.shuvi_manual_admission.blocked_reason(),None);
    }

    #[test]
    fn original_gui_native_identity_stable_for_real_timeline_split_not_for_sequence_switch(){
        use filmcraft_time::{Tick,TICKS_PER_SECOND};
        let mut app=FilmcraftApp::new(Session::default());
        app.session.execute("file.openDemoProject",json!({})).unwrap();
        let identity=app.shuvi_trusted_a07_identity();
        let before_sha=filmcraft_engine::shuvi_ai_readonly::a07_native_project_sha256(&app.session);
        let active=app.session.active_sequence().unwrap();
        let tick=app.session.sequence_rate().snap_nearest(Tick(2*TICKS_PER_SECOND));
        let clip=active.video_tracks[0].items.iter()
            .find(|c|c.start.0<tick.0&&tick.0<c.end().0).unwrap().id;
        let created=app.session.edit_sequence("A20 native timeline split",|seq,ctx,_|{
            Ok(filmcraft_edit::razor_items(seq,&[clip],tick,ctx))
        }).unwrap();
        assert_eq!(created.len(),1);
        // Native project bytes differ but document+session identity persists.
        assert_ne!(filmcraft_engine::shuvi_ai_readonly::a07_native_project_sha256(&app.session),before_sha);
        assert_eq!(app.shuvi_trusted_a07_identity(),identity);
        // A real original GUI context change must invalidate older A07 scope.
        app.session.execute("file.newSequence",json!({"name":"another sequence",
            "width":320,"height":240})).unwrap();
        assert_ne!(app.shuvi_trusted_a07_identity(),identity);
    }

    #[test]
    fn reopened_original_gui_app_never_inherits_previous_a07_owner_identity(){
        let first=FilmcraftApp::new(Session::default());
        let second=FilmcraftApp::new(Session::default());
        assert_ne!(first.shuvi_trusted_a07_identity(),
            second.shuvi_trusted_a07_identity());
        let (project,session)=first.shuvi_trusted_a07_identity();
        assert!(project.starts_with("p-")&&session.starts_with("s-"));
        assert!(project.len()<=1024&&session.len()<=128);
        assert!(!project.contains('\\'));
    }

    #[test]
    fn native_a07_context_is_computed_inside_exclusive_owner_not_from_json(){
        let mut app=FilmcraftApp::new(Session::default());
        app.session.execute("file.openDemoProject",json!({})).unwrap();
        let expected=app.shuvi_trusted_a07_identity();
        let bogus=json!({"projectId":"provider-chosen-project",
            "sessionId":"provider-chosen-session"});
        let seen=app.with_shuvi_trusted_a07_context(|session,project,session_id|{
            assert!(session.state.active_sequence.is_some());
            assert_ne!(project,bogus["projectId"]);
            assert_ne!(session_id,bogus["sessionId"]);
            Ok((project,session_id))
        }).unwrap();
        assert_eq!(seen,expected);
        // The native owner cannot be upgraded from inside a manual UI pass.
        let guard=app.shuvi_manual_admission.clone();
        let _manual=guard.try_claim().unwrap();
        let failed=app.with_shuvi_trusted_a07_context(|_,_,_|Ok(()));
        assert_eq!(failed.unwrap_err(),"SHUVI_NATIVE_OWNER_BUSY");
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
