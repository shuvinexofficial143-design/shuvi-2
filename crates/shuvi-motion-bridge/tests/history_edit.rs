//! Real EffectCraft owner undo/redo proof, with persisted project and pixel equality.
use shuvi_motion_bridge::{BuiltinEffect,CompositionSpec,MotionBridge,ShapeKind};
fn make()->(MotionBridge,u64){
    let mut b=MotionBridge::new();
    let comp=b.create_composition(&CompositionSpec{
        name:"Owner Undo Redo".into(),width:320,height:180,fps:30.0,duration_seconds:3.0
    }).unwrap().id;
    (b,comp)
}
#[test]
fn native_shape_undo_redo_reproduces_exact_rgba_pixels(){
    let (mut b,c)=make();
    let base=b.render_preview(c,0.0,320,true).unwrap().rgba;
    let shape=b.add_shape(c,"Real Undo Plate",ShapeKind::Rectangle,
        160.0,90.0,170.0,100.0,"#da1655").unwrap();
    let original=b.render_preview(c,0.0,320,true).unwrap().rgba;
    assert_ne!(base,original);
    let start=b.inspect_history();
    assert!(start.can_undo);assert!(start.undo_depth>0);
    let result=b.undo_native().unwrap();
    assert!(result.project_changed);
    assert!(result.after.can_redo);
    assert!(b.list_layers(c).unwrap().iter().all(|l|l.id!=shape.id));
    assert_eq!(b.render_preview(c,0.0,320,true).unwrap().rgba,base);
    let redo=b.redo_native().unwrap();
    assert!(redo.project_changed);
    assert!(b.list_layers(c).unwrap().iter().any(|l|l.id==shape.id));
    assert_eq!(b.render_preview(c,0.0,320,true).unwrap().rgba,original);
}
#[test]
fn effect_history_reverts_real_pixels_without_replacing_document(){
    let (mut b,c)=make();
    let layer=b.add_shape(c,"Effect Owner",ShapeKind::Rectangle,
        160.0,90.0,170.0,100.0,"#348ac2").unwrap();
    let clean=b.render_preview(c,0.0,320,true).unwrap().rgba;
    let fx=b.add_effect(c,layer.id,BuiltinEffect::BrightnessContrast).unwrap();
    b.set_effect_numeric(c,layer.id,fx.uid,BuiltinEffect::BrightnessContrast,"brightness",85.0).unwrap();
    let modified=b.render_preview(c,0.0,320,true).unwrap().rgba;
    assert_ne!(clean,modified);
    let receipt=b.undo_native().unwrap();
    assert!(receipt.project_changed);
    assert_ne!(b.render_preview(c,0.0,320,true).unwrap().rgba,modified);
    b.redo_native().unwrap();
    assert_eq!(b.render_preview(c,0.0,320,true).unwrap().rgba,modified);
    assert_eq!(b.list_effects(c,layer.id).unwrap()[0].uid,fx.uid);
}
#[test]
fn no_available_redo_is_rejected_without_mutating_native_project(){
    let (mut b,_)=make();
    let rev=b.revision();
    assert!(!b.inspect_history().can_redo);
    assert!(b.redo_native().is_err());
    assert_eq!(b.revision(),rev);
}
