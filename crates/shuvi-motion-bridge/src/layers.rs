//! Real native EffectCraft editable text and shape layers, typed creation + readback.
use effectcraft_engine::project::{ItemId,LayerId};
use serde_json::{json,Value};
use crate::MotionBridge;

#[derive(Debug,Clone,Copy)]
pub enum ShapeKind { Rectangle, Ellipse, Rounded, Star, Polygon }
impl ShapeKind {
    fn command(self)->&'static str { match self {
        Self::Rectangle=>"rect", Self::Ellipse=>"ellipse",
        Self::Rounded=>"rounded", Self::Star=>"star", Self::Polygon=>"polygon"
    }}
}
#[derive(Debug,Clone,PartialEq)]
pub struct LayerSnapshot {
    pub comp_id:u64, pub id:u64, pub name:String, pub kind:String,
    pub position:Vec<f64>, pub scale:Vec<f64>, pub rotation:f64,
    pub opacity:f64, pub keyframes:usize, pub project_revision:u64
}
pub(crate) fn bounded(v:f64,name:&str,limit:f64)->Result<(),String>{
    if !v.is_finite()||v.abs()>limit {return Err(format!("{name} outside allowed +/-{limit}"));}
    Ok(())
}
fn valid_name(s:&str)->Result<(),String>{
    if s.is_empty()||s.len()>120||s.trim()!=s||s.chars().any(char::is_control) {
        return Err("layer name must be trimmed, 1-120 bytes, without controls".into());
    }
    Ok(())
}
impl MotionBridge {
    pub fn list_layers(&self,comp_id:u64)->Result<Vec<LayerSnapshot>,String>{
        let comp=self.session.project.comp(ItemId(comp_id)).ok_or("composition not found")?;
        comp.layers.iter().map(|l|self.inspect_layer(comp_id,l.id.0)).collect()
    }
    pub fn inspect_layer(&self,comp_id:u64,layer_id:u64)->Result<LayerSnapshot,String>{
        let c=self.session.project.comp(ItemId(comp_id)).ok_or("composition not found")?;
        let l=c.layer(LayerId(layer_id)).ok_or("layer not found")?;
        let prop=|path|l.props.prop(path).ok_or_else(||format!("missing native property: {path}"));
        let vec_property=|path|->Result<Vec<f64>,String>{
            prop(path)?.value.to_json().as_array().and_then(|a|
                a.iter().map(Value::as_f64).collect()).ok_or_else(||format!("not numeric array: {path}"))
        };
        let scalar=|path|->Result<f64,String>{
            prop(path)?.value.to_json().as_f64().ok_or_else(||format!("not scalar: {path}"))
        };
        let keyframes=["transform/position","transform/scale","transform/rotation","transform/opacity"]
            .iter().map(|p|prop(p).map(|v|v.keys.len())).collect::<Result<Vec<_>,_>>()?.into_iter().sum();
        Ok(LayerSnapshot{comp_id,id:layer_id,name:l.name.clone(),kind:l.source.type_name().into(),
            position:vec_property("transform/position")?,scale:vec_property("transform/scale")?,
            rotation:scalar("transform/rotation")?,opacity:scalar("transform/opacity")?,
            keyframes,project_revision:self.session.revision})
    }
    fn new_layer(&mut self,comp_id:u64,name:&str,command:&str,params:Value,expected:&str)
        ->Result<LayerSnapshot,String>{
        valid_name(name)?;
        let comp=self.session.project.comp(ItemId(comp_id)).ok_or("composition not found")?;
        if comp.layers.iter().any(|l|l.name==name){return Err("duplicate layer name".into());}
        self.session.execute_checked("comp.open",json!({"comp":comp_id}))
            .map_err(|e|format!("comp activation failed: {e}"))?;
        let prior=self.session.revision;
        let response=self.session.execute_checked(command,params)
            .map_err(|e|format!("{command} failed: {e}"))?;
        let id=response.get("layer").and_then(Value::as_u64).ok_or("native command returned no layer id")?;
        let layer=self.inspect_layer(comp_id,id)?;
        if self.session.revision<=prior||layer.name!=name||layer.kind!=expected {
            return Err(format!("native layer readback failed: {layer:?}"));
        }
        Ok(layer)
    }
    pub fn add_text(&mut self,comp_id:u64,name:&str,text:&str,x:f64,y:f64,size:f64)
        ->Result<LayerSnapshot,String>{
        bounded(x,"x",8192.0)?; bounded(y,"y",8192.0)?;
        if text.trim().is_empty()||text.len()>4096||text.contains('\0'){
            return Err("invalid editable text".into());
        }
        if !size.is_finite()||!(6.0..=256.0).contains(&size){return Err("invalid font size".into());}
        let layer=self.new_layer(comp_id,name,"layer.newText",
            json!({"name":name,"text":text,"position":[x,y],"size":size,"edit":false}),"Text")?;
        let comp=self.session.project.comp(ItemId(comp_id)).ok_or("comp missing")?;
        let l=comp.layer(LayerId(layer.id)).ok_or("text layer missing")?;
        let p=l.props.prop("text/sourceText").ok_or("editable source text absent")?;
        let effectcraft_engine::keyframe::Value::Text(ref d)=p.value else {
            return Err("native sourceText not editable".into())
        };
        if d.text!=text{return Err("source text readback mismatch".into());}
        Ok(layer)
    }
    pub fn add_shape(&mut self,comp_id:u64,name:&str,kind:ShapeKind,x:f64,y:f64,
        w:f64,h:f64,fill:&str)->Result<LayerSnapshot,String>{
        for (n,v,limit) in [("x",x,8192.0),("y",y,8192.0),("w",w,4096.0),("h",h,4096.0)]{
            bounded(v,n,limit)?;
        }
        if w<2.0||h<2.0{return Err("shape dimensions too small".into());}
        if fill.len()!=7||!fill.starts_with('#')||!fill[1..].bytes().all(|b|b.is_ascii_hexdigit()){
            return Err("fill must be #RRGGBB".into());
        }
        let layer=self.new_layer(comp_id,name,"layer.newShape",
            json!({"name":name,"kind":kind.command(),"position":[x,y],
                "size":[w,h],"fill":fill}),"Shape")?;
        let comp=self.session.project.comp(ItemId(comp_id)).ok_or("comp missing")?;
        let l=comp.layer(LayerId(layer.id)).ok_or("shape missing")?;
        if l.props.sub("contents").is_none_or(|c|c.children.is_empty()){
            return Err("native shape has no geometry content".into());
        }
        Ok(layer)
    }
}

