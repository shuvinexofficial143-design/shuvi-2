//! A03 persistence/security contract. All editors and consent in this test are
//! explicitly TEST DOUBLES; this is NOT a live EffectCraft/FilmCraft E2E proof.
use shuvi_ai_provider::guard::{Action,Editor,GuardError,Ledger,NativeOwner,OwnerConsent,Scope,Snapshot,Version};
use std::{fs,path::PathBuf,time::{SystemTime,UNIX_EPOCH}};
struct TempDir(PathBuf);
impl TempDir {
    fn new()->Self{
        let now=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let dir=std::env::temp_dir().join(format!("shuvi-a03-{}-{now}",std::process::id()));
        fs::create_dir(&dir).unwrap();
        Self(dir)
    }
}
impl Drop for TempDir{fn drop(&mut self){let _=fs::remove_dir_all(&self.0);}}
struct Consent{accept:bool,calls:usize}
impl OwnerConsent for Consent{
    fn grant(&mut self,_:&Scope)->bool{self.calls+=1;self.accept}
}
struct FakeOwner {current:Snapshot,calls:usize,fail_after:bool,no_change:bool}
impl NativeOwner for FakeOwner {
    fn snapshot(&mut self)->Result<Snapshot,String>{Ok(self.current.clone())}
    fn apply(&mut self,_action:&Action)->Result<(),String>{
        self.calls+=1;
        if !self.no_change {
            match &mut self.current.version {
                Version::MotionRevision(v)=>*v+=1,
                Version::VideoSha256(h)=>*h="b".repeat(64),
            }
        }
        if self.fail_after {Err("simulated response timeout after native mutation".into())}
        else {Ok(())}
    }
}
fn motion()->Scope{
    Scope {
        task_id:"task12345".into(),plan_hash:"a".repeat(64),
        snapshot:Snapshot{editor:Editor::Motion,project_id:"workspace:scene.ecproj".into(),
            session_id:"effect-owner-1".into(),version:Version::MotionRevision(4)},
        actions:vec![Action::MotionAddText{comp_id:2,name:"Title".into(),
            text:"नमस्ते".into(),x:12.0,y:20.0,size:44.0},
            Action::MotionSetTransform{comp_id:2,layer_id:7,kind:"opacity".into(),
                x:None,y:None,value:Some(50.0)}]
    }
}
fn video()->Scope {
    Scope{
        task_id:"taskvideo1".into(),plan_hash:"a".repeat(64),
        snapshot:Snapshot{editor:Editor::Video,project_id:"/owner/video.fcproj".into(),
            session_id:"film-owner-1".into(),version:Version::VideoSha256("a".repeat(64))},
        actions:vec![Action::VideoSplit{clip_id:4,seconds:2.0}]
    }
}
fn owner(p:&Scope)->FakeOwner{
    FakeOwner{current:p.snapshot.clone(),calls:0,fail_after:false,no_change:false}
}
#[test]
fn real_disk_reservation_survives_reopen_and_rejects_duplicate(){
    let dir=TempDir::new();let l=Ledger::new(&dir.0).unwrap();let p=motion();
    l.reserve(&p).unwrap();assert_eq!(l.reserve(&p).unwrap_err(),GuardError::AlreadyExists);
    let second=Ledger::new(&dir.0).unwrap();
    assert_eq!(second.recover(&p.task_id).unwrap(),vec!["not_started","not_started"]);
}
#[test]
fn without_real_owner_consent_no_native_edit_is_possible(){
    let dir=TempDir::new();let l=Ledger::new(&dir.0).unwrap();let p=motion();
    l.reserve(&p).unwrap();
    let mut fake=owner(&p);
    assert_eq!(l.execute(&p.task_id,0,&mut fake).unwrap_err(),GuardError::NotApproved);
    assert_eq!(fake.calls,0);
    let mut denied=Consent{accept:false,calls:0};
    assert!(!l.approve(&p.task_id,&mut denied).unwrap());
    assert_eq!(fake.calls,0);
    assert_eq!(denied.calls,1);
}
#[test]
fn single_consent_approves_multiple_ordered_edit_receipts(){
    let dir=TempDir::new();let l=Ledger::new(&dir.0).unwrap();let p=motion();
    l.reserve(&p).unwrap();
    let mut consent=Consent{accept:true,calls:0};assert!(l.approve(&p.task_id,&mut consent).unwrap());
    assert_eq!(consent.calls,1);
    let mut engine=owner(&p);
    assert_eq!(l.execute(&p.task_id,1,&mut engine).unwrap_err(),GuardError::OutOfOrder);
    let first=l.execute(&p.task_id,0,&mut engine).unwrap();
    assert!(first.native_verified);assert_eq!(first.before.version,Version::MotionRevision(4));
    assert_eq!(first.after.version,Version::MotionRevision(5));
    let second=l.execute(&p.task_id,1,&mut engine).unwrap();
    assert_eq!(second.after.version,Version::MotionRevision(6));
    assert_eq!(engine.calls,2);
    assert_eq!(l.recover(&p.task_id).unwrap(),vec!["verified","verified"]);
}
#[test]
fn restart_cannot_reapply_an_already_verified_step(){
    let dir=TempDir::new();let l=Ledger::new(&dir.0).unwrap();let p=video();
    l.reserve(&p).unwrap();l.approve(&p.task_id,&mut Consent{accept:true,calls:0}).unwrap();
    let mut engine=owner(&p);
    let first=l.execute(&p.task_id,0,&mut engine).unwrap();
    assert_eq!(first.after.version,Version::VideoSha256("b".repeat(64)));
    let restarted=Ledger::new(&dir.0).unwrap();
    assert_eq!(restarted.execute(&p.task_id,0,&mut engine).unwrap_err(),GuardError::DuplicateOrUncertain);
    assert_eq!(engine.calls,1);
}
#[test]
fn native_timeout_after_edit_is_uncertain_and_never_retried(){
    let dir=TempDir::new();let l=Ledger::new(&dir.0).unwrap();let p=motion();
    l.reserve(&p).unwrap();l.approve(&p.task_id,&mut Consent{accept:true,calls:0}).unwrap();
    let mut engine=owner(&p);engine.fail_after=true;
    assert_eq!(l.execute(&p.task_id,0,&mut engine).unwrap_err(),GuardError::NativeOutcomeUncertain);
    assert_eq!(l.recover(&p.task_id).unwrap(),vec!["uncertain","not_started"]);
    let restarted=Ledger::new(&dir.0).unwrap();engine.fail_after=false;
    assert_eq!(restarted.execute(&p.task_id,0,&mut engine).unwrap_err(),GuardError::DuplicateOrUncertain);
    assert_eq!(engine.calls,1);
}
#[test]
fn owner_project_revision_or_session_change_blocks_before_intent(){
    let dir=TempDir::new();let l=Ledger::new(&dir.0).unwrap();let p=motion();
    l.reserve(&p).unwrap();l.approve(&p.task_id,&mut Consent{accept:true,calls:0}).unwrap();
    let mut engine=owner(&p);engine.current.version=Version::MotionRevision(7);
    assert_eq!(l.execute(&p.task_id,0,&mut engine).unwrap_err(),GuardError::StaleProject);
    assert_eq!(l.recover(&p.task_id).unwrap(),vec!["not_started","not_started"]);
    assert_eq!(engine.calls,0);
    engine.current.version=Version::MotionRevision(4);
    engine.current.session_id="new-session".into();
    assert_eq!(l.execute(&p.task_id,0,&mut engine).unwrap_err(),GuardError::StaleProject);
    assert_eq!(engine.calls,0);
}
#[test]
fn false_success_without_revision_advancement_is_uncertain(){
    let dir=TempDir::new();let l=Ledger::new(&dir.0).unwrap();let p=motion();
    l.reserve(&p).unwrap();l.approve(&p.task_id,&mut Consent{accept:true,calls:0}).unwrap();
    let mut engine=owner(&p);engine.no_change=true;
    assert_eq!(l.execute(&p.task_id,0,&mut engine).unwrap_err(),GuardError::NativeOutcomeUncertain);
    assert_eq!(l.recover(&p.task_id).unwrap()[0],"uncertain");
}
#[test]
fn arbitrary_model_commands_and_cross_editor_actions_cannot_be_reserved(){
    let dir=TempDir::new();let l=Ledger::new(&dir.0).unwrap();let mut p=motion();
    p.actions.push(Action::VideoDelete{clip_id:3,ripple:false});
    assert_eq!(l.reserve(&p).unwrap_err(),GuardError::Invalid);
    p=motion();p.actions.push(Action::MotionAddEffect{comp_id:1,layer_id:1,effect:"userPlugin".into()});
    assert_eq!(l.reserve(&p).unwrap_err(),GuardError::Invalid);
    p=motion();p.task_id="../escape".into();
    assert_eq!(l.reserve(&p).unwrap_err(),GuardError::Invalid);
}
#[test]
fn non_finite_numeric_edit_is_rejected_before_persisting(){
    let dir=TempDir::new();let l=Ledger::new(&dir.0).unwrap();let mut p=motion();
    p.actions[0]=Action::MotionAddText{comp_id:1,name:"Bad".into(),text:"title".into(),
        x:f64::NAN,y:0.0,size:33.0};
    assert_eq!(l.reserve(&p).unwrap_err(),GuardError::Invalid);
}
#[test]
fn only_owner_selected_existing_journal_folder_is_accepted(){
    let root=TempDir::new();
    assert!(Ledger::new(&root.0.join("missing")).is_err());
    let l=Ledger::new(&root.0).unwrap();
    assert_eq!(l.recover("../../../wrong").unwrap_err(),GuardError::Invalid);
}
