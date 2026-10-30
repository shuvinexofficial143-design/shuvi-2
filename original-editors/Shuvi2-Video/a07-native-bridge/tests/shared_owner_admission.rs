//! A11: same REAL FilmCraft Session for manual and canonical A07 commands.
//! This tests the isolated native owner gate, NOT the running egui production
//! application nor an actual user operating a Windows owner-consent dialog.
use filmcraft_engine::Session;
use serde_json::{json,Value};
use shuvi_ai_provider::{
    guard::{OwnerConsent,Scope,GuardError,Version},
    host::{OwnerConsentRequest,GuardedHost,TaskBinding},
    plan::{ReserveWire,independently_hash},
    ipc::GuardedWireRequest,
    transactional::TransactionalLedger,
};
use shuvi_video_a07_native_bridge::shared_owner::{AdmissionError,NativeVideoAdmission};
use std::{fs,path::PathBuf,time::{SystemTime,UNIX_EPOCH}};

struct Tmp(PathBuf);
impl Tmp {
    fn new()->Self{
        let ns=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let p=std::env::temp_dir().join(format!("a11-shared-owner-{}-{ns}",std::process::id()));
        fs::create_dir_all(&p).unwrap();
        Self(p)
    }
    fn open(&self)->TransactionalLedger{
        TransactionalLedger::open(&self.0.join("guard.sqlite3")).unwrap()
    }
}
impl Drop for Tmp {fn drop(&mut self){let _=fs::remove_dir_all(&self.0);}}
struct Consent {clicks:usize,grant:bool}
impl OwnerConsent for Consent {
    fn grant(&mut self,scope:&Scope)->bool{
        self.clicks+=1;
        assert_eq!(scope.actions.len(),1);
        self.grant
    }
}
fn gate()->NativeVideoAdmission{
    let mut s=Session::default();
    s.execute("file.openDemoProject",json!({})).unwrap();
    NativeVideoAdmission::new(
        s,"trusted-filmcraft-project".to_string(),
        "native-session-a11-lock".to_string()
    ).unwrap()
}
fn plan(gate:&NativeVideoAdmission,task:&str)->(Value,ReserveWire,OwnerConsentRequest,TaskBinding){
    let observed=gate.native_readback().unwrap();
    let at=2*filmcraft_engine::time::TICKS_PER_SECOND;
    let clip=observed.sequence.as_ref().unwrap()["video"][0]["items"].as_array().unwrap()
        .iter().find(|c|c["start"].as_i64().unwrap_or(-1)<at &&
            at<c["end"].as_i64().unwrap_or(-1))
        .and_then(|c|c["clip"].as_u64()).unwrap();
    let identity=gate.a07_snapshot().unwrap();
    let Version::VideoSha256(ref hash)=identity.version else {panic!("not video")};
    let snapshot=json!({"engine":"video","projectId":identity.project_id,
        "sessionId":identity.session_id,"version":hash});
    let p=json!({"taskId":task,
        "instruction":"Split native clip after approved owner consent",
        "snapshot":snapshot,
        "actions":[{"type":"video.split","clipId":clip,"seconds":2.0}]
    });
    let digest=independently_hash(&p).unwrap();
    let reserve=ReserveWire {task_id:task.into(),plan_hash:digest.clone(),
        project:snapshot,plan:p.clone()};
    let consent=OwnerConsentRequest {task_id:task.into(),plan_hash:digest.clone()};
    let bound=TaskBinding {task_id:task.into(),plan_hash:digest};
    (p,reserve,consent,bound)
}
fn wire(p:&Value)->GuardedWireRequest{
    serde_json::from_value(json!({
        "taskId":p["taskId"],"stepIndex":0,"idempotencyKey":"a".repeat(64),
        "expectedSnapshot":p["snapshot"],"action":p["actions"][0]
    })).unwrap()
}
#[test]
fn same_native_lock_refuses_manual_edit_switch_save_during_guarded_a07_transaction(){
    let gate=gate();
    let temp=Tmp::new();
    let (p,reserve,approve,binding)=plan(&gate,"sharedownertask01");
    let initial=gate.a07_snapshot().unwrap();
    let mut ledger=temp.open();
    let mut clicks=Consent{clicks:0,grant:true};
    let finished=gate.with_guarded_a07(&mut ledger,|host|{
        // These are real original Session::execute commands, not mocks.
        for (command,payload) in [
            ("file.newSequence",json!({"name":"manual interferer"})),
            ("edit.undo",json!({})),
            ("file.saveAs",json!({"path":temp.0.join("busy.fcproj").to_string_lossy()})),
            ("file.openDemoProject",json!({})),
        ]{
            assert!(matches!(gate.manual_command(command,payload),Err(AdmissionError::Busy)));
        }
        assert!(matches!(gate.native_readback(),Err(AdmissionError::Busy)));
        assert!(matches!(gate.a07_snapshot(),Err(AdmissionError::Busy)));
        assert!(matches!(
            gate.with_guarded_a07(host.ledger, |_other| Ok(())),
            Err(AdmissionError::Busy)
        ));
        assert_eq!(host.reserve(&reserve).unwrap()["reserved"],true);
        assert_eq!(host.request_consent(&approve,&mut clicks).unwrap()["granted"],true);
        let result=host.execute(wire(&p)).unwrap();
        assert_eq!(result["nativeVerified"],true);
        assert_eq!(result["guarded"],true);
        assert_eq!(host.recover(&binding).unwrap()["steps"],json!(["verified"]));
        Ok(result)
    }).unwrap();
    assert_eq!(clicks.clicks,1);
    assert_ne!(initial,gate.a07_snapshot().unwrap());
    assert_eq!(finished["objectProofSha256"].as_str().unwrap().len(),64);
    assert!(!temp.0.join("busy.fcproj").exists());
    let saved=temp.0.join("allowed-after-task.fcproj");
    gate.manual_command("file.saveAs",json!({"path":saved.to_string_lossy()})).unwrap();
    assert!(saved.exists());
    let reopened=temp.open();
    assert_eq!(reopened.recovery_bound(&binding.task_id,&binding.plan_hash).unwrap(),
        vec!["verified"]);
}
#[test]
fn manual_edit_between_reserve_and_native_owner_consent_blocks_prompt_and_no_ai_edit(){
    let gate=gate();
    let temp=Tmp::new();
    let (_,reserve,approve,binding)=plan(&gate,"sharedownertask02");
    let mut ledger=temp.open();
    gate.with_guarded_a07(&mut ledger,|host|{
        assert_eq!(host.reserve(&reserve).unwrap()["reserved"],true);
        Ok(())
    }).unwrap();
    gate.manual_command("file.newSequence",json!({"name":"manual project change"})).unwrap();
    let after_manual=gate.a07_snapshot().unwrap();
    let mut clicks=Consent{clicks:0,grant:true};
    let result=gate.with_guarded_a07(&mut ledger,|host|{
        host.request_consent(&approve,&mut clicks)
    });
    assert!(matches!(result,Err(AdmissionError::A07(GuardError::StaleProject))));
    assert_eq!(clicks.clicks,0);
    assert_eq!(gate.a07_snapshot().unwrap(),after_manual);
    let persisted=ledger.recovery_bound(&binding.task_id,&binding.plan_hash).unwrap();
    assert_eq!(persisted,vec!["not_started"]);
}
#[test]
fn native_gate_fails_closed_on_missing_editor_and_invalid_identity(){
    let empty=Session::default();
    assert!(NativeVideoAdmission::new(empty,"a".into(),"short".into()).is_err());
}

