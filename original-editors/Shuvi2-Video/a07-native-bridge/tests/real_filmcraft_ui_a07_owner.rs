//! V-AI17 integration regression against the EXACT original production
//! FilmcraftApp, one real Session, a canonical A07 SQLite Ledger and the
//! pinned NativeOwner. Consent here is a TEST DOUBLE, never a Windows click.
use filmcraft_engine::{Session,shuvi_ai_readonly};
use filmcraft_ui_egui::{FilmcraftApp,menus};
use serde_json::{json,Value};
use shuvi_ai_provider::{
    guard::{GuardError,NativeOwner,OwnerConsent,Scope,Snapshot,Version},
    host::{GuardedHost,OwnerConsentRequest},
    plan::{ReserveWire,independently_hash},
    ipc::GuardedWireRequest,
    transactional::TransactionalLedger,
};
use shuvi_video_a07_native_bridge::VideoOwner;
use std::{fs,path::PathBuf,sync::atomic::{AtomicU64,Ordering},
    time::{SystemTime,UNIX_EPOCH}};
static SEQ:AtomicU64=AtomicU64::new(1);

struct Tmp(PathBuf);
impl Tmp {
    fn new()->Self {
        let t=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        for _ in 0..32 {
            let n=SEQ.fetch_add(1,Ordering::Relaxed);
            let dir=std::env::temp_dir().join(format!("a17-ui-native-{}-{t}-{n}",
                std::process::id()));
            match fs::create_dir(&dir) {
                Ok(())=>return Self(dir),
                Err(e) if e.kind()==std::io::ErrorKind::AlreadyExists=>continue,
                Err(e)=>panic!("failed to create private test directory: {e}"),
            }
        }
        panic!("failed to allocate unique native UI test directory")
    }
    fn db(&self)->TransactionalLedger {
        TransactionalLedger::open(&self.0.join("real-ui.sqlite3")).unwrap()
    }
}
impl Drop for Tmp {
    fn drop(&mut self){let _=fs::remove_dir_all(&self.0);}
}
fn app()->FilmcraftApp {
    let mut native=Session::default();
    native.execute("file.openDemoProject",json!({})).unwrap();
    FilmcraftApp::new(native)
}
fn target_clip(app:&mut FilmcraftApp)->u64{
    let view=shuvi_ai_readonly::snapshot(&mut app.session).unwrap();
    let at=2*filmcraft_time::TICKS_PER_SECOND;
    view.sequence.as_ref().unwrap()["video"][0]["items"].as_array().unwrap()
        .iter().find(|c|c["start"].as_i64().unwrap_or(-1)<at
            && at<c["end"].as_i64().unwrap_or(-1))
        .and_then(|c|c["clip"].as_u64()).unwrap()
}
fn view(app:&mut FilmcraftApp)->Snapshot {
    app.with_shuvi_trusted_a07_context(|session,project_id,session_id|{
        let mut owner=VideoOwner::new(session,project_id,session_id)?;
        owner.snapshot()
    }).unwrap()
}
fn planned(snapshot:Snapshot,clip:u64,id:&str)
    ->(Value,ReserveWire,OwnerConsentRequest)
{
    let Version::VideoSha256(ref version)=snapshot.version else {panic!("wrong editor")};
    let native=json!({"engine":"video","projectId":snapshot.project_id,
        "sessionId":snapshot.session_id,"version":version});
    let plan=json!({"taskId":id,"instruction":"Split the exact original FilmCraft UI clip",
        "snapshot":native,
        "actions":[{"type":"video.split","clipId":clip,"seconds":2.0}]});
    let hash=independently_hash(&plan).unwrap();
    let reservation=ReserveWire{
        task_id:id.into(),plan_hash:hash.clone(),
        project:native,plan:plan.clone(),
    };
    let consent=OwnerConsentRequest{task_id:id.into(),plan_hash:hash};
    (plan,reservation,consent)
}
fn wire(plan:&Value)->GuardedWireRequest{
    serde_json::from_value(json!({
        "taskId":plan["taskId"],"stepIndex":0,
        "idempotencyKey":"f".repeat(64),
        "expectedSnapshot":plan["snapshot"],"action":plan["actions"][0]
    })).unwrap()
}
struct TestOnlyOwner{clicks:usize}
impl OwnerConsent for TestOnlyOwner {
    fn grant(&mut self,scope:&Scope)->bool{
        self.clicks+=1;
        assert_eq!(scope.actions.len(),1);
        assert_eq!(scope.snapshot.editor,shuvi_ai_provider::guard::Editor::Video);
        true // TEST FIXTURE only; production must show real OS approval.
    }
}

