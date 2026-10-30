//! M08 native proof: same pinned EffectCraft engine for effects/mask, preview and disk roundtrip.
use std::{fs,path::PathBuf,time::{SystemTime,UNIX_EPOCH}};
use serde_json::json;
use shuvi_motion_bridge::{BuiltinEffect,CompositionSpec,MotionBridge,ShapeKind};

fn run()->Result<(),String>{
    let folder=std::env::var_os("SHUVI_MOTION_PROOF_DIR").map(PathBuf::from)
        .unwrap_or_else(||std::env::temp_dir().join(format!("shuvi-m08-{}",SystemTime::now()
            .duration_since(UNIX_EPOCH).map(|d|d.as_millis()).unwrap_or_default())));
    fs::create_dir_all(&folder).map_err(|e|e.to_string())?;
    let mut e=MotionBridge::new();
    let c=e.create_composition(&CompositionSpec{
        name:"M08 Real Effects Mask".into(),width:320,height:180,fps:30.0,duration_seconds:3.0
    })?.id;
    let l=e.add_shape(c,"Original Color Plate",ShapeKind::Rectangle,
        160.0,90.0,220.0,120.0,"#557799")?.id;
    let original=e.render_preview(c,0.0,320,true)?;
    let fx=e.add_effect(c,l,BuiltinEffect::BrightnessContrast)?;
    e.set_effect_numeric(c,l,fx.uid,BuiltinEffect::BrightnessContrast,"brightness",75.0)?;
    let effected=e.render_preview(c,0.0,320,true)?;
    if original.rgba==effected.rgba{return Err("real brightness did not alter rendered pixels".into());}
    let mask=e.new_polygon_mask(c,l,&[[-65.0,-45.0],[65.0,-45.0],
        [65.0,45.0],[-65.0,45.0]])?;
    let masked=e.render_preview(c,0.0,320,true)?;
    if effected.rgba==masked.rgba{return Err("real polygon mask did not alter rendered pixels".into());}
    let save=e.save_project(&folder,"m08_effects_masks.ecproj")?;
    if !save.verified_from_disk{return Err("effect+mask save readback failed".into());}
    drop(e);
    let mut r=MotionBridge::new();
    r.open_project(&folder,"m08_effects_masks.ecproj")?;
    if r.list_effects(c,l)?.iter().all(|f|f.uid!=fx.uid)
      || r.list_masks(c,l)?.iter().all(|m|m.uid!=mask.uid)
      || r.render_preview(c,0.0,320,true)?.rgba!=masked.rgba{
        return Err("native reopened project changed masked/effected pixels".into());
    }
    for (name,frame) in [("m08_original.png",original.clone()),
        ("m08_effected.png",effected.clone()),("m08_masked.png",masked.clone())]{
        fs::write(folder.join(name),frame.png()?).map_err(|e|e.to_string())?;
    }
    let receipt=json!({"ok":true,"proof":"native-effect-mask-render-save-reopen",
        "engine":"effectcraft","compositionId":c,"layerId":l,
        "effectUid":fx.uid,"maskUid":mask.uid,"projectBytes":save.bytes,
        "originalChecksum":original.checksum().to_string(),
        "effectChecksum":effected.checksum().to_string(),
        "maskedChecksum":masked.checksum().to_string(),
        "maskVertices":mask.vertices.len(),
        "outputFiles":["m08_original.png","m08_effected.png","m08_masked.png","m08_effects_masks.ecproj"]});
    fs::write(folder.join("m08_receipt.json"),serde_json::to_vec_pretty(&receipt)
        .map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    println!("{receipt}");
    Ok(())
}
fn main(){
    if let Err(e)=run(){eprintln!("M08 NATIVE EFFECT/MASK PROOF FAILED: {e}");std::process::exit(1);}
}
