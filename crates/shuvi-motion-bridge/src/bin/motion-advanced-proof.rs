//! M09 proof: actual native feather/expansion/opacity pixel changes and disk persistence.
use std::{fs,path::PathBuf,time::{SystemTime,UNIX_EPOCH}};
use serde_json::json;
use shuvi_motion_bridge::{BuiltinEffect,CompositionSpec,MaskProperty,MotionBridge,ShapeKind};
fn run()->Result<(),String>{
    let folder=std::env::var_os("SHUVI_MOTION_PROOF_DIR").map(PathBuf::from)
        .unwrap_or_else(||std::env::temp_dir().join(format!("shuvi-m09-{}",SystemTime::now()
            .duration_since(UNIX_EPOCH).map(|d|d.as_nanos()).unwrap_or_default())));
    fs::create_dir_all(&folder).map_err(|e|format!("proof folder: {e}"))?;
    let mut b=MotionBridge::new();
    let c=b.create_composition(&CompositionSpec{
        name:"M09 Native Advanced Masks".into(),width:320,height:180,
        fps:30.0,duration_seconds:4.0
    })?.id;
    let l=b.add_shape(c,"M09 Layer",ShapeKind::Rectangle,160.0,90.0,
        220.0,135.0,"#557799")?.id;
    let effect=b.add_effect(c,l,BuiltinEffect::BrightnessContrast)?;
    b.set_effect_numeric(c,l,effect.uid,BuiltinEffect::BrightnessContrast,"brightness",70.0)?;
    let inspect=b.effect_parameter_state(c,l,effect.uid,BuiltinEffect::BrightnessContrast,"brightness")?;
    if inspect.value!=70.0{return Err("native brightness inspection differs".into());}
    let mask=b.new_polygon_mask(c,l,&[
        [-55.0,-42.0],[55.0,-42.0],[55.0,42.0],[-55.0,42.0]
    ])?;
    let hard=b.render_preview(c,0.0,320,true)?;
    let feather=b.set_mask_property(c,l,mask.uid,MaskProperty::Feather,22.0)?;
    let expanded=b.set_mask_property(c,l,mask.uid,MaskProperty::Expansion,9.0)?;
    if feather.feather!=[22.0,22.0]||expanded.expansion!=9.0{
        return Err("native feather/expansion readback mismatch".into());
    }
    let soft=b.render_preview(c,0.0,320,true)?;
    if hard.rgba==soft.rgba{return Err("native feather/expansion did not alter RGBA pixels".into());}
    let faded=b.set_mask_property(c,l,mask.uid,MaskProperty::Opacity,20.0)?;
    if faded.opacity!=20.0{return Err("native mask opacity differs".into());}
    let translucent=b.render_preview(c,0.0,320,true)?;
    if soft.rgba==translucent.rgba{return Err("native mask opacity did not alter pixels".into());}
    let file=b.save_project(&folder,"m09_advanced.ecproj")?;
    if !file.verified_from_disk{return Err("native project save readback failed".into());}
    drop(b);
    let mut reopened=MotionBridge::new();
    reopened.open_project(&folder,"m09_advanced.ecproj")?;
    if reopened.mask_settings(c,l,mask.uid)?!=faded
        ||reopened.effect_parameter_state(c,l,effect.uid,BuiltinEffect::BrightnessContrast,"brightness")?.value!=70.0
        ||reopened.render_preview(c,0.0,320,true)?.rgba!=translucent.rgba {
        return Err("native project persisted wrong mask/effect/pixels".into());
    }
    for(name,frame)in[
        ("m09_hard.png",hard.clone()),("m09_soft.png",soft.clone()),
        ("m09_translucent.png",translucent.clone())
    ]{
        fs::write(folder.join(name),frame.png()?).map_err(|e|e.to_string())?;
    }
    let exported=reopened.export_png_frame(&folder,"m09_verified_export.png",c,0.0,320,true)?;
    if !exported.verified_from_disk{return Err("native export verification failed".into());}
    let receipt=json!({
        "ok":true,"proof":"real-feather-expansion-opacity-native-reopen",
        "engine":"effectcraft","composition":c,"layer":l,"maskUid":mask.uid,
        "effectUid":effect.uid,"effectBrightness":inspect.value,
        "feather":faded.feather,"expansion":faded.expansion,"maskOpacity":faded.opacity,
        "hardChecksum":hard.checksum().to_string(),
        "softChecksum":soft.checksum().to_string(),
        "translucentChecksum":translucent.checksum().to_string(),
        "projectBytes":file.bytes,"exportBytes":exported.bytes,
        "files":["m09_hard.png","m09_soft.png","m09_translucent.png",
            "m09_verified_export.png","m09_advanced.ecproj"]
    });
    fs::write(folder.join("m09_receipt.json"),
        serde_json::to_vec_pretty(&receipt).map_err(|e|e.to_string())?)
        .map_err(|e|e.to_string())?;
    println!("{receipt}");
    Ok(())
}
fn main(){if let Err(e)=run(){eprintln!("M09 native advanced mask proof FAILED: {e}");std::process::exit(1);}}
