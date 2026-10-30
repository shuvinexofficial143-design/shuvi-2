//! M12 real undo/redo, immutable PNG frames, and fresh EffectCraft reopen.
use std::{fs,path::PathBuf,time::{SystemTime,UNIX_EPOCH}};
use serde_json::json;
use shuvi_motion_bridge::{CompositionSpec,MotionBridge,ShapeKind};
fn run()->Result<(),String>{
    let folder=std::env::var_os("SHUVI_MOTION_PROOF_DIR").map(PathBuf::from)
        .unwrap_or_else(||std::env::temp_dir().join(format!("shuvi-m12-{}",
            SystemTime::now().duration_since(UNIX_EPOCH)
                .map(|d|d.as_nanos()).unwrap_or_default())));
    fs::create_dir_all(&folder).map_err(|e|e.to_string())?;
    let mut b=MotionBridge::new();
    let comp=b.create_composition(&CompositionSpec{
        name:"M12 Native Undo Redo".into(),width:320,height:180,fps:30.0,duration_seconds:3.0
    })?.id;
    let no_shape=b.render_preview(comp,0.0,320,true)?;
    let layer=b.add_shape(comp,"Undo owner shape",ShapeKind::Rectangle,
        160.0,90.0,190.0,95.0,"#b52c61")?;
    let with_shape=b.render_preview(comp,0.0,320,true)?;
    if no_shape.rgba==with_shape.rgba{return Err("shape did not modify native pixels".into());}
    let undo=b.undo_native()?;
    let after_undo=b.render_preview(comp,0.0,320,true)?;
    if !undo.project_changed||after_undo.rgba!=no_shape.rgba{
        return Err("EffectCraft undo did not restore exact original RGBA".into());
    }
    let redo=b.redo_native()?;
    let after_redo=b.render_preview(comp,0.0,320,true)?;
    if !redo.project_changed||after_redo.rgba!=with_shape.rgba{
        return Err("EffectCraft redo did not restore exact edited RGBA".into());
    }
    if b.list_layers(comp)?.iter().all(|l|l.id!=layer.id){
        return Err("undone and redone native layer not restored by UID".into());
    }
    let save=b.save_project(&folder,"m12_undo_redo.ecproj")?;
    if !save.verified_from_disk{return Err("native .ecproj save readback failed".into());}
    drop(b);
    let mut reopened=MotionBridge::new();
    reopened.open_project(&folder,"m12_undo_redo.ecproj")?;
    if reopened.render_preview(comp,0.0,320,true)?.rgba!=after_redo.rgba{
        return Err("reopened native frame differs from original redone pixels".into());
    }
    for (name,frame) in [
        ("m12_before.png",no_shape.clone()),("m12_edit.png",with_shape.clone()),
        ("m12_undo.png",after_undo.clone()),("m12_redo.png",after_redo.clone())
    ]{
        fs::write(folder.join(name),frame.png()?).map_err(|e|e.to_string())?;
    }
    let receipt=json!({
        "ok":true,"proof":"native-effectcraft-undo-redo-fresh-reopen",
        "composition":comp,"layer":layer.id,
        "undoLabel":undo.label,"redoLabel":redo.label,
        "sourceBeforeChecksum":no_shape.checksum().to_string(),
        "editedChecksum":with_shape.checksum().to_string(),
        "undoChecksum":after_undo.checksum().to_string(),
        "redoChecksum":after_redo.checksum().to_string(),
        "undoProjectChanged":undo.project_changed,
        "redoProjectChanged":redo.project_changed,
        "diskReopenVerified":save.verified_from_disk,
        "projectBytes":save.bytes,
        "files":["m12_before.png","m12_edit.png","m12_undo.png",
                 "m12_redo.png","m12_undo_redo.ecproj"]
    });
    fs::write(folder.join("m12_receipt.json"),
        serde_json::to_vec_pretty(&receipt).map_err(|e|e.to_string())?)
        .map_err(|e|e.to_string())?;
    println!("{receipt}");
    Ok(())
}
fn main(){
    if let Err(err)=run(){eprintln!("REAL M12 UNDO/REDO FAILED: {err}");std::process::exit(1);}
}