impl MotionBridge {
    /// Edit an existing actual EffectCraft source-text document in the SAME session.
    /// This is a native layer.setText edit, not an overlay painted by the UI.
    pub fn edit_text(&mut self,comp_id:u64,layer_id:u64,text:&str)
        ->Result<LayerSnapshot,String>{
        if text.trim().is_empty()||text.len()>4096||text.contains('\0'){
            return Err("invalid editable text".into());
        }
        let comp=self.session.project.comp(ItemId(comp_id)).ok_or("composition not found")?;
        let layer=comp.layer(LayerId(layer_id)).ok_or("layer not found")?;
        if !matches!(layer.source,effectcraft_engine::project::LayerSource::Text){
            return Err("target is not a text layer".into());
        }
        let before=self.session.revision;
        self.session.execute_checked("layer.setText",json!({
            "comp":comp_id,"layer":layer_id,"text":text
        })).map_err(|e|format!("native layer.setText failed: {e}"))?;
        let layer=self.session.project.comp(ItemId(comp_id))
            .and_then(|c|c.layer(LayerId(layer_id))).ok_or("text layer vanished")?;
        let doc=layer.props.prop("text/sourceText").ok_or("sourceText missing")?;
        let effectcraft_engine::keyframe::Value::Text(ref actual)=doc.value else {
            return Err("native text property invalid".into());
        };
        if actual.text!=text{return Err("native text edit not reflected in project".into());}
        if self.session.revision==before{return Err("native text edit did not record a change".into());}
        self.inspect_layer(comp_id,layer_id)
    }
}
