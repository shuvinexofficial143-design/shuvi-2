//! Single-owner EffectCraft engine worker for Shuvi Motion Studio.
//! One in-process engine, shared by manual UI and later approved AI commands.
//! Separate thread keeps possibly non-Send render hosts away from Tauri state.
use std::{path::Path, sync::mpsc::{self,Sender,Receiver}, thread, time::Duration};
use serde::Deserialize;
use serde_json::{json,Value};
use shuvi_motion_bridge::{CompositionSpec,MotionBridge,Property,ShapeKind,Transform};
use base64::{engine::general_purpose::STANDARD,Engine as _};

#[derive(Debug,Deserialize)]
#[serde(tag="action",rename_all="camelCase",rename_all_fields="camelCase")]
pub enum MotionRequest{
    Status,
    CreateComposition { name:String,width:u32,height:u32,fps:f64,duration_seconds:f64 },
    ListLayers { comp_id:u64 },
    AddText { comp_id:u64,name:String,text:String,x:f64,y:f64,size:f64 },
    EditText { comp_id:u64,layer_id:u64,text:String },
    AddShape { comp_id:u64,name:String,kind:String,x:f64,y:f64,width:f64,height:f64,fill:String },
    SetTransform { comp_id:u64,layer_id:u64,kind:String,x:Option<f64>,y:Option<f64>,value:Option<f64> },
    AddKey { comp_id:u64,layer_id:u64,property:String,time:f64,value:Value },
    EaseKeys { comp_id:u64,layer_id:u64,property:String,times:Vec<f64> },
    Render { comp_id:u64,time:f64,max_side:u32,transparent:bool },
    SaveProject { workspace:String,basename:String },
    OpenProject { workspace:String,basename:String },
}

struct Work { request:MotionRequest, respond:Sender<Result<Value,String>> }
#[derive(Clone)]
pub struct MotionHost { tx:Sender<Work> }
impl MotionHost{
    pub fn new()->Self{
        let (tx,rx)=mpsc::channel();
        // A native engine session lives on this worker alone, never duplicated
        // between UI events or silently lost between commands.
        thread::Builder::new().name("shuvi-effectcraft".into())
            .spawn(move || worker(rx)).expect("cannot start EffectCraft worker");
        Self{tx}
    }
    pub fn execute(&self,request:MotionRequest)->Result<Value,String>{
        let (answer_tx,answer_rx)=mpsc::channel();
        self.tx.send(Work{request,respond:answer_tx})
            .map_err(|_|"Motion engine worker unavailable".to_string())?;
        answer_rx.recv_timeout(Duration::from_secs(120))
            .map_err(|e|format!("motion worker did not respond: {e}"))?
    }
}
fn worker(rx:Receiver<Work>){
    let mut engine=MotionBridge::new();
    while let Ok(work)=rx.recv(){
        let response=apply(&mut engine,work.request);
        let _=work.respond.send(response);
    }
}
fn prop(name:&str)->Result<Property,String>{
    match name{
        "position"=>Ok(Property::Position),"scale"=>Ok(Property::Scale),
        "rotation"=>Ok(Property::Rotation),"opacity"=>Ok(Property::Opacity),
        _=>Err("allowed keyframe properties: position|scale|rotation|opacity".into())
    }
}
fn shape(name:&str)->Result<ShapeKind,String>{
    match name {
        "rect"=>Ok(ShapeKind::Rectangle),"ellipse"=>Ok(ShapeKind::Ellipse),
        "rounded"=>Ok(ShapeKind::Rounded),"star"=>Ok(ShapeKind::Star),
        "polygon"=>Ok(ShapeKind::Polygon),
        _=>Err("allowed shapes: rect|ellipse|rounded|star|polygon".into())
    }
}
fn coords(x:Option<f64>,y:Option<f64>)->Result<(f64,f64),String>{
    match (x,y){(Some(x),Some(y))=>Ok((x,y)),_=>Err("both x and y are required".into())}
}
fn layer_json(l:shuvi_motion_bridge::LayerSnapshot)->Value{
    json!({"compId":l.comp_id,"id":l.id,"name":l.name,"kind":l.kind,
       "position":l.position,"scale":l.scale,"rotation":l.rotation,
       "opacity":l.opacity,"keyframes":l.keyframes,"revision":l.project_revision})
}
fn receipt(r:shuvi_motion_bridge::ProjectReceipt)->Value{
    json!({"path":r.path.to_string_lossy(),"bytes":r.bytes,
       "verifiedFromDisk":r.verified_from_disk,
       "compositions":r.compositions.iter().map(|c|
         json!({"id":c.id,"name":c.name,"width":c.width,"height":c.height,
           "fps":c.fps,"durationSeconds":c.duration_seconds})).collect::<Vec<_>>()})
}
fn apply(e:&mut MotionBridge,request:MotionRequest)->Result<Value,String>{
    match request {
        MotionRequest::Status=>Ok(json!({"ready":true,"engine":"effectcraft",
            "native":true,"projectRevision":e.revision(),"dirty":e.is_dirty()})),
        MotionRequest::CreateComposition{name,width,height,fps,duration_seconds}=>{
            let c=e.create_composition(&CompositionSpec{
                name,width,height,fps,duration_seconds
            })?;
            Ok(json!({"id":c.id,"name":c.name,"width":c.width,"height":c.height,
                "fps":c.fps,"durationSeconds":c.duration_seconds,"revision":c.project_revision}))
        }
        MotionRequest::ListLayers{comp_id}=>Ok(Value::Array(e.list_layers(comp_id)?
            .into_iter().map(layer_json).collect())),
        MotionRequest::AddText{comp_id,name,text,x,y,size}=>
            Ok(layer_json(e.add_text(comp_id,&name,&text,x,y,size)?)),
        MotionRequest::EditText{comp_id,layer_id,text}=>
            Ok(layer_json(e.edit_text(comp_id,layer_id,&text)?)),
        MotionRequest::AddShape{comp_id,name,kind,x,y,width,height,fill}=>
            Ok(layer_json(e.add_shape(comp_id,&name,shape(&kind)?,x,y,width,height,&fill)?)),
        MotionRequest::SetTransform{comp_id,layer_id,kind,x,y,value}=>{
            let transform=match kind.as_str(){
                "position"=>{let (x,y)=coords(x,y)?;Transform::Position{x,y}},
                "scale"=>{let (x,y)=coords(x,y)?;Transform::Scale{x,y}},
                "rotation"=>Transform::Rotation(value.ok_or("rotation value required")?),
                "opacity"=>Transform::Opacity(value.ok_or("opacity value required")?),
                _=>return Err("allowed transforms: position|scale|rotation|opacity".into()),
            };
            Ok(layer_json(e.set_transform(comp_id,layer_id,transform)?))
        }
        MotionRequest::AddKey{comp_id,layer_id,property,time,value}=>
            e.add_transform_key(comp_id,layer_id,prop(&property)?,time,value),
        MotionRequest::EaseKeys{comp_id,layer_id,property,times}=>
            e.ease_transform_keys(comp_id,layer_id,prop(&property)?,&times),
        MotionRequest::Render{comp_id,time,max_side,transparent}=>{
            // Prevent huge Tauri IPC payloads; owner can request full export separately.
            if max_side==0||max_side>768 {return Err("IPC preview max_side must be 1..768".into());}
            let frame=e.render_preview(comp_id,time,max_side,transparent)?;
            let png=frame.png()?;
            Ok(json!({"width":frame.width,"height":frame.height,
                "pngBase64":STANDARD.encode(png),"visiblePixels":frame.visible_pixels(),
                "checksum":frame.checksum().to_string(),"revision":frame.project_revision,
                "transparent":transparent,"source":"native-effectcraft"}))
        }
        MotionRequest::SaveProject{workspace,basename}=>{
            Ok(receipt(e.save_project(Path::new(&workspace),&basename)?))
        }
        MotionRequest::OpenProject{workspace,basename}=>{
            Ok(receipt(e.open_project(Path::new(&workspace),&basename)?))
        }
    }
}

