//! M08: safe typed effects and editable Bezier polygon masks over the pinned native engine.
//! Only a reviewed allowlist is accessible; arbitrary plugins/expressions are NOT exposed.
use effectcraft_engine::project::{ItemId,LayerId};
use effectcraft_engine::keyframe::Value as KeyValue;
use serde_json::{json,Value};
use crate::MotionBridge;

#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum BuiltinEffect { GaussianBlur, BrightnessContrast }
impl BuiltinEffect {
    pub fn id(self)->&'static str { match self {
        Self::GaussianBlur=>"ec.blur.gaussian",
        Self::BrightnessContrast=>"ec.color.brightnesscontrast",
    }}
    fn permits(self,name:&str)->bool {match self {
        Self::GaussianBlur=>name=="blurriness",
        Self::BrightnessContrast=>matches!(name,"brightness"|"contrast"),
    }}
    fn bound(self,name:&str)->(f64,f64) {match (self,name) {
        (Self::GaussianBlur,_) => (0.0,100.0),
        (Self::BrightnessContrast,"brightness") => (-150.0,150.0),
        _=>(-100.0,100.0),
    }}
}
#[derive(Debug,Clone,PartialEq)]
pub struct EffectInfo {
    pub uid:u64,pub id:String,pub name:String,pub enabled:bool,
}
#[derive(Debug,Clone,PartialEq)]
pub struct MaskInfo {
    pub uid:u64,pub name:String,pub closed:bool,pub vertices:Vec<[f64;2]>,
}
fn finite_coord(v:f64)->bool{v.is_finite()&&v.abs()<=8192.0}
impl MotionBridge {
    pub fn list_effects(&self,comp_id:u64,layer_id:u64)->Result<Vec<EffectInfo>,String>{
        let c=self.session.project.comp(ItemId(comp_id)).ok_or("comp missing")?;
        let l=c.layer(LayerId(layer_id)).ok_or("layer missing")?;
        let group=l.effects().ok_or("layer has no effects")?;
        Ok(group.groups().map(|g|EffectInfo{
            uid:g.uid,id:g.match_id.clone(),name:g.name.clone(),enabled:g.enabled,
        }).collect())
    }
    pub fn add_effect(&mut self,comp_id:u64,layer_id:u64,kind:BuiltinEffect)->Result<EffectInfo,String>{
        let before=self.list_effects(comp_id,layer_id)?;
        self.session.execute_checked("comp.open",json!({"comp":comp_id}))
            .map_err(|e|format!("EffectCraft comp.open failed: {e}"))?;
        let result=self.session.execute_checked("effect.apply",json!({
            "comp":comp_id,"layers":[layer_id],"effect":kind.id()
        })).map_err(|e|format!("EffectCraft effect.apply failed: {e}"))?;
        let id=result["effects"].as_array().and_then(|a|a.first()).and_then(Value::as_u64)
            .ok_or("native effect.apply returned no effect uid")?;
        let now=self.list_effects(comp_id,layer_id)?;
        now.into_iter().find(|f|f.uid==id&&f.id==kind.id()&&
            !before.iter().any(|prev|prev.uid==id))
            .ok_or_else(||format!("native EffectCraft effect readback mismatch for {id}"))
    }
    pub fn set_effect_numeric(&mut self,comp_id:u64,layer_id:u64,effect_uid:u64,
        kind:BuiltinEffect,parameter:&str,value:f64)->Result<f64,String>{
        if !kind.permits(parameter){return Err("parameter not allowlisted for selected effect".into());}
        let (min,max)=kind.bound(parameter);
        if !value.is_finite()||value<min||value>max{
            return Err(format!("{parameter} must be finite in {min}..{max}"));
        }
        let before=self.list_effects(comp_id,layer_id)?;
        if !before.iter().any(|fx|fx.uid==effect_uid&&fx.id==kind.id()){
            return Err("effect UID and kind mismatch".into());
        }
        let c=self.session.project.comp(ItemId(comp_id)).ok_or("comp missing")?;
        let l=c.layer(LayerId(layer_id)).ok_or("layer missing")?;
        let fx=l.effects().ok_or("effects missing")?;
        let index=fx.groups().position(|g|g.uid==effect_uid).ok_or("effect missing")?+1;
        let path=format!("effects/#{index}/{parameter}");
        self.session.execute_checked("prop.set",json!({
            "comp":comp_id,"layer":layer_id,"path":path,"value":value
        })).map_err(|e|format!("native effect parameter edit failed: {e}"))?;
        let c=self.session.project.comp(ItemId(comp_id)).ok_or("comp missing after edit")?;
        let l=c.layer(LayerId(layer_id)).ok_or("layer missing after edit")?;
        let g=l.effects().and_then(|f|f.groups().find(|g|g.uid==effect_uid))
            .ok_or("edited effect missing")?;
        let actual=g.get(parameter).and_then(|p|p.value.to_json().as_f64())
            .ok_or("edited effect numeric parameter missing")?;
        if (actual-value).abs()>1e-6{return Err("native numeric effect readback mismatch".into());}
        Ok(actual)
    }
    pub fn set_effect_enabled(&mut self,comp_id:u64,layer_id:u64,
        effect_uid:u64,enabled:bool)->Result<EffectInfo,String>{
        self.list_effects(comp_id,layer_id)?.iter().find(|fx|fx.uid==effect_uid)
            .ok_or("effect not found")?;
        self.session.execute_checked("effect.toggle",json!({
            "comp":comp_id,"layer":layer_id,"effect":effect_uid,"value":enabled
        })).map_err(|e|format!("native effect.toggle failed: {e}"))?;
        self.list_effects(comp_id,layer_id)?.into_iter()
            .find(|fx|fx.uid==effect_uid&&fx.enabled==enabled)
            .ok_or("native effect enabled readback mismatch".into())
    }
    pub fn remove_effect(&mut self,comp_id:u64,layer_id:u64,effect_uid:u64)->Result<(),String>{
        self.list_effects(comp_id,layer_id)?.iter().find(|fx|fx.uid==effect_uid)
            .ok_or("effect not found")?;
        self.session.execute_checked("effect.remove",json!({
            "comp":comp_id,"layer":layer_id,"effect":effect_uid
        })).map_err(|e|format!("native effect.remove failed: {e}"))?;
        if self.list_effects(comp_id,layer_id)?.iter().any(|fx|fx.uid==effect_uid){
            return Err("removed effect still exists in native project".into());
        }
        Ok(())
    }

