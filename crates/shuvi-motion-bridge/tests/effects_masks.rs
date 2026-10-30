//! M08: real EffectCraft effect & mask actions, rendered-pixel proof, file persistence.
use shuvi_motion_bridge::{BuiltinEffect,CompositionSpec,MotionBridge,ShapeKind};

fn scene()->(MotionBridge,u64,u64) {
    let mut b=MotionBridge::new();
    let c=b.create_composition(&CompositionSpec{
        name:"M08 Effects Masks Scene".into(),width:320,height:180,
        fps:30.0,duration_seconds:3.0
    }).unwrap().id;
    let l=b.add_shape(c,"Color Plate",ShapeKind::Rectangle,160.0,90.0,
        220.0,120.0,"#557799").unwrap().id;
    (b,c,l)
}
#[test]
fn native_brightness_effect_changes_real_render_and_saves_reopens(){
    let folder=tempfile::tempdir().unwrap();
    let (mut b,c,l)=scene();
    let before=b.render_preview(c,0.0,320,true).unwrap();
    let fx=b.add_effect(c,l,BuiltinEffect::BrightnessContrast).unwrap();
    assert_eq!(fx.id,"ec.color.brightnesscontrast");
    assert!(fx.enabled);
    assert!(b.set_effect_numeric(c,l,fx.uid,BuiltinEffect::BrightnessContrast,
        "brightness",75.0).is_ok());
    let after=b.render_preview(c,0.0,320,true).unwrap();
    assert_ne!(before.checksum(),after.checksum(),"native brightness effect did not alter pixels");
    assert_eq!(b.list_effects(c,l).unwrap().len(),1);
    assert!(b.set_effect_numeric(c,l,fx.uid,BuiltinEffect::GaussianBlur,
        "blurriness",10.0).is_err());
    assert!(b.set_effect_numeric(c,l,fx.uid,BuiltinEffect::BrightnessContrast,
        "unknown",10.0).is_err());
    assert!(b.set_effect_numeric(c,l,fx.uid,BuiltinEffect::BrightnessContrast,
        "brightness",f64::NAN).is_err());
    let file=b.save_project(folder.path(),"effects.ecproj").unwrap();
    assert!(file.verified_from_disk);
    let mut reopened=MotionBridge::new();
    reopened.open_project(folder.path(),"effects.ecproj").unwrap();
    assert_eq!(reopened.list_effects(c,l).unwrap(),b.list_effects(c,l).unwrap());
    assert_eq!(reopened.render_preview(c,0.0,320,true).unwrap().rgba,after.rgba);
    let off=reopened.set_effect_enabled(c,l,fx.uid,false).unwrap();
    assert!(!off.enabled);
    assert_eq!(reopened.render_preview(c,0.0,320,true).unwrap().rgba,before.rgba);
    let on=reopened.set_effect_enabled(c,l,fx.uid,true).unwrap();
    assert!(on.enabled);
    assert_eq!(reopened.render_preview(c,0.0,320,true).unwrap().rgba,after.rgba);
    reopened.remove_effect(c,l,fx.uid).unwrap();
    assert!(reopened.list_effects(c,l).unwrap().is_empty());
}
#[test]
fn native_gaussian_blur_effect_adds_editable_parameter(){
    let (mut b,c,l)=scene();
    let fx=b.add_effect(c,l,BuiltinEffect::GaussianBlur).unwrap();
    assert_eq!(fx.id,"ec.blur.gaussian");
    let v=b.set_effect_numeric(c,l,fx.uid,BuiltinEffect::GaussianBlur,
        "blurriness",15.0).unwrap();
    assert_eq!(v,15.0);
    assert_eq!(b.list_effects(c,l).unwrap().len(),1);
}
#[test]
fn editable_closed_polygon_mask_survives_native_disk_roundtrip(){
    let folder=tempfile::tempdir().unwrap();
    let (mut b,c,l)=scene();
    let base=b.render_preview(c,0.0,320,true).unwrap();
    let vertices=[[-65.0,-45.0],[65.0,-45.0],[65.0,45.0],[-65.0,45.0]];
    let mask=b.new_polygon_mask(c,l,&vertices).unwrap();
    assert!(mask.closed);
    assert_eq!(mask.vertices,vertices);
    assert_eq!(b.list_masks(c,l).unwrap().len(),1);
    let after=b.render_preview(c,0.0,320,true).unwrap();
    assert_ne!(base.checksum(),after.checksum(),"mask was not applied to compositor");
    let moved=b.set_mask_vertex(c,l,mask.uid,1,[90.0,-45.0]).unwrap();
    assert_eq!(moved.vertices[1],[90.0,-45.0]);
    let pixels=b.render_preview(c,0.0,320,true).unwrap().rgba;
    let save=b.save_project(folder.path(),"mask.ecproj").unwrap();
    assert!(save.verified_from_disk);
    let mut reopen=MotionBridge::new();
    reopen.open_project(folder.path(),"mask.ecproj").unwrap();
    assert_eq!(reopen.list_masks(c,l).unwrap(),b.list_masks(c,l).unwrap());
    assert_eq!(reopen.render_preview(c,0.0,320,true).unwrap().rgba,pixels);
    reopen.remove_mask(c,l,mask.uid).unwrap();
    assert!(reopen.list_masks(c,l).unwrap().is_empty());
    assert_eq!(reopen.render_preview(c,0.0,320,true).unwrap().rgba,base.rgba);
}
#[test]
fn invalid_mask_and_effect_inputs_cannot_mutate_project(){
    let (mut b,c,l)=scene();let rev=b.revision();
    assert!(b.new_polygon_mask(c,l,&[]).is_err());
    assert!(b.new_polygon_mask(c,l,&[[0.0,0.0],[1.0,1.0],[2.0,2.0]]).is_err());
    assert!(b.new_polygon_mask(c,l,&[[0.0,0.0],[f64::NAN,1.0],[3.0,4.0]]).is_err());
    assert_eq!(b.revision(),rev);
    let mask=b.new_polygon_mask(c,l,&[[0.0,0.0],[100.0,0.0],[100.0,80.0],[0.0,80.0]]).unwrap();
    let after=b.revision();
    assert!(b.set_mask_vertex(c,l,mask.uid,999,[0.0,0.0]).is_err());
    assert!(b.set_mask_vertex(c,l,mask.uid,0,[f64::INFINITY,0.0]).is_err());
    assert_eq!(b.revision(),after);
    assert!(b.remove_effect(c,l,900_000).is_err());
    assert_eq!(b.revision(),after);
}