#[test]
fn native_a07_session_id_rotates_on_document_reopen_even_when_app_instance_is_same(){
    let gate=gate();
    let original=gate.a07_snapshot().unwrap();
    assert!(original.session_id.starts_with("s-"));
    assert_eq!(original.session_id.len(),66);
    let again=gate.a07_snapshot().unwrap();
    assert_eq!(again,original);
    // This is a real original FilmCraft File > Demo operation. It replaces
    // the native document while remaining inside the same Windows app.
    gate.manual_command("file.openDemoProject",json!({})).unwrap();
    let changed=gate.a07_snapshot().unwrap();
    assert_ne!(changed.session_id,original.session_id);
    assert_eq!(changed.project_id,original.project_id);
}

#[test]
fn old_sqlite_video_reservation_cannot_open_owner_prompt_after_native_document_reopen(){
    let gate=gate();
    let temp=Tmp::new();
    let (_,reserve,approve,binding)=plan(&gate,"sharedownertask03");
    let mut ledger=temp.open();
    gate.with_guarded_a07(&mut ledger, |host|{
        host.reserve(&reserve)?;
        Ok(())
    }).unwrap();
    // Native app reopens same example project; even if project content happens
    // to be byte-for-byte identical, the context-bound Session ID rotated.
    gate.manual_command("file.openDemoProject",json!({})).unwrap();
    let updated=gate.a07_snapshot().unwrap();
    let mut clicks=Consent{clicks:0,grant:true};
    let result=gate.with_guarded_a07(&mut ledger,|host|{
        host.request_consent(&approve,&mut clicks)
    });
    assert!(matches!(result,Err(AdmissionError::A07(GuardError::StaleProject))));
    assert_eq!(clicks.clicks,0);
    assert_ne!(updated.session_id,reserve.plan["snapshot"]["sessionId"].as_str().unwrap());
    assert_eq!(ledger.recovery_bound(&binding.task_id,&binding.plan_hash).unwrap(),
        vec!["not_started"]);
}

