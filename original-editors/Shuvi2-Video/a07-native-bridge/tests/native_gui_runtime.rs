//! Actual production FilmcraftApp + A07 native runtime host integration.
//! These are original GUI, native Session and SQLite tests, not model tests.
use filmcraft_engine::{Session,shuvi_ai_readonly};
use filmcraft_ui_egui::{FilmcraftApp,menus};
use serde_json::json;
use shuvi_ai_provider::{
    guard::Version,
    host::TaskBinding,
    plan::{ReserveWire,independently_hash},
};
use shuvi_video_a07_native_bridge::gui_runtime::NativeGuiA07Runtime;
use std::{fs,sync::atomic::{AtomicU64,Ordering},time::{SystemTime,UNIX_EPOCH}};
static TEST_DB:AtomicU64=AtomicU64::new(1);

fn with_test_db<T>(f:impl FnOnce(&std::path::Path)->T)->T {
    let now=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let root=std::env::temp_dir().join(format!("shuvi-a21-{}-{}-{}",
        std::process::id(),now,TEST_DB.fetch_add(1,Ordering::Relaxed)));
    fs::create_dir(&root).unwrap();
    let value=f(&root);
    fs::remove_dir_all(root).unwrap();
    value
}
fn app()->FilmcraftApp{
    let mut native=Session::default();
    native.execute("file.openDemoProject",json!({})).unwrap();
    FilmcraftApp::new(native)
}
fn plan(app:&mut FilmcraftApp,id:&str,at:f64)
    ->(ReserveWire,TaskBinding)
{
    let native=shuvi_ai_readonly::snapshot(&mut app.session).unwrap();
    let tick=(at*filmcraft_time::TICKS_PER_SECOND as f64) as i64;
    let clip=native.sequence.as_ref().unwrap()["video"][0]["items"].as_array().unwrap()
        .iter().find(|v|v["start"].as_i64().unwrap_or(-1)<tick
            && tick<v["end"].as_i64().unwrap_or(-1))
        .and_then(|v|v["clip"].as_u64()).unwrap();
    let (project_id,session_id)=app.shuvi_trusted_a07_identity();
    let snapshot=json!({"engine":"video","projectId":project_id,
        "sessionId":session_id,"version":native.project_sha256});
    let body=json!({"taskId":id,
        "instruction":"Reserve an exact native FilmCraft clip, without editing",
        "snapshot":snapshot,
        "actions":[{"type":"video.split","clipId":clip,"seconds":at}]
    });
    let digest=independently_hash(&body).unwrap();
    let req=ReserveWire{task_id:id.into(),plan_hash:digest.clone(),
        project:snapshot,plan:body};
    let binding=TaskBinding{task_id:id.into(),plan_hash:digest};
    (req,binding)
}

#[test]
fn real_production_gui_a07_runtime_reserve_recover_is_durable_and_read_only(){
    with_test_db(|folder|{
        let db=folder.join("native.sqlite3");
        let mut original=app();
        let (req,binding)=plan(&mut original,"native-a21-gui-01",2.0);
        let before=original.session.revision;
        let mut host=NativeGuiA07Runtime::open_native_private_ledger(&db).unwrap();
        let snapshot=host.snapshot(&mut original).unwrap();
        assert_eq!(snapshot.project_id,req.project["projectId"]);
        assert!(matches!(snapshot.version,Version::VideoSha256(_)));
        assert_eq!(host.reserve(&mut original,&req).unwrap()["reserved"],true);
        assert_eq!(original.session.revision,before);
        assert_eq!(host.recover(&mut original,&binding).unwrap()["steps"],
            json!(["not_started"]));
        assert!(!NativeGuiA07Runtime::model_editing_enabled());
        drop(host);
        let mut reopened=NativeGuiA07Runtime::open_native_private_ledger(&db).unwrap();
        assert_eq!(reopened.recover(&mut original,&binding).unwrap()["steps"],
            json!(["not_started"]));
        // Manual FilmCraft editing is still the original editable Session.
        menus::invoke(&mut original,&egui::Context::default(),"file.newSequence",
            json!({"name":"manual edit remains available","width":320,"height":240}))
            .unwrap();
        assert!(original.session.revision>before);
    });
}

#[test]
fn real_native_gui_adapter_denies_old_approval_scope_after_project_switch(){
    with_test_db(|folder|{
        let mut original=app();
        let (reserve,binding)=plan(&mut original,"native-a21-gui-02",2.0);
        let mut host=NativeGuiA07Runtime::open_native_private_ledger(
            &folder.join("native.sqlite3")).unwrap();
        host.reserve(&mut original,&reserve).unwrap();
        // Original manual UI changes actual editor context. New canonical
        // owner identity MUST be different on the next host operation.
        menus::invoke(&mut original,&egui::Context::default(),"file.newSequence",
            json!({"name":"new document context","width":320,"height":240})).unwrap();
        assert_ne!(host.snapshot(&mut original).unwrap().session_id,
            reserve.project["sessionId"].as_str().unwrap());
        // Read-only history is still available and identity-scoped.
        let state=host.task_history(&mut original).unwrap();
        assert_eq!(state["nativeOwnerBound"],true);
        // A07 recovery is only diagnostic; it does not replay any action.
        assert_eq!(host.recover(&mut original,&binding).unwrap()["steps"],
            json!(["not_started"]));
    });
}
