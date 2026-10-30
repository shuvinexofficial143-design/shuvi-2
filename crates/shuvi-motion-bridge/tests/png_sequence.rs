//! M15: real EffectCraft multiframe native output and non-clobber filesystem safety.
use std::{fs,path::Path};
use shuvi_motion_bridge::{CompositionSpec,MotionBridge,ShapeKind};
fn setup()->(MotionBridge,u64,std::path::PathBuf){
    let dir=std::env::temp_dir().join(format!("shuvi-m15-{}-{}",std::process::id(),
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
    fs::create_dir_all(&dir).unwrap();
    let mut engine=MotionBridge::new();
    let comp=engine.create_composition(&CompositionSpec{
        name:"M15 Native Frames".into(),width:320,height:180,fps:30.0,duration_seconds:2.0
    }).unwrap().id;
    engine.add_shape(comp,"Native Test Plate",ShapeKind::Rectangle,160.0,90.0,180.0,95.0,"#e24175").unwrap();
    (engine,comp,dir)
}
#[test]
fn renders_actual_png_sequence_with_native_disk_verified_manifest(){
    let (bridge,comp,dir)=setup();
    let before=bridge.revision();
    let receipt=bridge.export_png_sequence(&dir,"real_frames",comp,0.0,5,30.0,320,true).unwrap();
    assert!(receipt.verified_from_disk);
    assert_eq!(receipt.frame_count,5);
    assert_eq!(receipt.project_revision,before);
    assert_eq!(bridge.revision(),before,"read-only frame export changed the project");
    assert!(receipt.total_png_bytes>100);
    assert_eq!(receipt.first_checksum,bridge.render_preview(comp,0.0,320,true).unwrap().checksum());
    for index in 0..5{
        let bytes=fs::read(receipt.directory.join(format!("frame_{index:04}.png"))).unwrap();
        assert!(bytes.starts_with(b"\x89PNG\r\n\x1a\n"));
        assert_eq!(bytes,bridge.render_preview(comp,index as f64/30.0,320,true).unwrap().png().unwrap());
    }
    let manifest=fs::read_to_string(receipt.directory.join("sequence.json")).unwrap();
    let v:serde_json::Value=serde_json::from_str(&manifest).unwrap();
    assert_eq!(v["ok"],true);
    assert_eq!(v["source"],"native-effectcraft");
    assert_eq!(v["frames"],5);
    // Windows can report the SAME directory through a short DOS path (RUNNER~1)
    // and the canonical extended-length path (\\\\?\\C:\\Users\\runneradmin).
    // Compare filesystem identity, never unnormalized path display strings.
    assert_eq!(
        fs::canonicalize(&receipt.directory).unwrap(),
        fs::canonicalize(dir.join("real_frames")).unwrap(),
        "native sequence was not published at the exact owner destination"
    );
    let names=fs::read_dir(&dir).unwrap()
        .map(|e|e.unwrap().file_name().to_string_lossy().to_string())
        .collect::<Vec<_>>();
    assert_eq!(names,vec!["real_frames".to_string()],
        "a temporary staging directory escaped after successful native publish");
}
#[test]
fn rejects_existing_directory_and_out_of_bounds_without_overwriting_owner_files(){
    let (bridge,comp,dir)=setup();
    let existing=dir.join("my_frames");
    fs::create_dir(&existing).unwrap();
    let sentinel=existing.join("frame_0000.png");
    fs::write(&sentinel,b"owner has this file").unwrap();
    let revision=bridge.revision();
    assert!(bridge.export_png_sequence(&dir,"my_frames",comp,0.0,3,30.0,320,true).is_err());
    assert_eq!(fs::read(&sentinel).unwrap(),b"owner has this file");
    for name in ["../escape","invalid folder","a/b",".hidden","bad\\name"]{
        assert!(bridge.export_png_sequence(&dir,name,comp,0.0,3,30.0,320,true).is_err(),"{name}");
    }
    for (frames,fps,max_side,start) in [(0,30.0,320,0.0),(121,30.0,320,0.0),
        (60,30.0,320,1.0),(3,60.0,320,0.0),(3,30.0,1000,0.0),(3,30.0,320,f64::NAN)]{
        assert!(bridge.export_png_sequence(&dir,"not_created",comp,start,frames,fps,max_side,true).is_err());
        assert!(!Path::new(&dir.join("not_created")).exists());
    }
    assert_eq!(bridge.revision(),revision);
    let names=fs::read_dir(&dir).unwrap()
        .map(|e|e.unwrap().file_name().to_string_lossy().to_string())
        .collect::<Vec<_>>();
    assert_eq!(names,vec!["my_frames".to_string()],
        "a rejected native export left a visible partial/staging output");
}