#[test]
fn two_approved_sqlite_tasks_on_one_native_session_cannot_both_mutate_stale_project() {
    let admission=gate();
    let dir=Tmp::new();
    let (first_plan,first_reserve,first_consent,first_binding)=plan(&admission,"sharedownertask04");
    let (other_plan,other_reserve,other_consent,other_binding)=plan(&admission,"sharedownertask05");
    assert_eq!(first_plan["snapshot"],other_plan["snapshot"]);
    let before=admission.native_readback().unwrap();
    let mut ledger=dir.open();
    admission.with_guarded_a07(&mut ledger,|host|{
        host.reserve(&first_reserve)?;
        host.reserve(&other_reserve)?;
        Ok(())
    }).unwrap();
    let mut one=Consent{clicks:0,grant:true};
    let mut two=Consent{clicks:0,grant:true};
    admission.with_guarded_a07(&mut ledger,|host|{
        host.request_consent(&first_consent,&mut one)?;
        host.request_consent(&other_consent,&mut two)?;
        Ok(())
    }).unwrap();
    assert_eq!((one.clicks,two.clicks),(1,1));
    admission.with_guarded_a07(&mut ledger,|host|{
        let receipt=host.execute(wire(&first_plan))?;
        assert_eq!(receipt["nativeVerified"],true);
        Ok(())
    }).unwrap();
    let after_first=admission.native_readback().unwrap();
    assert_ne!(after_first.project_sha256,before.project_sha256);
    let stale=admission.with_guarded_a07(&mut ledger,|host|{
        host.execute(wire(&other_plan))
    });
    assert!(matches!(stale,Err(AdmissionError::A07(GuardError::StaleProject))));
    assert_eq!(admission.native_readback().unwrap().project_sha256,after_first.project_sha256);
    assert_eq!(ledger.recovery_bound(&first_binding.task_id,&first_binding.plan_hash).unwrap(),
        vec!["verified"]);
    assert_eq!(ledger.recovery_bound(&other_binding.task_id,&other_binding.plan_hash).unwrap(),
        vec!["not_started"]);
    drop(ledger);
    let reopened=dir.open();
    assert_eq!(reopened.recovery_bound(&first_binding.task_id,&first_binding.plan_hash).unwrap(),
        vec!["verified"]);
    assert_eq!(reopened.recovery_bound(&other_binding.task_id,&other_binding.plan_hash).unwrap(),
        vec!["not_started"]);
}

#[test]
fn approved_task_rejects_manual_save_as_and_fails_without_any_native_intent() {
    let admission=gate();
    let dir=Tmp::new();
    let (proposal,reserve,approve,binding)=plan(&admission,"sharedownertask06");
    let mut ledger=dir.open();
    let mut clicks=Consent{clicks:0,grant:true};
    admission.with_guarded_a07(&mut ledger,|host|{
        host.reserve(&reserve)?;
        host.request_consent(&approve,&mut clicks)?;
        Ok(())
    }).unwrap();
    assert_eq!(clicks.clicks,1);
    let saved=dir.0.join("manual-save-before-ai.fcproj");
    admission.manual_command("file.saveAs",json!({"path":saved.to_string_lossy()})).unwrap();
    assert!(saved.exists());
    let after_manual=admission.a07_snapshot().unwrap();
    assert_ne!(after_manual.session_id,reserve.plan["snapshot"]["sessionId"].as_str().unwrap());
    let attempt=admission.with_guarded_a07(&mut ledger,|host|{
        host.execute(wire(&proposal))
    });
    assert!(matches!(attempt,Err(AdmissionError::A07(GuardError::StaleProject))));
    assert_eq!(admission.a07_snapshot().unwrap(),after_manual);
    assert_eq!(ledger.recovery_bound(&binding.task_id,&binding.plan_hash).unwrap(),
        vec!["not_started"]);
}

#[test]
fn native_owner_panics_poison_the_shared_gate_and_never_allow_fallback_edits() {
    let admission=gate();
    let dir=Tmp::new();
    let mut ledger=dir.open();
    let original=admission.a07_snapshot().unwrap();
    let crash=std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = admission.with_guarded_a07(&mut ledger,|_host| -> Result<(),GuardError> {
            // Inject a true native-owner failure while holding its Session
            // Mutex. No production panic, no external app involved.
            panic!("test-only owner panic before any edit")
        });
    }));
    assert!(crash.is_err());
    assert!(matches!(
        admission.manual_command("file.newSequence",json!({"name":"unsafe fallback"})),
        Err(AdmissionError::Poisoned)
    ));
    assert!(matches!(admission.a07_snapshot(),Err(AdmissionError::Poisoned)));
    assert!(matches!(admission.native_readback(),Err(AdmissionError::Poisoned)));
    assert!(matches!(
        admission.with_guarded_a07(&mut ledger,|_host| Ok(())),
        Err(AdmissionError::Poisoned)
    ));
    // The original project is inaccessible after poisoning, rather than
    // continuing with a potentially corrupted in-memory native Session.
    assert!(!original.session_id.is_empty());
}

