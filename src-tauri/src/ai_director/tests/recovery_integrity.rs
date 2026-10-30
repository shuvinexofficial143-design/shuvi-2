//! A08 semantic SQLite journal corruption verification. Real on-disk DB,
//! native owner explicitly a TEST DOUBLE, never a real FilmCraft/EffectCraft.
use shuvi_ai_provider::guard::{Action,Editor,GuardError,Ledger,NativeOwner,OwnerConsent,Scope,Snapshot,Version};
use shuvi_ai_provider::transactional::TransactionalLedger;
use rusqlite::{params,Connection};
use serde_json::{json,Value};
use std::{fs,path::PathBuf,time::{SystemTime,UNIX_EPOCH}};
struct Disk(PathBuf);
impl Disk{
    fn new()->Self{
        let stamp=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let root=std::env::temp_dir().join(format!("shuvi-a08-{}-{stamp}",std::process::id()));
        fs::create_dir(&root).unwrap();Self(root)
    }
    fn path(&self)->PathBuf{self.0.join("owner.sqlite3")}
    fn ledger(&self)->TransactionalLedger{TransactionalLedger::open(&self.path()).unwrap()}
    fn mutate(&self,sql:&str){
        let db=Connection::open(self.path()).unwrap();
        db.execute_batch(sql).unwrap();
    }
}
impl Drop for Disk{fn drop(&mut self){let _=fs::remove_dir_all(&self.0);}}
struct EditorDouble{state:Snapshot,mutations:u8}
impl NativeOwner for EditorDouble{
    fn snapshot(&mut self)->Result<Snapshot,String>{Ok(self.state.clone())}
    fn preflight_action(&mut self,_:&Action)->Result<bool,String>{Ok(true)}
    fn apply(&mut self,_:&Action)->Result<(),String>{
        self.mutations+=1;
        if let Version::MotionRevision(x)=&mut self.state.version{*x+=1;}
        Ok(())
    }
    fn verify_action(&mut self,_:&Action)->Result<bool,String>{Ok(true)}
    fn object_proof_sha256(&mut self,_:&Action)->Result<String,String>{
        Ok("c".repeat(64))
    }
}
struct Accept;
impl OwnerConsent for Accept{fn grant(&mut self,_:&Scope)->bool{true}}
fn scope()->Scope{
    Scope{
        task_id:"journal0001".into(),plan_hash:"a".repeat(64),
        instruction:"Create two verified native layers".into(),
        snapshot:Snapshot{
            editor:Editor::Motion,project_id:"file.ecproj".into(),
            session_id:"native-session-1".into(),
            version:Version::MotionRevision(4)
        },
        actions:vec![
            Action::MotionAddText{comp_id:2,name:"One".into(),text:"A".into(),
                x:12.0,y:22.0,size:40.0},
            Action::MotionSetTransform{comp_id:2,layer_id:7,kind:"opacity".into(),
                x:None,y:None,value:Some(50.0)}
        ]
    }
}
fn initial(verified:usize)->(Disk,TransactionalLedger,Scope,EditorDouble){
    let d=Disk::new();
    let mut db=d.ledger();
    let plan=scope();
    let mut owner=EditorDouble{state:plan.snapshot.clone(),mutations:0};
    db.reserve(&plan,&mut owner).unwrap();
    db.approve(&plan.task_id,&mut Accept).unwrap();
    for i in 0..verified {
        let before=owner.state.clone();
        db.execute_bound(&plan.task_id,i,&before,&plan.actions[i],&mut owner).unwrap();
    }
    (d,db,plan,owner)
}
fn refuses_to_recover_and_continue(sql:&str){
    let (d,mut db,p,mut owner)=initial(1);
    d.mutate(sql);
    assert_eq!(db.recovery(&p.task_id).unwrap_err(),GuardError::DuplicateOrUncertain);
    assert_eq!(db.cancel(&p.task_id).unwrap_err(),GuardError::DuplicateOrUncertain);
    assert_eq!(db.execute_bound(&p.task_id,1,&owner.state,&p.actions[1],&mut owner)
       .unwrap_err(),GuardError::DuplicateOrUncertain);
    assert_eq!(owner.mutations,1);
}
#[test]
fn untouched_receipt_chain_is_accepted_after_process_reopen(){
    let (d,db,p,mut owner)=initial(1);drop(db);
    let mut new_process=d.ledger();
    assert_eq!(new_process.recovery(&p.task_id).unwrap(),vec!["verified","not_started"]);
    let before=owner.state.clone();
    new_process.execute_bound(&p.task_id,1,&before,&p.actions[1],&mut owner).unwrap();
    assert_eq!(new_process.recovery(&p.task_id).unwrap(),vec!["verified","verified"]);
}
#[test]
fn changed_step_key_is_never_a_verified_receipt(){
    refuses_to_recover_and_continue("UPDATE ai_steps SET step_key='ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' WHERE step_index=0");
}
#[test]
fn changed_receipt_action_key_is_rejected(){
    refuses_to_recover_and_continue("UPDATE ai_steps SET receipt_json=json_set(receipt_json,'$.key','ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff') WHERE step_index=0");
}
#[test]
fn missing_verified_receipt_is_not_treated_as_success(){
    refuses_to_recover_and_continue("UPDATE ai_steps SET receipt_json=NULL WHERE step_index=0");
}
#[test]
fn changed_receipt_before_project_revision_breaks_chain(){
    refuses_to_recover_and_continue("UPDATE ai_steps SET receipt_json=json_set(receipt_json,'$.before.version.value',3) WHERE step_index=0");
}
#[test]
fn invalid_after_revision_cannot_unlock_step_two(){
    refuses_to_recover_and_continue("UPDATE ai_steps SET receipt_json=json_set(receipt_json,'$.after.version.value',4) WHERE step_index=0");
}
#[test]
fn forged_native_verified_flag_is_rejected(){
    refuses_to_recover_and_continue("UPDATE ai_steps SET receipt_json=json_set(receipt_json,'$.nativeVerified',json('false')) WHERE step_index=0");
}
#[test]
fn bad_object_sha_cannot_be_used_for_recovery(){
    refuses_to_recover_and_continue("UPDATE ai_steps SET receipt_json=json_set(receipt_json,'$.objectProofSha256','not-a-sha') WHERE step_index=0");
}
#[test]
fn forged_task_name_in_receipt_is_detected(){
    refuses_to_recover_and_continue("UPDATE ai_steps SET receipt_json=json_set(receipt_json,'$.taskId','intruder0001') WHERE step_index=0");
}
#[test]
fn changing_separate_task_plan_hash_column_rejects_binding(){
    let (d,db,p,mut owner)=initial(1);
    d.mutate("UPDATE ai_tasks SET plan_hash='ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'");
    assert_eq!(db.recovery(&p.task_id).unwrap_err(),GuardError::DuplicateOrUncertain);
    assert_eq!(db.execute_bound(&p.task_id,1,&owner.state,&p.actions[1],&mut owner)
        .unwrap_err(),GuardError::DuplicateOrUncertain);
    assert_eq!(owner.mutations,1);
}
#[test]
fn verified_receipt_with_wrong_index_is_rejected(){
    refuses_to_recover_and_continue("UPDATE ai_steps SET receipt_json=json_set(receipt_json,'$.index',7) WHERE step_index=0");
}
#[test]
fn orphan_verified_step_without_predecessor_cannot_be_recovered(){
    let (d,db,p,_owner)=initial(2);
    d.mutate("DELETE FROM ai_steps WHERE step_index=0");
    assert_eq!(db.recovery(&p.task_id).unwrap_err(),GuardError::DuplicateOrUncertain);
}
#[test]
fn outstanding_intent_followed_by_future_verified_step_is_rejected(){
    let (d,db,p,_owner)=initial(2);
    d.mutate("UPDATE ai_steps SET state='intent',receipt_json=NULL WHERE step_index=0");
    assert_eq!(db.recovery(&p.task_id).unwrap_err(),GuardError::DuplicateOrUncertain);
}
#[test]
fn valid_uncertain_intent_is_never_auto_replayed(){
    let (d,mut db,p,mut owner)=initial(1);
    d.mutate("UPDATE ai_steps SET state='intent',receipt_json=NULL WHERE step_index=0; DELETE FROM ai_steps WHERE step_index=1");
    assert_eq!(db.recovery(&p.task_id).unwrap(),vec!["uncertain","not_started"]);
    assert_eq!(db.cancel(&p.task_id).unwrap_err(),GuardError::DuplicateOrUncertain);
    assert_eq!(db.execute_bound(&p.task_id,0,&p.snapshot,&p.actions[0],&mut owner)
        .unwrap_err(),GuardError::DuplicateOrUncertain);
    assert_eq!(owner.mutations,1);
}
#[test]
fn intent_with_forged_receipt_cannot_be_recovered(){
    let (d,db,p,_owner)=initial(1);
    d.mutate("UPDATE ai_steps SET state='intent' WHERE step_index=0");
    assert_eq!(db.recovery(&p.task_id).unwrap_err(),GuardError::DuplicateOrUncertain);
}
