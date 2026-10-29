//! Windows headless real EffectCraft editing + animation + PNG proof output.
use std::{fs,path::PathBuf};
use serde_json::json;
use shuvi_motion_bridge::{CompositionSpec,MotionBridge,Property,ShapeKind,Transform};

fn run()->Result<(),String>{
    let folder=std::env::var_os("SHUVI_MOTION_PROOF_DIR")
        .map(PathBuf::from).unwrap_or_else(||std::env::temp_dir().join("shuvi-motion-editor-proof"));
    fs::create_dir_all(&folder).map_err(|e|e.to_string())?;
    let mut b=MotionBridge::new();
    let comp=b.create_composition(&CompositionSpec{
        name:"Shuvi Motion Verified Scene".into(),width:640,height:360,
        fps:30.0,duration_seconds:3.0
    })?;
    let text=b.add_text(comp.id,"Shuvi Motion Title","Shuvi EffectCraft Motion",
        320.0,80.0,40.0)?;
    let shape=b.add_shape(comp.id,"Animated Shape",ShapeKind::Rectangle,
        320.0,220.0,280.0,130.0,"#00ccff")?;
    b.set_transform(comp.id,shape.id,Transform::Rotation(15.0))?;
    b.set_transform(comp.id,shape.id,Transform::Scale{x:125.0,y:95.0})?;
    b.add_transform_key(comp.id,shape.id,Property::Opacity,0.0,json!(100.0))?;
    b.add_transform_key(comp.id,shape.id,Property::Opacity,1.0,json!(0.0))?;
    let eased=b.ease_transform_keys(comp.id,shape.id,Property::Opacity,&[0.0,1.0])?;
    if eased["keys"].as_array().is_none_or(|a|a.len()!=2 ||
        a.iter().any(|k|k["in"]!="Bezier"||k["out"]!="Bezier")) {
        return Err("native graph easing verification failed".into());
    }
    let before=b.render_preview(comp.id,0.0,640,true)?;
    let after=b.render_preview(comp.id,1.0,640,true)?;
    if before.visible_pixels()==0||before.checksum()==after.checksum(){
        return Err("real native compositor output did not change across keyframes".into());
    }
    let save=b.save_project(&folder,"shuvi_motion_scene.ecproj")?;
    if !save.verified_from_disk||save.bytes==0{return Err("disk save not verified".into());}

    // Reopen physically saved source in a different EffectCraft Session.
    drop(b);
    let mut reopened=MotionBridge::new();
    reopened.open_project(&folder,"shuvi_motion_scene.ecproj")?;
    if reopened.list_layers(comp.id)?.len()!=2
        || reopened.inspect_layer(comp.id,text.id)?.kind!="Text"
        || reopened.inspect_layer(comp.id,shape.id)?.kind!="Shape"
        || reopened.render_preview(comp.id,0.0,640,true)?.rgba!=before.rgba
        || reopened.render_preview(comp.id,1.0,640,true)?.rgba!=after.rgba {
        return Err("reopened native layers or compositor pixels differ".into());
    }
    fs::write(folder.join("frame_t0.png"),before.png()?).map_err(|e|e.to_string())?;
    fs::write(folder.join("frame_t1.png"),after.png()?).map_err(|e|e.to_string())?;
    let receipt=json!({
        "ok":true,"engine":"effectcraft","proof":"native-layers-keys-render-save-reopen",
        "composition":{"id":comp.id,"width":640,"height":360,"fps":30,"durationSeconds":3},
        "textLayerId":text.id,"shapeLayerId":shape.id,
        "keyframes":2,"easing":"Bezier",
        "projectBytes":save.bytes,"frame0Checksum":before.checksum(),
        "frame1Checksum":after.checksum(),"frame0VisiblePixels":before.visible_pixels(),
        "frame1VisiblePixels":after.visible_pixels(),"outputFiles":[
            "shuvi_motion_scene.ecproj","frame_t0.png","frame_t1.png"]
    });
    fs::write(folder.join("receipt.json"),serde_json::to_vec_pretty(&receipt)
        .map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    println!("{receipt}");
    Ok(())
}
fn main(){
    if let Err(e)=run(){
        eprintln!("REAL MOTION EDITOR PROOF FAILED: {e}");
        std::process::exit(1)
    }
}