#[tauri::command]
pub async fn motion_command(
    state:tauri::State<'_,MotionHost>,
    request:MotionRequest
)->Result<Value,String>{
    let host=state.inner().clone();
    tauri::async_runtime::spawn_blocking(move ||host.execute(request))
        .await.map_err(|e|format!("Motion request task failed: {e}"))?
}

#[cfg(test)]
mod tests{
    use super::*;
    #[test]
    fn same_worker_preserves_live_engine_state_and_native_preview(){
        let host=MotionHost::new();
        let created=host.execute(MotionRequest::CreateComposition{
            name:"Motion IPC Live".into(),width:320,height:180,fps:30.0,duration_seconds:3.0
        }).unwrap();
        let id=created["id"].as_u64().unwrap();
        let shape=host.execute(MotionRequest::AddShape{
            comp_id:id,name:"IPC Shape".into(),kind:"rect".into(),x:160.0,y:90.0,
            width:130.0,height:80.0,fill:"#ff0088".into()
        }).unwrap();
        let layers=host.execute(MotionRequest::ListLayers{comp_id:id}).unwrap();
        assert_eq!(layers.as_array().unwrap().len(),1);
        assert_eq!(layers[0]["id"],shape["id"]);
        let render=host.execute(MotionRequest::Render{comp_id:id,time:0.0,max_side:320,transparent:true}).unwrap();
        assert_eq!(render["source"],"native-effectcraft");
        assert!(render["visiblePixels"].as_u64().unwrap()>0);
        let png=STANDARD.decode(render["pngBase64"].as_str().unwrap()).unwrap();
        assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));
        assert!(host.execute(MotionRequest::Render{comp_id:id,time:0.0,max_side:9999,transparent:true}).is_err());
    }
    #[test]
    fn unknown_operations_do_not_mutate_live_project(){
        let host=MotionHost::new();
        let before=host.execute(MotionRequest::Status).unwrap();
        assert!(host.execute(MotionRequest::AddShape{
            comp_id:42,name:"Bad".into(),kind:"unsafe".into(),x:1.0,y:1.0,
            width:20.0,height:20.0,fill:"#ffffff".into()
        }).is_err());
        let after=host.execute(MotionRequest::Status).unwrap();
        assert_eq!(before["projectRevision"],after["projectRevision"]);
    }
    #[test]
    fn frontend_json_contract_uses_only_typed_camel_case_actions(){
        let valid=serde_json::json!({
            "action":"createComposition","name":"IPC Name",
            "width":640,"height":360,"fps":30.0,"durationSeconds":5.0
        });
        assert!(serde_json::from_value::<MotionRequest>(valid).is_ok());
        let render=serde_json::json!({
            "action":"render","compId":1,"time":0.0,
            "maxSide":640,"transparent":true
        });
        assert!(serde_json::from_value::<MotionRequest>(render).is_ok());
        let untrusted=serde_json::json!({"action":"shell","command":"unsafe"});
        assert!(serde_json::from_value::<MotionRequest>(untrusted).is_err());
    }

}
