//! M09 real mask feather/expansion/opacity and effect parameter readback.
//! No untrusted arbitrary property paths: all names are strictly allowlisted.
use effectcraft_engine::project::{ItemId,LayerId};
use effectcraft_engine::keyframe::Value as NativeValue;
use serde_json::{json,Value};
use crate::{BuiltinEffect,MotionBridge};

#[derive(Debug,Clone,PartialEq)]
pub struct MaskSettings {
    pub uid:u64,pub feather:[f64;2],pub expansion:f64,pub opacity:f64,
}
#[derive(Debug,Clone,PartialEq)]
pub struct EffectParameterState {
    pub uid:u64,pub parameter:String,pub value:f64,
    pub minimum:f64,pub maximum:f64,
}
#[derive(Debug,Clone,Copy,PartialEq,Eq)]
pub enum MaskProperty { Feather, Expansion, Opacity }
impl MaskProperty {
    fn name(self)->&'static str { match self {
        Self::Feather=>"feather",Self::Expansion=>"expansion",Self::Opacity=>"opacity"
    }}
}
fn mask_group<'a>(e:&'a MotionBridge,comp:u64,layer:u64,uid:u64)
 -> Result<(&'a effectcraft_engine::project::PropGroup,usize),String>{
    let c=e.session.project.comp(ItemId(comp)).ok_or("composition missing")?;
    let l=c.layer(LayerId(layer)).ok_or("layer missing")?;
    let masks=l.masks().ok_or("layer has no masks")?;
    let index=masks.groups().position(|g|g.uid==uid).ok_or("mask UID not found")?;
    let g=masks.groups().nth(index).ok_or("mask index not found")?;
    Ok((g,index+1))
}
impl MotionBridge {
    pub fn mask_settings(&self,comp:u64,layer:u64,uid:u64)->Result<MaskSettings,String>{
        let (g,_)=mask_group(self,comp,layer,uid)?;
        let vec=g.get("feather").ok_or("mask feather absent")?.value.to_json();
        let a=vec.as_array().ok_or("feather is not numeric array")?;
        if a.len()!=2{return Err("mask feather has invalid dimensions".into());}
        let feather=[a[0].as_f64().ok_or("feather x is not numeric")?,
                     a[1].as_f64().ok_or("feather y is not numeric")?];
        let expansion=g.get("expansion").and_then(|p|p.value.to_json().as_f64())
            .ok_or("mask expansion missing")?;
        let opacity=g.get("opacity").and_then(|p|p.value.to_json().as_f64())
            .ok_or("mask opacity missing")?;
        Ok(MaskSettings{uid,feather,expansion,opacity})
    }
    /// Update only one native mask property, with full Project readback and UID integrity.
    pub fn set_mask_property(&mut self,comp:u64,layer:u64,uid:u64,
        kind:MaskProperty,value:f64)->Result<MaskSettings,String>{
        let (min,max)=match kind{
            MaskProperty::Feather=>(0.0,250.0),
            MaskProperty::Expansion=>(-250.0,250.0),
            MaskProperty::Opacity=>(0.0,100.0),
        };
        if !value.is_finite()||value<min||value>max{
            return Err(format!("{} must be finite in {min}..{max}",kind.name()));
        }
        let (_,index)=mask_group(self,comp,layer,uid)?;
        let path=format!("masks/#{index}/{}",kind.name());
        let val=if kind==MaskProperty::Feather {json!([value,value])}else{json!(value)};
        self.session.execute_checked("prop.set",json!({
            "comp":comp,"layer":layer,"path":path,"value":val
        })).map_err(|e|format!("EffectCraft mask property update failed: {e}"))?;
        let state=self.mask_settings(comp,layer,uid)?;
        let actual=match kind{
            MaskProperty::Feather=>{
                if (state.feather[0]-value).abs()>1e-6||(state.feather[1]-value).abs()>1e-6{
                    return Err("native mask feather readback mismatch".into());
                }
                value
            },
            MaskProperty::Expansion=>state.expansion,
            MaskProperty::Opacity=>state.opacity,
        };
        if (actual-value).abs()>1e-6{return Err("native mask property readback mismatch".into());}
        Ok(state)
    }
    /// Read actual EffectCraft parameter values rather than guess from UI input.
    pub fn effect_parameter_state(&self,comp:u64,layer:u64,uid:u64,
        kind:BuiltinEffect,parameter:&str)->Result<EffectParameterState,String>{
        let (min,max)=match (kind,parameter){
            (BuiltinEffect::GaussianBlur,"blurriness")=>(0.0,100.0),
            (BuiltinEffect::BrightnessContrast,"brightness")=>(-150.0,150.0),
            (BuiltinEffect::BrightnessContrast,"contrast")=>(-100.0,100.0),
            _=>return Err("effect parameter is not in approved catalog".into())
        };
        let c=self.session.project.comp(ItemId(comp)).ok_or("comp missing")?;
        let l=c.layer(LayerId(layer)).ok_or("layer missing")?;
        let fx=l.effects().ok_or("effects missing")?.groups()
            .find(|g|g.uid==uid&&g.match_id==kind.id()).ok_or("effect UID/kind mismatch")?;
        let p=fx.get(parameter).ok_or("native effect parameter absent")?;
        let NativeValue::Scalar(value)=p.value else{
            return Err("native effect parameter has unexpected type".into())
        };
        Ok(EffectParameterState{uid,parameter:parameter.into(),value,minimum:min,maximum:max})
    }
}
