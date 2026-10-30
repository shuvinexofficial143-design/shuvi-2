//! M09: Native EffectCraft mask feather, opacity, expansion and parameter inspect.
use shuvi_motion_bridge::{BuiltinEffect,CompositionSpec,MaskProperty,MotionBridge,ShapeKind};
fn scene()->(MotionBridge,u64,u64){
    let mut b=MotionBridge::new();
    let c=b.create_composition(&CompositionSpec{
        name:"M09 Properties".into(),width:320,height:180,fps:30.0,duration_seconds:4.0
    }).unwrap().id;
    let l=b.add_shape(c,"Plate",ShapeKind::Rectangle,160.0,90.0,
        220.0,130.0,"#557799").unwrap().id;
    (b,c,l)
}
#[test]
fn feather_and_expansion_edit_real_mask_properties_and_survive_save_reopen(){
    let folder=tempfile::tempdir().unwrap();
    let (mut b,c,l)=scene();
    let mask=b.new_polygon_mask(c,l,&[
        [-55.0,-45.0],[55.0,-45.0],[55.0,45.0],[-55.0,45.0]
    ]).unwrap();
    let a=b.mask_settings(c,l,mask.uid).unwrap();
    assert_eq!(a.feather,[0.0,0.0]);assert_eq!(a.expansion,0.0);assert_eq!(a.opacity,100.0);
    let baseline=b.render_preview(c,0.0,320,true).unwrap();
    let feather=b.set_mask_property(c,l,mask.uid,MaskProperty::Feather,18.0).unwrap();
    assert_eq!(feather.feather,[18.0,18.0]);
    let expanded=b.set_mask_property(c,l,mask.uid,MaskProperty::Expansion,12.0).unwrap();
    assert_eq!(expanded.expansion,12.0);
    let masked=b.render_preview(c,0.0,320,true).unwrap();
    assert_ne!(masked.checksum(),baseline.checksum(),"feather/expansion did not change real native pixels");
    let faded=b.set_mask_property(c,l,mask.uid,MaskProperty::Opacity,25.0).unwrap();
    assert_eq!(faded.opacity,25.0);
    let after=b.render_preview(c,0.0,320,true).unwrap();
    assert_ne!(masked.checksum(),after.checksum(),"mask opacity not reflected in native render");

    assert!(b.save_project(folder.path(),"advanced.ecproj").unwrap().verified_from_disk);
    let mut reopened=MotionBridge::new();
    reopened.open_project(folder.path(),"advanced.ecproj").unwrap();
    assert_eq!(reopened.mask_settings(c,l,mask.uid).unwrap(),faded);
    assert_eq!(reopened.render_preview(c,0.0,320,true).unwrap().rgba,after.rgba);
}
#[test]
fn effect_parameter_inspection_reads_native_values_not_ui_defaults(){
    let (mut b,c,l)=scene();
    let fx=b.add_effect(c,l,BuiltinEffect::BrightnessContrast).unwrap();
    let initial=b.effect_parameter_state(c,l,fx.uid,BuiltinEffect::BrightnessContrast,"brightness").unwrap();
    assert_eq!(initial.value,0.0);
    assert_eq!((initial.minimum,initial.maximum),(-150.0,150.0));
    b.set_effect_numeric(c,l,fx.uid,BuiltinEffect::BrightnessContrast,"brightness",80.0).unwrap();
    let changed=b.effect_parameter_state(c,l,fx.uid,BuiltinEffect::BrightnessContrast,"brightness").unwrap();
    assert_eq!(changed.value,80.0);
    assert!(b.effect_parameter_state(c,l,fx.uid,BuiltinEffect::GaussianBlur,"blurriness").is_err());
    assert!(b.effect_parameter_state(c,l,fx.uid,BuiltinEffect::BrightnessContrast,"userScript").is_err());
}
#[test]
fn advanced_mask_validation_refuses_bad_values_without_revision_change(){
    let (mut b,c,l)=scene();
    let mask=b.new_polygon_mask(c,l,&[
        [-30.0,-30.0],[30.0,-30.0],[30.0,30.0],[-30.0,30.0]
    ]).unwrap();
    let rev=b.revision();
    assert!(b.set_mask_property(c,l,mask.uid,MaskProperty::Feather,f64::NAN).is_err());
    assert!(b.set_mask_property(c,l,mask.uid,MaskProperty::Feather,-1.0).is_err());
    assert!(b.set_mask_property(c,l,mask.uid,MaskProperty::Opacity,120.0).is_err());
    assert!(b.set_mask_property(c,l,mask.uid,MaskProperty::Expansion,1000.0).is_err());
    assert!(b.set_mask_property(c,l,999999,MaskProperty::Feather,12.0).is_err());
    assert_eq!(b.revision(),rev);
}
