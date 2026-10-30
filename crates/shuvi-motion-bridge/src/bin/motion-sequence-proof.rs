//! Actual animated EffectCraft comp -> owner PNG sequence -> disk readback proof.
use std::{fs,path::PathBuf,time::{SystemTime,UNIX_EPOCH}};
use serde_json::json;
use shuvi_motion_bridge::{CompositionSpec,MotionBridge,ShapeKind,Property};
fn run()->Result<(),String>{
    let root=std::env::var_os("SHUVI_MOTION_PROOF_DIR").map(PathBuf::from)
        .unwrap_or_else(||std::env::temp_dir().join("shuvi-motion-native-proofs"));
    fs::create_dir_all(&root).map_err(|e|e.to_string())?;
    let suffix=SystemTime::now().duration_since(UNIX_EPOCH)
        .map_err(|e|e.to_string())?.as_nanos();
    let folder=format!("m15_frames_{suffix}");
    let mut engine=MotionBridge::new();
    let c=engine.create_composition(&CompositionSpec{
        name:"M15 Native Animation".into(),width:320,height:180,
        fps:30.0,duration_seconds:2.0,
    })?.id;
    let shape=engine.add_shape(c,"Animated Native Shape",ShapeKind::Rectangle,
        160.0,90.0,150.0,90.0,"#ee2288")?;
    engine.add_transform_key(c,shape.id,Property::Opacity,0.0,json!(100.0))?;
    engine.add_transform_key(c,shape.id,Property::Opacity,0.5,json!(0.0))?;
    engine.ease_transform_keys(c,shape.id,Property::Opacity,&[0.0,0.5])?;
    let before=engine.revision();
    let exported=engine.export_png_sequence(&root,&folder,c,0.0,16,30.0,320,true)?;
    if engine.revision()!=before{return Err("export mutated native project revision".into());}
    if exported.first_checksum==exported.last_checksum{
        return Err("native animated frames did not change real EffectCraft RGBA pixels".into());
    }
    let first=fs::read(exported.directory.join("frame_0000.png")).map_err(|e|e.to_string())?;
    let last=fs::read(exported.directory.join("frame_0015.png")).map_err(|e|e.to_string())?;
    if first==last{return Err("native first/last PNG are byte-identical despite animation".into());}
    if engine.export_png_sequence(&root,&folder,c,0.0,1,30.0,320,true).is_ok(){
        return Err("sequence export overwrote an existing owner folder".into());
    }
    let result=json!({
        "ok":true,"proof":"native-effectcraft-animated-image-sequence",
        "frames":exported.frame_count,"source":"native-effectcraft",
        "firstChecksum":exported.first_checksum.to_string(),
        "lastChecksum":exported.last_checksum.to_string(),
        "verifiedFromDisk":exported.verified_from_disk,
        "firstPngBytes":first.len(),"lastPngBytes":last.len(),
        "totalPngBytes":exported.total_png_bytes,
        "projectRevisionUnchanged":engine.revision()==before,
        "noOverwriteVerified":true,
        "directory":exported.directory,
        "manifest":"sequence.json",
    });
    fs::write(root.join("m15_sequence_receipt.json"),serde_json::to_vec_pretty(&result)
        .map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    println!("{result}");
    Ok(())
}
fn main(){
    if let Err(e)=run(){eprintln!("REAL NATIVE IMAGE SEQUENCE PROOF FAILED: {e}");std::process::exit(1);}
}
