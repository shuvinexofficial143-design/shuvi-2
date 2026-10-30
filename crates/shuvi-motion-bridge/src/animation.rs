//! Typed transforms, native keyframes, graph easing and raw EffectCraft property inspection.
use effectcraft_engine::{project::{ItemId,LayerId},time::Tick,keyframe::Interp};
use serde_json::{json,Value};
use crate::{MotionBridge,LayerSnapshot};
use crate::layers::bounded;

#[derive(Debug,Clone,Copy)]
pub enum Transform{
    Position{x:f64,y:f64}, Scale{x:f64,y:f64},
    Rotation(f64), Opacity(f64)
}
#[derive(Debug,Clone,Copy,PartialEq,Eq)]
pub enum Property{Position,Scale,Rotation,Opacity}
impl Property {
    fn path(self)->&'static str {match self{
        Self::Position=>"transform/position",Self::Scale=>"transform/scale",
        Self::Rotation=>"transform/rotation",Self::Opacity=>"transform/opacity"
    }}
}
impl MotionBridge {
    pub fn set_transform(&mut self,comp:u64,layer:u64,transform:Transform)
        ->Result<LayerSnapshot,String>{
        let (property,v)=match transform {
            Transform::Position{x,y}=>{
                bounded(x,"x",8192.0)?;bounded(y,"y",8192.0)?;
                (Property::Position,json!([x,y,0.0]))
            }
            Transform::Scale{x,y}=>{
                bounded(x,"scale x",1000.0)?;bounded(y,"scale y",1000.0)?;
                if x<0.0||y<0.0{return Err("negative scale refused".into());}
                (Property::Scale,json!([x,y,100.0]))
            }
            Transform::Rotation(deg)=>{
                bounded(deg,"rotation",3600.0)?;
                (Property::Rotation,json!(deg))
            }
            Transform::Opacity(value)=>{
                bounded(value,"opacity",100.0)?;
                if value<0.0{return Err("negative opacity refused".into());}
                (Property::Opacity,json!(value))
            }
        };
        self.inspect_layer(comp,layer)?;
        let before=self.session.revision;
        let prior=self.property_state(comp,layer,property,0.0)?;
        self.session.execute_checked("prop.set",json!({
            "comp":comp,"layer":layer,"path":property.path(),"value":v
        })).map_err(|e|format!("native prop.set failed: {e}"))?;
        let state=self.property_state(comp,layer,property,0.0)?;
        if state.get("value")!=Some(&v) {
            return Err(format!("native prop readback differs: {state}"));
        }
        if prior.get("value")!=Some(&v)&&self.session.revision<=before {
            return Err("effectcraft did not record property edit".into());
        }
        self.inspect_layer(comp,layer)
    }
    pub fn property_state(&mut self,comp:u64,layer:u64,property:Property,time:f64)
        ->Result<Value,String>{
        bounded(time,"query time",600.0)?;
        if time<0.0{return Err("negative time".into());}
        self.session.execute_checked("prop.get",json!({
            "comp":comp,"layer":layer,"path":property.path(),"time":time
        })).map_err(|e|format!("native prop.get failed: {e}"))
    }
    /// Stores a key at composition time; native implementation snaps to frame grid.
    pub fn add_transform_key(&mut self,comp:u64,layer:u64,property:Property,
        time:f64,value:Value)->Result<Value,String>{
        bounded(time,"key time",600.0)?;
        let c=self.session.project.comp(ItemId(comp)).ok_or("comp missing")?;
        if time<0.0||time>c.duration.seconds(){return Err("key outside comp duration".into());}
        let l=c.layer(LayerId(layer)).ok_or("layer missing")?;
        let p=l.props.prop(property.path()).ok_or("property missing")?;
        let expected=p.value.coerce_json(&value).ok_or("property value type mismatch")?;
        let old=p.keys.len();
        let before=self.session.revision;
        self.session.execute_checked("prop.addKey",json!({
            "comp":comp,"layer":layer,"path":property.path(),
            "time":time,"timeBase":"comp","value":value
        })).map_err(|e|format!("native prop.addKey failed: {e}"))?;
        let c=self.session.project.comp(ItemId(comp)).ok_or("comp missing after key")?;
        let l=c.layer(LayerId(layer)).ok_or("layer missing after key")?;
        let p=l.props.prop(property.path()).ok_or("property missing after key")?;
        let snapped=c.frame_rate.snap_nearest(Tick::from_seconds_f64(time));
        let key=p.keys.iter().find(|k|k.time==l.layer_time(snapped))
            .ok_or("snapped native keyframe missing")?;
        if key.value!=expected||p.keys.len()<old{return Err("native keyframe data mismatch".into());}
        if self.session.revision<=before{return Err("keyframe was not recorded".into());}
        self.property_state(comp,layer,property,time)
    }
    /// Use Graph Editor's real easing command and verify the stored interpolation.
    pub fn ease_transform_keys(&mut self,comp:u64,layer:u64,property:Property,times:&[f64])
        ->Result<Value,String>{
        if times.is_empty()||times.len()>32{return Err("1..32 keys required".into());}
        let mut keys=Vec::new();
        for &t in times{
            bounded(t,"key time",600.0)?;
            if t<0.0{return Err("negative key time".into());}
            keys.push(json!({"layer":layer,"path":property.path(),"time":t}));
        }
        self.session.execute_checked("comp.open",json!({"comp":comp}))
            .map_err(|e|format!("comp.open failed: {e}"))?;
        let selected=self.session.execute_checked("keys.select",json!({
            "keys":keys,"timeBase":"comp"
        })).map_err(|e|format!("native keys.select failed: {e}"))?;
        if selected.get("count").and_then(Value::as_u64)!=Some(times.len() as u64){
            return Err(format!("native key selection mismatch: {selected}"));
        }
        self.session.execute_checked("keys.easyEase",json!({"which":"both"}))
            .map_err(|e|format!("native keys.easyEase failed: {e}"))?;
        let pr=self.session.project.comp(ItemId(comp))
            .and_then(|c|c.layer(LayerId(layer)))
            .and_then(|l|l.props.prop(property.path())).ok_or("eased property missing")?;
        if times.iter().any(|t|{
            let c=self.session.project.comp(ItemId(comp)).unwrap();
            let l=c.layer(LayerId(layer)).unwrap();
            let target=l.layer_time(c.frame_rate.snap_nearest(Tick::from_seconds_f64(*t)));
            !pr.keys.iter().any(|k|k.time==target&&
                k.in_interp==Interp::Bezier&&k.out_interp==Interp::Bezier)
        }){return Err("eased key readback does not contain Bezier".into());}
        self.property_state(comp,layer,property,times[0])
    }
}