#[test]
fn manual_change_after_approved_a07_consent_prevents_replay_at_execute() {
    let admission=gate();
    let tmp=Tmp::new();
    let (proposal,reservation,consent,binding)=plan(&admission,"sharedownertask07");
    let mut db=tmp.open();
    let mut operator=Consent{clicks:0,grant:true};
    admission.with_guarded_a07(&mut db,|host|{
        host.reserve(&reservation)?;
        host.request_consent(&consent,&mut operator)?;
        Ok(())
    }).unwrap();
    assert_eq!(operator.clicks,1);
    admission.manual_command("file.newSequence",json!({"name":"native manual edit"})).unwrap();
    let changed=admission.a07_snapshot().unwrap();
    let failed=admission.with_guarded_a07(&mut db,|host|{
        host.execute(wire(&proposal))
    });
    assert!(matches!(failed,Err(AdmissionError::A07(GuardError::StaleProject))));
    assert_eq!(admission.a07_snapshot().unwrap(),changed);
    assert_eq!(db.recovery_bound(&binding.task_id,&binding.plan_hash).unwrap(),
        vec!["not_started"]);
}

#[test]
fn direct_native_timeline_gesture_is_blocked_during_a07_guarded_transaction() {
    use filmcraft_project::ClipId;
    use filmcraft_time::{Tick,TICKS_PER_SECOND};
    let admission=gate();
    let before=admission.native_readback().unwrap();
    let tmp=Tmp::new();
    let mut ledger=tmp.open();
    let result=admission.with_guarded_a07(&mut ledger,|_host|{
        let attempt=admission.with_manual_session(|native|{
            // This is a REAL FilmCraft edit_sequence path used by timeline
            // gestures, and would change the native project if admitted.
            let clip=native.active_sequence().unwrap().video_tracks[0].items[0].id;
            let tick=native.sequence_rate().snap_nearest(Tick(2*TICKS_PER_SECOND));
            native.edit_sequence("blocked manual gesture", |seq,ctx,_|{
                Ok(filmcraft_edit::razor_items(seq,&[ClipId(clip.0)],tick,ctx))
            }).map_err(|e|e.to_string())
        });
        assert!(matches!(attempt,Err(AdmissionError::Busy)));
        Ok(())
    });
    assert!(result.is_ok());
    let after=admission.native_readback().unwrap();
    assert_eq!(after.project_sha256,before.project_sha256);
    assert_eq!(after.revision,before.revision);
}

#[test]
fn admitted_direct_manual_razor_invalidates_pending_a07_plan_before_owner_prompt() {
    use filmcraft_time::{Tick,TICKS_PER_SECOND};
    let admission=gate();
    let temp=Tmp::new();
    let (_,reservation,approval,binding)=plan(&admission,"sharedownertask08");
    let mut ledger=temp.open();
    admission.with_guarded_a07(&mut ledger,|host|{
        host.reserve(&reservation)?;
        Ok(())
    }).unwrap();
    let before=admission.native_readback().unwrap();
    // Execute direct native editing algebra, NOT Session::execute and NOT
    // a fake UI command. The admitted mutable borrow is the same Session.
    let created=admission.with_manual_session(|native|{
        let active=native.active_sequence().unwrap();
        let tick=native.sequence_rate().snap_nearest(Tick(2*TICKS_PER_SECOND));
        let target=active.video_tracks[0].items.iter()
            .find(|c|c.start.0<tick.0&&tick.0<c.end().0)
            .unwrap().id;
        native.edit_sequence("native manual timeline razor", |seq,ctx,_|{
            Ok(filmcraft_edit::razor_items(seq,&[target],tick,ctx))
        }).map_err(|e|e.to_string())
    }).unwrap();
    assert_eq!(created.len(),1);
    let after=admission.native_readback().unwrap();
    assert_ne!(after.project_sha256,before.project_sha256);
    assert!(after.revision>before.revision);
    let mut owner=Consent{clicks:0,grant:true};
    let denied=admission.with_guarded_a07(&mut ledger,|host|{
        host.request_consent(&approval,&mut owner)
    });
    assert!(matches!(denied,Err(AdmissionError::A07(GuardError::StaleProject))));
    assert_eq!(owner.clicks,0);
    assert_eq!(ledger.recovery_bound(&binding.task_id,&binding.plan_hash).unwrap(),
        vec!["not_started"]);
}
