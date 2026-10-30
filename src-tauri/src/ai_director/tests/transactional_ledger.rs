//! A06 real on-disk SQLite tests. The editor below is a TEST DOUBLE.
//! No claim of real FilmCraft/EffectCraft, installed app or power-cut testing.
use shuvi_ai_provider::guard::{
    Action,Editor,GuardError,NativeOwner,OwnerConsent,Scope,Snapshot,Version
};
use shuvi_ai_provider::transactional::{TransactionalLedger,CancelOutcome};
use shuvi_ai_provider::plan::{ReserveWire,independently_hash};
use serde_json::json;
use std::{fs,path::PathBuf,time::{SystemTime,UNIX_EPOCH}};
struct Scratch{root:PathBuf}
impl Scratch{
    fn new()->Self{
        let nonce=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let root=std::env::temp_dir()
            .join(format!("shuvi-a06-{}-{nonce}",std::process::id()));
        fs::create_dir(&root).unwrap();
        Self{root}
    }
    fn database(&self)->PathBuf{self.root.join("ai-ledger.sqlite3")}
    fn open(&self)->TransactionalLedger{TransactionalLedger::open(&self.database()).unwrap()}
}
impl Drop for Scratch{fn drop(&mut self){let _=fs::remove_dir_all(&self.root);}}
struct FakeOwner{
    now:Snapshot,mutations:usize,preflight:bool,verify:bool,fail_after:bool,
    proof:bool
}
impl NativeOwner for FakeOwner {
    fn snapshot(&mut self)->Result<Snapshot,String>{Ok(self.now.clone())}
    fn preflight_action(&mut self,_:&Action)->Result<bool,String>{Ok(self.preflight)}
    fn apply(&mut self,_:&Action)->Result<(),String>{
        self.mutations+=1;
        match &mut self.now.version{
            Version::VideoSha256(v)=>*v="b".repeat(64),
            Version::MotionRevision(n)=>*n+=1,
        }
        if self.fail_after {Err("lost native response after edit".into())}else{Ok(())}
    }
    fn verify_action(&mut self,_:&Action)->Result<bool,String>{Ok(self.verify)}
    fn object_proof_sha256(&mut self,_:&Action)->Result<String,String>{
        Ok(if self.proof{"c".repeat(64)}else{"invalid".into()})
    }
}
struct Consent{allow:bool,calls:usize}
impl OwnerConsent for Consent{
    fn grant(&mut self,_:&Scope)->bool{self.calls+=1;self.allow}
}
fn task()->Scope{
    Scope {
        task_id:"task-0001".into(),plan_hash:"a".repeat(64),
        instruction:"नमस्ते title बनाओ".into(),
        snapshot:Snapshot{
            editor:Editor::Motion,project_id:"project.ecproj".into(),
            session_id:"effect-owner-123".into(),version:Version::MotionRevision(7)
        },
        actions:vec![
            Action::MotionAddText{comp_id:4,name:"Title".into(),text:"नमस्ते".into(),
                x:12.0,y:20.0,size:40.0},
            Action::MotionSetTransform{comp_id:4,layer_id:8,kind:"opacity".into(),
                x:None,y:None,value:Some(75.0)}
        ]
    }
}
fn owner(p:&Scope)->FakeOwner{
    FakeOwner{now:p.snapshot.clone(),mutations:0,preflight:true,verify:true,
        fail_after:false,proof:true}
}
fn consent()->Consent{Consent{allow:true,calls:0}}
#[test]
fn sqlite_wal_plan_persists_and_rejects_duplicate_after_reopen(){
    let tmp=Scratch::new();let p=task();let mut real=owner(&p);
    {let mut l=tmp.open();l.reserve(&p,&mut real).unwrap();
     assert_eq!(l.reserve(&p,&mut real).unwrap_err(),GuardError::AlreadyExists);
     l.integrity_check().unwrap();}
    let l=tmp.open();
    assert_eq!(l.recovery(&p.task_id).unwrap(),vec!["not_started","not_started"]);
    assert_eq!(real.mutations,0);
}
#[test]
fn absent_or_denied_owner_consent_never_allows_native_edit(){
    let tmp=Scratch::new();let p=task();let mut l=tmp.open();let mut real=owner(&p);
    l.reserve(&p,&mut real).unwrap();
    assert_eq!(l.execute_bound(&p.task_id,0,&p.snapshot,&p.actions[0],&mut real)
        .unwrap_err(),GuardError::NotApproved);
    let mut denied=Consent{allow:false,calls:0};
    assert!(!l.approve(&p.task_id,&mut denied).unwrap());
    assert_eq!(l.approve(&p.task_id,&mut denied).unwrap_err(),GuardError::AlreadyExists);
    assert_eq!(denied.calls,1);assert_eq!(real.mutations,0);
}
#[test]
fn one_native_owner_click_per_task_then_ordered_verified_steps(){
    let tmp=Scratch::new();let p=task();let mut l=tmp.open();let mut real=owner(&p);
    l.reserve(&p,&mut real).unwrap();let mut click=consent();
    assert!(l.approve(&p.task_id,&mut click).unwrap());assert_eq!(click.calls,1);
    assert_eq!(l.execute_bound(&p.task_id,1,&p.snapshot,&p.actions[1],&mut real)
        .unwrap_err(),GuardError::OutOfOrder);
    let one=l.execute_bound(&p.task_id,0,&p.snapshot,&p.actions[0],&mut real).unwrap();
    assert!(one.native_verified);
    assert_eq!(one.object_proof_sha256,"c".repeat(64));
    assert_eq!(one.after.version,Version::MotionRevision(8));
    let two=l.execute_bound(&p.task_id,1,&one.after,&p.actions[1],&mut real).unwrap();
    assert_eq!(two.after.version,Version::MotionRevision(9));
    assert_eq!(real.mutations,2);
    assert_eq!(l.recovery(&p.task_id).unwrap(),vec!["verified","verified"]);
    assert_eq!(l.approve(&p.task_id,&mut click).unwrap_err(),GuardError::AlreadyExists);
    assert_eq!(click.calls,1);
}
#[test]
fn restart_never_replays_an_already_applied_native_edit(){
    let tmp=Scratch::new();let p=task();let mut real=owner(&p);
    let receipt={
       let mut ledger=tmp.open();ledger.reserve(&p,&mut real).unwrap();
       ledger.approve(&p.task_id,&mut consent()).unwrap();
       ledger.execute_bound(&p.task_id,0,&p.snapshot,&p.actions[0],&mut real).unwrap()
    };
    let mut reopened=tmp.open();
    assert_eq!(reopened.execute_bound(&p.task_id,0,&p.snapshot,&p.actions[0],&mut real)
        .unwrap_err(),GuardError::OutOfOrder);
    assert_eq!(real.mutations,1);
    assert_eq!(reopened.recovery(&p.task_id).unwrap(),vec!["verified","not_started"]);
    let second=reopened.execute_bound(&p.task_id,1,&receipt.after,&p.actions[1],&mut real).unwrap();
    assert!(second.native_verified);
}
#[test]
fn cancel_before_first_step_is_durable_and_prevents_all_edits(){
    let tmp=Scratch::new();let p=task();let mut real=owner(&p);let mut l=tmp.open();
    l.reserve(&p,&mut real).unwrap();l.approve(&p.task_id,&mut consent()).unwrap();
    assert_eq!(l.cancel(&p.task_id).unwrap(),CancelOutcome::BeforeFirstEdit);
    assert_eq!(l.recovery(&p.task_id).unwrap(),vec!["cancelled","cancelled"]);
    let mut reopened=tmp.open();
    assert_eq!(reopened.execute_bound(&p.task_id,0,&p.snapshot,&p.actions[0],&mut real)
        .unwrap_err(),GuardError::DuplicateOrUncertain);
    assert_eq!(real.mutations,0);
}
#[test]
fn cancel_between_verified_steps_preserves_receipt_and_blocks_future(){
    let tmp=Scratch::new();let p=task();let mut real=owner(&p);let mut l=tmp.open();
    l.reserve(&p,&mut real).unwrap();l.approve(&p.task_id,&mut consent()).unwrap();
    let first=l.execute_bound(&p.task_id,0,&p.snapshot,&p.actions[0],&mut real).unwrap();
    assert_eq!(l.cancel(&p.task_id).unwrap(),CancelOutcome::BetweenVerifiedSteps);
    assert_eq!(l.recovery(&p.task_id).unwrap(),vec!["verified","cancelled"]);
    assert_eq!(l.execute_bound(&p.task_id,1,&first.after,&p.actions[1],&mut real)
        .unwrap_err(),GuardError::DuplicateOrUncertain);
    assert_eq!(real.mutations,1);
}
#[test]
fn native_timeout_after_mutation_remains_uncertain_even_after_reopen(){
    let tmp=Scratch::new();let p=task();let mut real=owner(&p);let mut l=tmp.open();
    l.reserve(&p,&mut real).unwrap();l.approve(&p.task_id,&mut consent()).unwrap();
    real.fail_after=true;
    assert_eq!(l.execute_bound(&p.task_id,0,&p.snapshot,&p.actions[0],&mut real)
        .unwrap_err(),GuardError::NativeOutcomeUncertain);
    drop(l);
    let mut reopened=tmp.open();real.fail_after=false;
    assert_eq!(reopened.recovery(&p.task_id).unwrap(),vec!["uncertain","not_started"]);
    assert_eq!(reopened.execute_bound(&p.task_id,0,&p.snapshot,&p.actions[0],&mut real)
        .unwrap_err(),GuardError::DuplicateOrUncertain);
    assert_eq!(reopened.cancel(&p.task_id).unwrap_err(),GuardError::DuplicateOrUncertain);
    assert_eq!(real.mutations,1);
}
#[test]
fn native_preflight_fails_without_even_admitting_an_edit_intent(){
    let tmp=Scratch::new();let p=task();let mut real=owner(&p);let mut l=tmp.open();
    l.reserve(&p,&mut real).unwrap();l.approve(&p.task_id,&mut consent()).unwrap();
    real.preflight=false;
    assert_eq!(l.execute_bound(&p.task_id,0,&p.snapshot,&p.actions[0],&mut real)
        .unwrap_err(),GuardError::Invalid);
    assert_eq!(l.recovery(&p.task_id).unwrap(),vec!["not_started","not_started"]);
    real.preflight=true;
    l.execute_bound(&p.task_id,0,&p.snapshot,&p.actions[0],&mut real).unwrap();
    assert_eq!(real.mutations,1);
}
#[test]
fn stale_editor_revision_or_substituted_action_cannot_mutate(){
    let tmp=Scratch::new();let p=task();let mut real=owner(&p);let mut l=tmp.open();
    l.reserve(&p,&mut real).unwrap();l.approve(&p.task_id,&mut consent()).unwrap();
    let substituted=Action::MotionEditText{comp_id:4,layer_id:8,text:"injected".into()};
    assert_eq!(l.execute_bound(&p.task_id,0,&p.snapshot,&substituted,&mut real)
        .unwrap_err(),GuardError::Invalid);
    real.now.version=Version::MotionRevision(11);
    assert_eq!(l.execute_bound(&p.task_id,0,&p.snapshot,&p.actions[0],&mut real)
        .unwrap_err(),GuardError::StaleProject);
    assert_eq!(l.recovery(&p.task_id).unwrap(),vec!["not_started","not_started"]);
    assert_eq!(real.mutations,0);
}
#[test]
fn failed_native_object_proof_remains_uncertain_no_auto_retry(){
    let tmp=Scratch::new();let p=task();let mut real=owner(&p);let mut l=tmp.open();
    l.reserve(&p,&mut real).unwrap();l.approve(&p.task_id,&mut consent()).unwrap();
    real.proof=false;
    assert_eq!(l.execute_bound(&p.task_id,0,&p.snapshot,&p.actions[0],&mut real)
        .unwrap_err(),GuardError::NativeOutcomeUncertain);
    assert_eq!(l.recovery(&p.task_id).unwrap(),vec!["uncertain","not_started"]);
    real.proof=true;
    assert_eq!(l.execute_bound(&p.task_id,0,&p.snapshot,&p.actions[0],&mut real)
        .unwrap_err(),GuardError::DuplicateOrUncertain);
    assert_eq!(real.mutations,1);
}
#[test]
fn cancel_and_edit_admission_are_serialized_across_two_db_connections(){
    let tmp=Scratch::new();let p=task();let mut real=owner(&p);let mut reserve=tmp.open();
    reserve.reserve(&p,&mut real).unwrap();
    reserve.approve(&p.task_id,&mut consent()).unwrap();
    let mut cancel_connection=tmp.open();
    assert_eq!(cancel_connection.cancel(&p.task_id).unwrap(),CancelOutcome::BeforeFirstEdit);
    assert_eq!(reserve.execute_bound(&p.task_id,0,&p.snapshot,&p.actions[0],&mut real)
        .unwrap_err(),GuardError::DuplicateOrUncertain);
    assert_eq!(real.mutations,0);
}
#[test]
fn independently_hashed_js_plan_reserves_in_transactional_ledger(){
    let tmp=Scratch::new();let p=task();let mut real=owner(&p);let mut ledger=tmp.open();
    let plan=json!({
        "taskId":p.task_id,
        "instruction":p.instruction,
        "snapshot":{"engine":"motion","projectId":"project.ecproj",
            "sessionId":"effect-owner-123","version":7},
        "actions":[{"type":"motion.addText","compId":4,"name":"Title",
            "text":"नमस्ते","x":12,"y":20,"size":40},
            {"type":"motion.setTransform","compId":4,"layerId":8,"kind":"opacity",
             "x":null,"y":null,"value":75}]
    });
    let wire=ReserveWire{task_id:p.task_id,plan_hash:independently_hash(&plan).unwrap(),
        project:plan["snapshot"].clone(),plan};
    wire.reserve_transactional(&mut ledger,&mut real).unwrap();
    assert_eq!(ledger.recovery(&wire.task_id).unwrap(),vec!["not_started","not_started"]);
}
#[test]
fn host_database_path_must_be_absolute_and_existing_private_parent(){
    let tmp=Scratch::new();
    assert!(TransactionalLedger::open(std::path::Path::new("relative.sqlite3")).is_err());
    assert!(TransactionalLedger::open(&tmp.root.join("bad.txt")).is_err());
    assert!(TransactionalLedger::open(&tmp.root.join("missing").join("a.sqlite3")).is_err());
}
