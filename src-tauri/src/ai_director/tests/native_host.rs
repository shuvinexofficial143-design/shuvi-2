//! A07 disk-backed, typed native host API integration with explicit editor
//! TEST DOUBLES. NOT proof of installed Windows GUI, real key or studio edits.
use shuvi_ai_provider::guard::{
    Action,Editor,GuardError,NativeOwner,OwnerConsent,Scope,Snapshot,Version
};
use shuvi_ai_provider::host::{
    GuardedHost,OwnerConsentRequest,TaskBinding,unintegrated_capabilities
};
use shuvi_ai_provider::ipc::GuardedWireRequest;
use shuvi_ai_provider::plan::{ReserveWire,independently_hash};
use shuvi_ai_provider::transactional::TransactionalLedger;
use serde_json::{json,Value};
use std::{fs,path::PathBuf,time::{SystemTime,UNIX_EPOCH}};

struct Tmp(PathBuf);
impl Tmp {
    fn new()->Self {
        let stamp=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let path=std::env::temp_dir().join(format!("shuvi-a07-{}-{stamp}",std::process::id()));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn db(&self)->TransactionalLedger {
        TransactionalLedger::open(&self.0.join("owner.sqlite3")).unwrap()
    }
}
impl Drop for Tmp {fn drop(&mut self){let _=fs::remove_dir_all(&self.0);}}
struct EditorDouble {
    state:Snapshot,edits:usize,fail_after:bool,readback:bool
}
impl NativeOwner for EditorDouble {
    fn snapshot(&mut self)->Result<Snapshot,String>{Ok(self.state.clone())}
    fn preflight_action(&mut self,_:&Action)->Result<bool,String>{Ok(true)}
    fn apply(&mut self,_:&Action)->Result<(),String>{
        self.edits+=1;
        if let Version::MotionRevision(r)=&mut self.state.version{*r+=1;}
        if self.fail_after {return Err("timeout after native command".into());}
        Ok(())
    }
    fn verify_action(&mut self,_:&Action)->Result<bool,String>{Ok(self.readback)}
    fn object_proof_sha256(&mut self,_:&Action)->Result<String,String>{
        Ok("d".repeat(64))
    }
}
struct OwnerUi {
    approved:bool,shown:usize,last_instruction:String,last_project:String
}
impl OwnerConsent for OwnerUi {
    fn grant(&mut self,scope:&Scope)->bool{
        self.shown+=1;
        self.last_instruction=scope.instruction.clone();
        self.last_project=scope.snapshot.project_id.clone();
        self.approved
    }
}
fn ui(approved:bool)->OwnerUi {
    OwnerUi{approved,shown:0,last_instruction:String::new(),last_project:String::new()}
}
fn candidate()->Value {
    json!({"taskId":"hosttask1234","instruction":"क्लिप में शीर्षक बनाओ",
       "snapshot":{"engine":"motion","projectId":"original-project.ecproj",
         "sessionId":"native-session-0123","version":2},
       "actions":[
         {"type":"motion.addText","compId":3,"name":"Title",
          "text":"नमस्ते","x":10,"y":12,"size":36},
         {"type":"motion.setTransform","compId":3,"layerId":8,
          "kind":"opacity","x":null,"y":null,"value":55}
       ]})
}
fn setup()->(Value,ReserveWire,OwnerConsentRequest,TaskBinding,EditorDouble){
    let plan=candidate();
    let digest=independently_hash(&plan).unwrap();
    let reserve=ReserveWire{
        task_id:"hosttask1234".into(),plan_hash:digest.clone(),
        project:plan["snapshot"].clone(),plan:plan.clone()
    };
    let consent=OwnerConsentRequest{task_id:reserve.task_id.clone(),
        plan_hash:digest.clone()};
    let bind=TaskBinding{task_id:reserve.task_id.clone(),plan_hash:digest};
    let editor=EditorDouble{state:Snapshot{
        editor:Editor::Motion,project_id:"original-project.ecproj".into(),
        session_id:"native-session-0123".into(),version:Version::MotionRevision(2)
    },edits:0,fail_after:false,readback:true};
    (plan,reserve,consent,bind,editor)
}
fn wire(p:&Value,i:usize,version:u64)->GuardedWireRequest {
    serde_json::from_value(json!({
        "taskId":"hosttask1234","stepIndex":i,"idempotencyKey":"b".repeat(64),
        "expectedSnapshot":{"engine":"motion","projectId":"original-project.ecproj",
            "sessionId":"native-session-0123","version":version},
        "action":p["actions"][i]
    })).unwrap()
}
#[test]
fn native_host_disables_readiness_until_actual_tauri_editor_integration(){
    let caps=unintegrated_capabilities();
    assert_eq!(serde_json::to_value(caps).unwrap()["nativeGuarded"],false);
}
#[test]
fn registered_host_contract_binds_approval_to_exact_stored_plan_not_webview_fields(){
    let t=Tmp::new();let mut db=t.db();
    let (plan,reserve,approval,bind,mut editor)=setup();
    let mut host=GuardedHost{ledger:&mut db,owner:&mut editor};
    let recorded=host.reserve(&reserve).unwrap();
    assert_eq!(recorded["reserved"],true);
    assert_eq!(recorded["nativeOwnerBound"],true);
    let mut trusted_ui=ui(true);
    let granted=host.request_consent(&approval,&mut trusted_ui).unwrap();
    assert_eq!(granted["granted"],true);
    assert_eq!(granted["nativeOwnerInteraction"],true);
    assert_eq!(trusted_ui.shown,1);
    assert_eq!(trusted_ui.last_instruction,plan["instruction"].as_str().unwrap());
    assert_eq!(trusted_ui.last_project,"original-project.ecproj");
    assert_eq!(host.request_consent(&approval,&mut trusted_ui).unwrap_err(),
        GuardError::AlreadyExists);
    assert_eq!(trusted_ui.shown,1);
    let first=host.execute(wire(&plan,0,2)).unwrap();
    assert_eq!(first["guarded"],true);
    assert_eq!(first["nativeVerified"],true);
    assert_eq!(first["after"]["version"],3);
    assert_eq!(first["objectProofSha256"],"d".repeat(64));
    assert_eq!(host.recover(&bind).unwrap()["steps"],json!(["verified","not_started"]));
    let second=host.execute(wire(&plan,1,3)).unwrap();
    assert_eq!(second["after"]["version"],4);
    assert_eq!(host.recover(&bind).unwrap()["steps"],json!(["verified","verified"]));
    let stop=host.cancel(&bind).unwrap();
    assert_eq!(stop["cancelled"],false);
    assert_eq!(stop["state"],"already_complete");
    assert_eq!(host.owner.edits,2);
}
#[test]
fn altered_hash_does_not_show_owner_ui_or_edit(){
    let t=Tmp::new();let mut db=t.db();
    let (_plan,reserve,_,mut bind,mut editor)=setup();
    let mut host=GuardedHost{ledger:&mut db,owner:&mut editor};
    host.reserve(&reserve).unwrap();
    bind.plan_hash="e".repeat(64);
    let request=OwnerConsentRequest{task_id:bind.task_id.clone(),plan_hash:bind.plan_hash.clone()};
    let mut trusted=ui(true);
    assert_eq!(host.request_consent(&request,&mut trusted).unwrap_err(),GuardError::Invalid);
    assert_eq!(trusted.shown,0);
    assert_eq!(host.cancel(&bind).unwrap_err(),GuardError::Invalid);
    assert_eq!(host.recover(&bind).unwrap_err(),GuardError::Invalid);
    assert_eq!(host.owner.edits,0);
}
#[test]
fn malformed_renderer_approval_payload_cannot_inject_actions_or_approved_boolean(){
    let data=json!({"taskId":"hosttask1234","planHash":"a".repeat(64),
      "actions":[{"type":"motion.deleteAll"}],"approved":true});
    assert!(serde_json::from_value::<OwnerConsentRequest>(data).is_err());
}
#[test]
fn denied_native_owner_prompt_cannot_be_replayed_or_edited(){
    let t=Tmp::new();let mut db=t.db();
    let (plan,reserve,consent,bind,mut editor)=setup();
    let mut host=GuardedHost{ledger:&mut db,owner:&mut editor};
    host.reserve(&reserve).unwrap();
    let mut denied=ui(false);
    assert_eq!(host.request_consent(&consent,&mut denied).unwrap()["granted"],false);
    assert_eq!(denied.shown,1);
    assert_eq!(host.execute(wire(&plan,0,2)).unwrap_err(),GuardError::NotApproved);
    assert_eq!(host.recover(&bind).unwrap()["steps"],json!(["not_started","not_started"]));
    assert_eq!(host.owner.edits,0);
}
#[test]
fn stop_before_intent_is_durable_across_host_reinstantiation(){
    let t=Tmp::new();let (plan,reserve,consent,bind,mut editor)=setup();
    {
        let mut db=t.db();let mut host=GuardedHost{ledger:&mut db,owner:&mut editor};
        host.reserve(&reserve).unwrap();
        host.request_consent(&consent,&mut ui(true)).unwrap();
        let stop=host.cancel(&bind).unwrap();
        assert_eq!(stop["cancelled"],true);
        assert_eq!(stop["state"],"before_first_edit");
    }
    let mut reopened=t.db();let mut host=GuardedHost{ledger:&mut reopened,owner:&mut editor};
    assert_eq!(host.cancel(&bind).unwrap()["state"],"already_cancelled");
    assert_eq!(host.execute(wire(&plan,0,2)).unwrap_err(),GuardError::DuplicateOrUncertain);
    assert_eq!(host.recover(&bind).unwrap()["steps"],json!(["cancelled","cancelled"]));
    assert_eq!(host.owner.edits,0);
}
#[test]
fn native_timeout_after_dispatch_cannot_be_cancelled_or_blind_retried(){
    let t=Tmp::new();let mut db=t.db();
    let (plan,reserve,consent,bind,mut editor)=setup();
    let mut host=GuardedHost{ledger:&mut db,owner:&mut editor};
    host.reserve(&reserve).unwrap();
    host.request_consent(&consent,&mut ui(true)).unwrap();
    host.owner.fail_after=true;
    assert_eq!(host.execute(wire(&plan,0,2)).unwrap_err(),GuardError::NativeOutcomeUncertain);
    assert_eq!(host.cancel(&bind).unwrap()["state"],"intent_uncertain");
    assert_eq!(host.recover(&bind).unwrap()["steps"],json!(["uncertain","not_started"]));
    host.owner.fail_after=false;
    assert_eq!(host.execute(wire(&plan,0,3)).unwrap_err(),GuardError::DuplicateOrUncertain);
    assert_eq!(host.owner.edits,1);
}
#[test]
fn stopped_between_verified_steps_keeps_first_native_receipt(){
    let t=Tmp::new();let mut db=t.db();
    let (plan,reserve,consent,bind,mut editor)=setup();
    let mut host=GuardedHost{ledger:&mut db,owner:&mut editor};
    host.reserve(&reserve).unwrap();
    host.request_consent(&consent,&mut ui(true)).unwrap();
    host.execute(wire(&plan,0,2)).unwrap();
    let ack=host.cancel(&bind).unwrap();
    assert_eq!(ack["cancelled"],true);
    assert_eq!(ack["state"],"between_verified_steps");
    assert_eq!(host.recover(&bind).unwrap()["steps"],json!(["verified","cancelled"]));
    assert_eq!(host.execute(wire(&plan,1,3)).unwrap_err(),GuardError::DuplicateOrUncertain);
    assert_eq!(host.owner.edits,1);
}

#[test]
fn owner_project_or_session_change_blocks_consent_before_any_prompt(){
    let t=Tmp::new();let mut db=t.db();
    let (_plan,reserve,consent,_bind,mut editor)=setup();
    let mut host=GuardedHost{ledger:&mut db,owner:&mut editor};
    host.reserve(&reserve).unwrap();
    let mut trusted_ui=ui(true);
    host.owner.state.session_id="other-native-session".into();
    assert_eq!(host.request_consent(&consent,&mut trusted_ui).unwrap_err(),
        GuardError::StaleProject);
    assert_eq!(trusted_ui.shown,0);
    host.owner.state.session_id="native-session-0123".into();
    host.owner.state.version=Version::MotionRevision(7);
    assert_eq!(host.request_consent(&consent,&mut trusted_ui).unwrap_err(),
        GuardError::StaleProject);
    assert_eq!(trusted_ui.shown,0);
    host.owner.state.version=Version::MotionRevision(2);
    assert_eq!(host.request_consent(&consent,&mut trusted_ui).unwrap()["granted"],true);
    assert_eq!(trusted_ui.shown,1);
}
