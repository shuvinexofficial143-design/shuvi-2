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
