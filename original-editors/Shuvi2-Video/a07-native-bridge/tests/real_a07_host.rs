//! V-AI09 real FilmCraft in-memory Session + pinned canonical A07 SQLite ledger.
//! Only the test's OwnerConsent fixture is fake: NOT proof of Windows UI click.
use filmcraft_engine::{Session, shuvi_ai_readonly};
use serde_json::{json,Value};
use shuvi_ai_provider::{
    guard::{NativeOwner, OwnerConsent, Scope, GuardError, Version},
    host::{GuardedHost, OwnerConsentRequest, TaskBinding},
    ipc::GuardedWireRequest,
    plan::{ReserveWire, independently_hash},
    transactional::TransactionalLedger,
};
use shuvi_video_a07_native_bridge::VideoOwner;
use std::{fs,path::PathBuf,time::{SystemTime,UNIX_EPOCH}};

struct TempDb(PathBuf);
impl TempDb {
    fn new()->Self{
        let n=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let p=std::env::temp_dir().join(format!("a07-filmcraft-{}-{n}",std::process::id()));
        fs::create_dir(&p).unwrap();
        Self(p)
    }
    fn open(&self)->TransactionalLedger {
        TransactionalLedger::open(&self.0.join("native.sqlite3")).unwrap()
    }
}
impl Drop for TempDb {
    fn drop(&mut self){let _=fs::remove_dir_all(&self.0);}
}
struct TestConsent{clicks:u32,allow:bool}
impl OwnerConsent for TestConsent {
    fn grant(&mut self,scope:&Scope)->bool{
        self.clicks+=1;
        assert!(scope.instruction.contains("Split"));
        assert!(scope.actions.len()==1);
        self.allow
    }
}
fn make_session()->Session {
    let mut session=Session::default();
    session.execute("file.openDemoProject",json!({})).unwrap();
    session
}
fn plan(owner:&mut VideoOwner<'_>,clip_id:u64,task_id:&str)->(Value,ReserveWire,OwnerConsentRequest,TaskBinding){
    let s=owner.snapshot().unwrap();
    let snapshot=match s.version {
        Version::VideoSha256(ref v)=>json!({
            "engine":"video","projectId":s.project_id,"sessionId":s.session_id,"version":v
        }),
        _=>panic!("expected canonical native video SHA"),
    };
    let p=json!({"taskId":task_id,"instruction":"Split the exact native clip at two seconds",
        "snapshot":snapshot,"actions":[{"type":"video.split","clipId":clip_id,"seconds":2.0}]});
    let h=independently_hash(&p).unwrap();
    let reserve=ReserveWire{task_id:task_id.into(),plan_hash:h.clone(),project:snapshot.clone(),plan:p.clone()};
    let consent=OwnerConsentRequest{task_id:task_id.into(),plan_hash:h.clone()};
    let binding=TaskBinding{task_id:task_id.into(),plan_hash:h};
    (p,reserve,consent,binding)
}
fn wire(p:&Value,version:&str)->GuardedWireRequest{
    serde_json::from_value(json!({
      "taskId":p["taskId"],"stepIndex":0,"idempotencyKey":"f".repeat(64),
      "expectedSnapshot":{"engine":"video","projectId":p["snapshot"]["projectId"],
         "sessionId":p["snapshot"]["sessionId"],"version":version},
      "action":p["actions"][0]
    })).unwrap()
}
#[test]
fn real_native_filmcraft_split_is_guarded_by_actual_sqlite_a07_receipt_and_reopen(){
    let tmp=TempDb::new();
    let mut editor=make_session();
    let first=shuvi_ai_readonly::snapshot(&mut editor).unwrap();
    let clip_id=first.sequence.as_ref().unwrap()["video"][0]["items"].as_array().unwrap()
        .iter().find(|x|x["start"].as_i64().unwrap_or(-1)<2*filmcraft_time::TICKS_PER_SECOND
            && 2*filmcraft_time::TICKS_PER_SECOND<x["end"].as_i64().unwrap_or(-1))
        .and_then(|x|x["clip"].as_u64()).unwrap();
    let mut owner=VideoOwner::new(&mut editor,"trusted-filmcraft-project".into(),"native-owner-session-01".into()).unwrap();
    let prior_clips=owner.read_native_clip_count().unwrap();
    let (p,r,c,b)=plan(&mut owner,clip_id,"nativefilmtask0001");
    let mut ledger=tmp.open();
    {
        let mut host=GuardedHost{ledger:&mut ledger,owner:&mut owner};
        assert_eq!(host.reserve(&r).unwrap()["reserved"],true);
        // Exactly one explicit test-fixture owner click. PRODUCTION owner UI
        // remains unconnected and must not use this fixture.
        let mut test_consent=TestConsent{clicks:0,allow:true};
        assert_eq!(host.request_consent(&c,&mut test_consent).unwrap()["granted"],true);
        assert_eq!(test_consent.clicks,1);
        let before_sha=p["snapshot"]["version"].as_str().unwrap();
        let result=host.execute(wire(&p,before_sha)).unwrap();
        assert_eq!(result["nativeVerified"],true);
        assert_eq!(result["guarded"],true);
        assert_ne!(result["after"]["version"],before_sha);
        assert_eq!(result["objectProofSha256"].as_str().unwrap().len(),64);
        assert_eq!(host.recover(&b).unwrap()["steps"],json!(["verified"]));
        assert_eq!(host.execute(wire(&p,before_sha)).unwrap_err(),GuardError::OutOfOrder);
        assert_eq!(host.cancel(&b).unwrap()["state"],"already_complete");
    }
    assert_eq!(owner.read_native_clip_count().unwrap(),prior_clips+1);
    drop(owner);
    let path=tmp.0.join("verified-clip.fcproj");
    editor.execute("file.saveAs",json!({"path":path.to_string_lossy()})).unwrap();
    assert!(path.metadata().unwrap().len()>0);
    let mut reopened=Session::default();
    reopened.execute("file.open",json!({"path":path.to_string_lossy()})).unwrap();
    let after=shuvi_ai_readonly::snapshot(&mut reopened).unwrap();
    let before_count=first.sequence.as_ref().unwrap()["video"][0]["items"].as_array().unwrap().len();
    let after_count=after.sequence.as_ref().unwrap()["video"][0]["items"].as_array().unwrap().len();
    assert_eq!(after_count,before_count+1);
    assert!(after.sequence.as_ref().unwrap()["video"][0]["items"].as_array().unwrap()
      .iter().any(|c|c["clip"].as_u64()==Some(clip_id)));
    let receipts=tmp.open().recovery_bound(&b.task_id,&b.plan_hash).unwrap();
    assert_eq!(receipts,vec!["verified"]);
}
#[test]
fn canonical_a07_denied_consent_and_duplicate_plan_never_change_real_filmcraft(){
    let tmp=TempDb::new();
    let mut session=make_session();
    let clip=session.active_sequence().unwrap().video_tracks[0].items[0].id.0;
    let mut owner=VideoOwner::new(&mut session,"trusted-filmcraft-project".into(),"native-owner-session-02".into()).unwrap();
    let before=owner.snapshot().unwrap();
    let (p,r,c,b)=plan(&mut owner,clip,"nativefilmtask0002");
    let mut db=tmp.open();
    let mut host=GuardedHost{ledger:&mut db,owner:&mut owner};
    assert!(host.reserve(&r).is_ok());
    assert_eq!(host.reserve(&r).unwrap_err(),GuardError::AlreadyExists);
    let mut denied=TestConsent{clicks:0,allow:false};
    assert_eq!(host.request_consent(&c,&mut denied).unwrap()["granted"],false);
    assert_eq!(denied.clicks,1);
    assert_eq!(host.execute(wire(&p,p["snapshot"]["version"].as_str().unwrap())).unwrap_err(),GuardError::NotApproved);
    assert_eq!(host.owner.snapshot().unwrap(),before);
    assert_eq!(host.recover(&b).unwrap()["steps"],json!(["not_started"]));
}
#[test]
fn canonical_a07_rejects_untrusted_native_identity_and_non_split_actions(){
    let mut editor=make_session();
    assert!(VideoOwner::new(&mut editor,"abc".into(),"s".into()).is_err());
    let mut owner=VideoOwner::new(&mut editor,"native-1".into(),"session-native-03".into()).unwrap();
    let forbidden:shuvi_ai_provider::guard::Action=serde_json::from_value(json!({
        "type":"videoDelete","clipId":42,"ripple":false
    })).unwrap();
    assert_eq!(owner.preflight_action(&forbidden).unwrap(),false);
    assert!(owner.apply(&forbidden).is_err());
}
