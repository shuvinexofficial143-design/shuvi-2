//! Actual EffectCraft layer + keyframe + compositor + file persistence integration.
use shuvi_motion_bridge::{CompositionSpec,MotionBridge,Property,ShapeKind,Transform};
use serde_json::json;

fn composition(bridge:&mut MotionBridge)->u64 {
    bridge.create_composition(&CompositionSpec{
        name:"Shuvi Motion Scene".into(),width:640,height:360,
        fps:30.0,duration_seconds:3.0
    }).unwrap().id
}

#[test]
fn native_text_and_shape_are_editable_in_one_comp() {
    let mut b=MotionBridge::new();
    let c=composition(&mut b);
    let t=b.add_text(c,"HindiTitle","नमस्ते Shuvi",320.0,110.0,48.0).unwrap();
    let s=b.add_shape(c,"Rectangle",ShapeKind::Rectangle,320.0,220.0,
        280.0,100.0,"#00ff77").unwrap();
    assert_eq!(t.kind,"Text");
    assert_eq!(s.kind,"Shape");
    assert_ne!(t.id,s.id);
    assert_eq!(b.list_layers(c).unwrap().len(),2);
    assert!(b.is_dirty());
    assert!(b.add_text(c,"HindiTitle","duplicate",1.0,1.0,18.0).is_err());
}

#[test]
fn native_transforms_and_properties_have_real_readback() {
    let mut b=MotionBridge::new();
    let c=composition(&mut b);
    let l=b.add_shape(c,"Moving",ShapeKind::Ellipse,210.0,160.0,
        90.0,90.0,"#ff9900").unwrap().id;
    let position=b.set_transform(c,l,Transform::Position{x:280.0,y:130.0}).unwrap();
    assert_eq!(&position.position[..2],&[280.0,130.0]);
    let scale=b.set_transform(c,l,Transform::Scale{x:150.0,y:80.0}).unwrap();
    assert_eq!(&scale.scale[..2],&[150.0,80.0]);
    assert_eq!(b.set_transform(c,l,Transform::Rotation(45.0)).unwrap().rotation,45.0);
    assert_eq!(b.set_transform(c,l,Transform::Opacity(75.0)).unwrap().opacity,75.0);
    assert_eq!(b.property_state(c,l,Property::Rotation,0.0).unwrap()["value"],json!(45.0));
    assert!(b.set_transform(c,l,Transform::Opacity(200.0)).is_err());
    assert!(b.set_transform(c,l,Transform::Rotation(f64::NAN)).is_err());
    assert!(b.set_transform(c,l,Transform::Position{x:f64::INFINITY,y:0.0}).is_err());
}

#[test]
fn native_keyframe_times_values_and_easy_ease_survive_disk() {
    let folder=tempfile::tempdir().unwrap();
    let mut b=MotionBridge::new();
    let c=composition(&mut b);
    let l=b.add_shape(c,"Animated",ShapeKind::Rectangle,320.0,180.0,
        240.0,140.0,"#2299ff").unwrap().id;
    b.add_transform_key(c,l,Property::Opacity,0.0,json!(100.0)).unwrap();
    b.add_transform_key(c,l,Property::Opacity,2.0,json!(0.0)).unwrap();
    let linear=b.property_state(c,l,Property::Opacity,1.0).unwrap();
    assert_eq!(linear["keys"].as_array().unwrap().len(),2);
    assert!(linear["value"].as_f64().unwrap()<100.0);
    assert!(linear["value"].as_f64().unwrap()>0.0);

    let eased=b.ease_transform_keys(c,l,Property::Opacity,&[0.0,2.0]).unwrap();
    let keys=eased["keys"].as_array().unwrap();
    assert_eq!(keys.len(),2);
    assert!(keys.iter().all(|k|k["in"]=="Bezier"&&k["out"]=="Bezier"));
    assert!(b.add_transform_key(c,l,Property::Opacity,-1.0,json!(1.0)).is_err());
    let before=b.property_state(c,l,Property::Opacity,1.0).unwrap();
    let preview=b.render_preview(c,1.0,320,true).unwrap();
    assert_eq!(preview.width,320);
    assert_eq!(preview.height,180);

    let saved=b.save_project(folder.path(),"animated.ecproj").unwrap();
    assert!(saved.verified_from_disk);
    let mut reopened=MotionBridge::new();
    reopened.open_project(folder.path(),"animated.ecproj").unwrap();
    let after=reopened.property_state(c,l,Property::Opacity,1.0).unwrap();
    assert_eq!(before["keys"],after["keys"]);
    assert_eq!(before["value"],after["value"]);
    assert_eq!(preview.rgba,reopened.render_preview(c,1.0,320,true).unwrap().rgba);
}

#[test]
fn native_compositor_outputs_real_alpha_pixels_and_valid_png() {
    let mut b=MotionBridge::new();
    let c=composition(&mut b);
    let l=b.add_shape(c,"Visible",ShapeKind::Rectangle,320.0,180.0,
        300.0,180.0,"#ff0066").unwrap().id;
    let frame=b.render_preview(c,0.0,320,true).unwrap();
    assert_eq!((frame.width,frame.height),(320,180));
    assert!(frame.visible_pixels()>0,"native compositor drew no visible shape pixels");
    assert!(frame.visible_pixels()<frame.rgba.len()/4,"no transparent background outside shape");
    let png=frame.png().unwrap();
    assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));
    let decoded=image::load_from_memory(&png).unwrap().to_rgba8();
    assert_eq!(decoded.dimensions(),(320,180));
    assert_eq!(decoded.into_raw(),frame.rgba);

    b.add_transform_key(c,l,Property::Opacity,0.0,json!(100.0)).unwrap();
    b.add_transform_key(c,l,Property::Opacity,1.0,json!(0.0)).unwrap();
    let at_zero=b.render_preview(c,0.0,320,true).unwrap();
    let at_one=b.render_preview(c,1.0,320,true).unwrap();
    assert_ne!(at_zero.checksum(),at_one.checksum(),"opacity animation did not alter native pixels");
    assert!(at_one.visible_pixels()<at_zero.visible_pixels());
    assert!(b.render_preview(c,3.0,320,true).is_err());
    assert!(b.render_preview(c,0.0,5000,true).is_err());
}

#[test]
fn invalid_layer_inputs_do_not_mutate_project() {
    let mut b=MotionBridge::new();
    let c=composition(&mut b);
    let before=b.revision();
    assert!(b.add_shape(c,"Unsafe",ShapeKind::Star,100.0,100.0,20.0,20.0,"bad").is_err());
    assert!(b.add_text(c,"Bad","",0.0,0.0,32.0).is_err());
    assert!(b.add_text(c,"Bad","test",0.0,0.0,f64::NAN).is_err());
    assert_eq!(before,b.revision());
    assert!(b.list_layers(c).unwrap().is_empty());
}