#[test]
fn real_filmcraftapp_a07_transaction_has_same_native_owner_sqlite_receipt_and_manual_followup(){
    let tmp=Tmp::new();
    let mut app=app();
    let clip=target_clip(&mut app);
    let state=view(&mut app);
    let before=shuvi_ai_readonly::snapshot(&mut app.session).unwrap();
    app.shuvi_ai.refresh(&mut app.session);
    assert!(app.shuvi_ai.readback.is_some());
    let (plan,reserve,consent)=planned(state.clone(),clip,"a17-real-ui-a07-01");
    let mut db=tmp.db();
    let mut clicks=TestOnlyOwner{clicks:0};
    let result=app.with_shuvi_trusted_a07_context(|session,project_id,session_id|{
        let mut owner=VideoOwner::new(session,project_id,session_id)?;
        let mut guarded=GuardedHost{ledger:&mut db,owner:&mut owner};
        guarded.reserve(&reserve).map_err(|e|e.to_string())?;
        assert_eq!(guarded.request_consent(&consent,&mut clicks)
            .map_err(|e|e.to_string())?["granted"],true);
        let result=guarded.execute(wire(&plan)).map_err(|e|e.to_string())?;
        assert_eq!(result["nativeVerified"],true);
        assert_eq!(result["guarded"],true);
        Ok(result)
    }).unwrap();
    assert_eq!(clicks.clicks,1);
    // The same original UI sidebar MUST discard stale readback/preflight.
    assert!(app.shuvi_ai.readback.is_none());
    assert!(app.shuvi_ai.preview_plan.is_none());
    assert_eq!(result["objectProofSha256"].as_str().unwrap().len(),64);
    let after=shuvi_ai_readonly::snapshot(&mut app.session).unwrap();
    let b=before.sequence.as_ref().unwrap()["video"][0]["items"].as_array().unwrap().len();
    let a=after.sequence.as_ref().unwrap()["video"][0]["items"].as_array().unwrap().len();
    assert_eq!(a,b+1);
    assert_ne!(state,view(&mut app));
    assert_eq!(db.recovery_bound(&reserve.task_id,&reserve.plan_hash).unwrap(),
        vec!["verified"]);
    // After A07 releases the same REAL production app owner, the ORIGINAL
    // UI manual menu works on the SAME Session and increments its revision.
    let revision=app.session.revision;
    menus::invoke(&mut app,&egui::Context::default(),"file.newSequence",
        json!({"name":"manual after verified native AI","width":320,"height":240}))
        .unwrap();
    assert!(app.session.revision>revision);
    drop(db);
    assert_eq!(tmp.db().recovery_bound(&reserve.task_id,&reserve.plan_hash).unwrap(),
        vec!["verified"]);
}
#[test]
fn original_manual_ui_edit_between_a07_reserve_and_consent_stales_sqlite_before_prompt(){
    let tmp=Tmp::new();
    let mut app=app();
    let state=view(&mut app);
    let clip=target_clip(&mut app);
    let (_,reserve,consent)=planned(state,clip,"a17-real-ui-a07-02");
    let mut db=tmp.db();
    app.with_shuvi_trusted_a07_context(|session,project_id,session_id|{
        let mut owner=VideoOwner::new(session,project_id,session_id)?;
        GuardedHost{ledger:&mut db,owner:&mut owner}
            .reserve(&reserve).map_err(|e|e.to_string())?;
        Ok(())
    }).unwrap();
    let original_rev=app.session.revision;
    // Real production GUI manual command, not a simulated engine call.
    menus::invoke(&mut app,&egui::Context::default(),"file.newSequence",
        json!({"name":"manual makes A07 scope stale","width":320,"height":240}))
        .unwrap();
    assert!(app.session.revision>original_rev);
    let after_manual=view(&mut app);
    let mut operator=TestOnlyOwner{clicks:0};
    let failed=app.with_shuvi_trusted_a07_context(|session,project_id,session_id|{
        let mut owner=VideoOwner::new(session,project_id,session_id)?;
        GuardedHost{ledger:&mut db,owner:&mut owner}
            .request_consent(&consent,&mut operator).map_err(|e|e.to_string())
    }).unwrap_err();
    assert_eq!(failed,GuardError::StaleProject.to_string());
    assert_eq!(operator.clicks,0);
    assert_eq!(view(&mut app),after_manual);
    assert_eq!(db.recovery_bound(&reserve.task_id,&reserve.plan_hash).unwrap(),
        vec!["not_started"]);
    // A denied, pre-mutation canonical consent must not poison the actual
    // original FilmCraft editor. The owner was released without mutation.
    let revision=app.session.revision;
    menus::invoke(&mut app,&egui::Context::default(),"file.newSequence",
        json!({"name":"manual still works after A07 stale denial",
            "width":320,"height":240})).unwrap();
    assert!(app.session.revision>revision);
}