    pub fn list_masks(&self,comp_id:u64,layer_id:u64)->Result<Vec<MaskInfo>,String>{
        let c=self.session.project.comp(ItemId(comp_id)).ok_or("comp missing")?;
        let l=c.layer(LayerId(layer_id)).ok_or("layer missing")?;
        let masks=l.props.sub("masks").ok_or("layer does not support masks")?;
        masks.groups().map(|g|{
            let property=g.get("path").ok_or("mask path absent")?;
            let KeyValue::Path(ref path)=property.value else {
                return Err("native mask path type invalid".into())
            };
            Ok(MaskInfo{uid:g.uid,name:g.name.clone(),
                vertices:path.vertices.clone(),closed:path.closed})
        }).collect()
    }
    pub fn new_polygon_mask(&mut self,comp_id:u64,layer_id:u64,
        points:&[[f64;2]])->Result<MaskInfo,String>{
        if points.len()<3||points.len()>64||points.iter().flat_map(|p|p.iter()).any(|v|!finite_coord(*v)){
            return Err("mask requires 3-64 finite layer-space vertices in +/-8192".into());
        }
        // Refuse entirely degenerate polygons, which look like a successful invisible mask.
        let mut area=0.0;
        for i in 0..points.len(){
            let a=points[i];let b=points[(i+1)%points.len()];
            area+=a[0]*b[1]-a[1]*b[0];
        }
        if area.abs()<1.0{return Err("polygon mask has zero area".into());}
        self.list_masks(comp_id,layer_id)?;
        self.session.execute_checked("comp.open",json!({"comp":comp_id}))
            .map_err(|e|format!("comp.open failed: {e}"))?;
        let result=self.session.execute_checked("mask.new",json!({
            "comp":comp_id,"layer":layer_id,"vertices":points,"closed":true,"mode":"Add"
        })).map_err(|e|format!("native mask.new failed: {e}"))?;
        let uid=result["mask"].as_u64().ok_or("native mask.new returned no uid")?;
        let now=self.list_masks(comp_id,layer_id)?;
        now.into_iter().find(|m|m.uid==uid&&m.closed&&m.vertices==points)
            .ok_or("native mask path readback mismatch".into())
    }
    pub fn set_mask_vertex(&mut self,comp_id:u64,layer_id:u64,uid:u64,
        index:usize,point:[f64;2])->Result<MaskInfo,String>{
        if !point.iter().all(|p|finite_coord(*p)){return Err("invalid mask vertex".into());}
        let current=self.list_masks(comp_id,layer_id)?.into_iter().find(|m|m.uid==uid)
            .ok_or("mask not found")?;
        if index>=current.vertices.len(){return Err("mask vertex index out of bounds".into());}
        self.session.execute_checked("mask.setVertex",json!({
            "comp":comp_id,"layer":layer_id,"mask":uid,"index":index,"point":point
        })).map_err(|e|format!("native mask.setVertex failed: {e}"))?;
        self.list_masks(comp_id,layer_id)?.into_iter()
            .find(|m|m.uid==uid&&m.vertices.get(index)==Some(&point))
            .ok_or("native mask vertex readback mismatch".into())
    }
    pub fn remove_mask(&mut self,comp_id:u64,layer_id:u64,uid:u64)->Result<(),String>{
        self.list_masks(comp_id,layer_id)?.iter().find(|m|m.uid==uid)
            .ok_or("mask not found")?;
        self.session.execute_checked("mask.remove",json!({
            "comp":comp_id,"layer":layer_id,"mask":uid
        })).map_err(|e|format!("native mask.remove failed: {e}"))?;
        if self.list_masks(comp_id,layer_id)?.iter().any(|m|m.uid==uid){
            return Err("removed mask still exists in native project".into());
        }
        Ok(())
    }
}