#[test]
fn verified_native_sqlite_edit_but_lost_gui_ack_never_replays_and_poison_is_visible() {
    let temp=Tmp::new();
    let mut app=app();
    let clip=target_clip(&mut app);
    let snapshot=view(&mut app);
    let (plan,reserve,consent)=planned(snapshot,clip,"a18-lost-gui-ack-01");
    let before=shuvi_ai_readonly::snapshot(&mut app.session).unwrap();
    let mut ledger=temp.db();
    let mut clicks=TestOnlyOwner{clicks:0};
    // All native logic and canonical SQLite receipts are REAL; only the
    // explicit owner Yes click is a unit-test double, never a live modal.
    let outcome=app.with_shuvi_trusted_a07_context(|session,project_id,session_id|->Result<(),String>{
        let mut owner=VideoOwner::new(session,project_id,session_id)?;
        let mut host=GuardedHost{ledger:&mut ledger,owner:&mut owner};
        host.reserve(&reserve).map_err(|e|e.to_string())?;
        host.request_consent(&consent,&mut clicks).map_err(|e|e.to_string())?;
        let receipt=host.execute(wire(&plan)).map_err(|e|e.to_string())?;
        assert_eq!(receipt["nativeVerified"],true);
        // An acknowledged, persisted native edit actually happened; inject
        // only a lost UI acknowledgement after the durable receipt.
        Err("injected lost frontend acknowledgement AFTER verified A07 receipt".into())
    });
    assert_eq!(outcome.unwrap_err(),"SHUVI_NATIVE_AI_OUTCOME_UNCERTAIN");
    assert_eq!(clicks.clicks,1);
    let after=shuvi_ai_readonly::snapshot(&mut app.session).unwrap();
    let original_count=before.sequence.as_ref().unwrap()["video"][0]["items"].as_array().unwrap().len();
    let edited_count=after.sequence.as_ref().unwrap()["video"][0]["items"].as_array().unwrap().len();
    assert_eq!(edited_count,original_count+1);
    assert_eq!(ledger.recovery_bound(&reserve.task_id,&reserve.plan_hash).unwrap(),
        vec!["verified"]);
    // Editor never claims success and never permits user/manual auto-retry.
    let command=menus::invoke(&mut app,&egui::Context::default(),"file.newSequence",
        json!({"name":"must not retry after lost acknowledgement"}));
    assert!(command.unwrap_err().contains("SHUVI_NATIVE_OWNER_POISONED"));
    assert_eq!(app.ui.status,"SHUVI_NATIVE_AI_OUTCOME_UNCERTAIN");
    assert!(app.shuvi_ai.readback.is_none());
    drop(ledger);
    assert_eq!(temp.db().recovery_bound(&reserve.task_id,&reserve.plan_hash).unwrap(),
        vec!["verified"]);
}

#[test]
fn original_gui_save_as_rotates_a07_scope_and_denies_old_approved_ui_prompt() {
    let dir=Tmp::new();
    let mut app=app();
    let native_id=target_clip(&mut app);
    let original=view(&mut app);
    let (_,reserve,consent)=planned(original.clone(),native_id,"a20-saveas-context-01");
    let mut db=dir.db();
    app.with_shuvi_trusted_a07_context(|session,project_id,session_id|{
        let mut owner=VideoOwner::new(session,project_id,session_id)?;
        GuardedHost{ledger:&mut db,owner:&mut owner}
            .reserve(&reserve).map_err(|e|e.to_string())?;
        Ok(())
    }).unwrap();
    let original_identity=app.shuvi_trusted_a07_identity();
    // Original native editor Save As is a legitimate manual GUI command.
    // New path changes the trusted session context; model cannot choose it.
    let save=dir.0.join("new-native-document.fcproj");
    menus::invoke(&mut app,&egui::Context::default(),"file.saveAs",
        json!({"path":save.to_string_lossy()})).unwrap();
    assert!(save.exists());
    assert_ne!(app.shuvi_trusted_a07_identity(),original_identity);
    let after=view(&mut app);
    assert_ne!(after.session_id,original.session_id);
    let mut consent_ui=TestOnlyOwner{clicks:0};
    let stale=app.with_shuvi_trusted_a07_context(|session,project_id,session_id|{
        let mut owner=VideoOwner::new(session,project_id,session_id)?;
        GuardedHost{ledger:&mut db,owner:&mut owner}
            .request_consent(&consent,&mut consent_ui).map_err(|e|e.to_string())
    }).unwrap_err();
    assert_eq!(stale,GuardError::StaleProject.to_string());
    assert_eq!(consent_ui.clicks,0);
    assert_eq!(db.recovery_bound(&reserve.task_id,&reserve.plan_hash).unwrap(),
        vec!["not_started"]);
    assert_eq!(view(&mut app),after);
}
