//! M-AI04: cross-branch integration with the ACTUAL 2.0.3 GuardedHost +
//! SQLite WAL/FULL ledger and ACTUAL EffectCraft Session. NO fake native owner.
//!
//! This is intentionally an isolated test harness: it is NOT registered in the
//! desktop runtime. Owner consent in tests is an explicit test double. A
//! production gate still needs an app-wide manual/AI lock, owner approval UI,
//! protected DB location and release-branch review.

use effectcraft_engine::{Session, project::{ItemId, LayerId, LayerSource}};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use shuvi_ai_provider::guard::{Action, Editor, NativeOwner, Snapshot, Version};
use std::collections::BTreeSet;

pub struct EffectcraftNativeOwner<'a> {
    session: &'a mut Session,
    project_id: String,
    session_id: String,
    last_action: Option<Action>,
    last_result: Option<Value>,
}

impl<'a> EffectcraftNativeOwner<'a> {
    pub fn new(session: &'a mut Session, project_id: String, session_id: String) -> Result<Self, String> {
        if project_id.is_empty() || session_id.is_empty() ||
            project_id.chars().any(char::is_control) ||
            session_id.chars().any(char::is_control) {
            return Err("invalid native owner identity".into());
        }
        Ok(Self {session,project_id,session_id,last_action:None,last_result:None})
    }
    pub fn current_revision(&self) -> u64 {self.session.revision}

    fn comp_from_name(&self,name:&str) -> Option<(u64,&effectcraft_engine::project::Comp)> {
        let matches:Vec<_>=self.session.project.items.values()
            .filter(|it|it.name==name && it.as_comp().is_some())
            .collect();
        if matches.len()!=1 {return None;}
        let item=matches[0];
        Some((item.id.0,self.session.project.comp(item.id)?))
    }

    fn native_text(&self,comp:u64,layer:u64)->Option<String>{
        let l=self.session.project.comp(ItemId(comp))?.layer(LayerId(layer))?;
        if !matches!(l.source,LayerSource::Text){return None;}
        let property=l.props.prop("text/sourceText")?;
        match &property.value {
            effectcraft_engine::keyframe::Value::Text(doc)=>Some(doc.text.clone()),
            effectcraft_engine::keyframe::Value::Str(text)=>Some(text.clone()),
            _=>None,
        }
    }

    /// Independent readback after executing a native EffectCraft command.
    /// Values are read from the live Project, NOT from the command JSON.
    fn inspect_actual_object(&self,action:&Action)->Result<Value,String>{
        if self.last_action.as_ref()!=Some(action){return Err("action proof mismatch".into());}
        match action {
            Action::MotionCreateComposition{name,width,height,fps,duration_seconds}=>{
                let (id,c)=self.comp_from_name(name).ok_or("composition missing or ambiguous")?;
                if c.width!=*width || c.height!=*height ||
                    (c.frame_rate.as_f64()-fps).abs()>0.02 ||
                    (c.duration.seconds()-duration_seconds).abs()>1.0/fps+0.00001 {
                    return Err("real comp properties mismatch".into());
                }
                if self.last_result.as_ref().and_then(|v|v["comp"].as_u64())!=Some(id){
                    return Err("native create ID mismatch".into());
                }
                Ok(json!({"kind":"composition","id":id,"name":name,"width":c.width,
                    "height":c.height,"fps":c.frame_rate.as_f64(),"duration":c.duration.seconds()}))
            },
            Action::MotionAddText{comp_id,name,text,x,y,size:_}=>{
                let id=self.last_result.as_ref().and_then(|v|v["layer"].as_u64())
                    .filter(|id|*id>0).ok_or("new layer ID missing")?;
                let layer=self.session.project.comp(ItemId(*comp_id))
                    .and_then(|c|c.layer(LayerId(id))).ok_or("new layer missing")?;
                if layer.name!=*name||self.native_text(*comp_id,id).as_deref()!=Some(text.as_str()){
                    return Err("native source text mismatch".into());
                }
                let position=layer.props.prop("transform/position").and_then(|p|match &p.value{
                    effectcraft_engine::keyframe::Value::Vec3(v)=>Some(*v),_=>None
                }).ok_or("native position missing")?;
                if (position[0]-x).abs()>1e-6||(position[1]-y).abs()>1e-6{
                    return Err("native text placement mismatch".into());
                }
                Ok(json!({"kind":"textLayer","compId":comp_id,"id":id,
                    "name":name,"text":text,"position":position}))
            },
            Action::MotionEditText{comp_id,layer_id,text}=>{
                if self.native_text(*comp_id,*layer_id).as_deref()!=Some(text.as_str()){
                    return Err("native edited text differs".into());
                }
                Ok(json!({"kind":"textLayer","compId":comp_id,"id":layer_id,"text":text}))
            },
            _=>Err("unsupported native Motion action".into())
        }
    }

    fn command(action:&Action)->Result<(&'static str,Value),String>{
        match action {
            Action::MotionCreateComposition{name,width,height,fps,duration_seconds} =>
                Ok(("comp.new",json!({"name":name,"width":width,"height":height,
                    "frameRate":fps,"duration":duration_seconds}))),
            Action::MotionAddText{name,text,x,y,size,..} =>
                Ok(("layer.newText",json!({"name":name,"text":text,
                    "position":[x,y],"size":size,"edit":false}))),
            Action::MotionEditText{layer_id,text,..} =>
                Ok(("layer.setText",json!({"layer":layer_id,"text":text}))),
            _ => Err("typed action unsupported by native bridge".into()),
        }
    }
}

impl NativeOwner for EffectcraftNativeOwner<'_> {
    fn snapshot(&mut self)->Result<Snapshot,String>{
        Ok(Snapshot{editor:Editor::Motion,project_id:self.project_id.clone(),
            session_id:self.session_id.clone(),
            version:Version::MotionRevision(self.session.revision)})
    }
    fn preflight_action(&mut self,action:&Action)->Result<bool,String>{
        let valid=match action {
            Action::MotionCreateComposition{name,..} =>
                self.comp_from_name(name).is_none(),
            Action::MotionAddText{comp_id,name,..} =>
                self.session.active_comp_id()==Some(ItemId(*comp_id)) &&
                self.session.project.comp(ItemId(*comp_id))
                    .is_some_and(|c|c.layers.iter().all(|l|l.name!=*name)),
            Action::MotionEditText{comp_id,layer_id,text} =>
                self.session.active_comp_id()==Some(ItemId(*comp_id)) &&
                self.native_text(*comp_id,*layer_id)
                    .is_some_and(|existing|existing!=*text),
            _=>false,
        };
        if !valid{return Ok(false);}
        // Real native schema; unknown/extra parameters are rejected.
        let (cmd,params)=Self::command(action)?;
        let spec=effectcraft_engine::commands::find(cmd).ok_or("command not found")?;
        if !spec.journal {return Ok(false);}
        effectcraft_engine::commands::check_params(spec,&params).map_err(|e|e.to_string())?;
        Ok(true)
    }
    fn apply(&mut self,action:&Action)->Result<(),String>{
        if !self.preflight_action(action)? {return Err("preflight rejected".into());}
        let (cmd,params)=Self::command(action)?;
        self.last_action=None;
        self.last_result=None;
        let result=self.session.execute_checked(cmd,params).map_err(|e|e.to_string())?;
        self.last_action=Some(action.clone());
        self.last_result=Some(result);
        Ok(())
    }
    fn verify_action(&mut self,action:&Action)->Result<bool,String>{
        Ok(self.inspect_actual_object(action).is_ok())
    }
    fn object_proof_sha256(&mut self,action:&Action)->Result<String,String>{
        let native=self.inspect_actual_object(action)?;
        let bytes=serde_json::to_vec(&native).map_err(|e|e.to_string())?;
        Ok(format!("{:x}",Sha256::digest(bytes)))
    }
}

/// Native IDs sent to the provider can ONLY come from this native Session.
/// Sorted numeric ID inventory; excludes paths/media/credentials.
pub fn native_model_inventory(s:&Session)->Value{
    let mut comps=BTreeSet::<u64>::new();
    let mut layers=BTreeSet::<u64>::new();
    for (id,item) in &s.project.items {
        if let Some(comp)=item.as_comp(){
            comps.insert(id.0);
            for l in &comp.layers {layers.insert(l.id.0);}
        }
    }
    json!({"compIds":comps.into_iter().collect::<Vec<_>>(),
        "layerIds":layers.into_iter().collect::<Vec<_>>(),
        "maskIds":[],"effectIds":[]})
}

#[cfg(test)]
mod tests{
    use super::*;
    use shuvi_ai_provider::host::{GuardedHost,OwnerConsentRequest,TaskBinding,unintegrated_capabilities};
    use shuvi_ai_provider::guard::{OwnerConsent,Scope,GuardError};
    use shuvi_ai_provider::ipc::GuardedWireRequest;
    use shuvi_ai_provider::plan::{ReserveWire,independently_hash};
    use shuvi_ai_provider::transactional::TransactionalLedger;
    use std::{fs,path::PathBuf,time::{SystemTime,UNIX_EPOCH}};
    struct TestDb(PathBuf);
    impl TestDb {
        fn new()->Self{
            let t=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
            let p=std::env::temp_dir().join(format!("shuvi-real-motion-{}-{t}",std::process::id()));
            fs::create_dir(&p).unwrap();Self(p)
        }
        fn open(&self)->TransactionalLedger{
            TransactionalLedger::open(&self.0.join("owned.sqlite3")).unwrap()
        }
    }
    impl Drop for TestDb{
        fn drop(&mut self){let _=fs::remove_dir_all(&self.0);}
    }
    /// Explicit test double: not a trusted desktop owner approval!
    struct TestOwnerConsent{count:usize,yes:bool}
    impl OwnerConsent for TestOwnerConsent {
        fn grant(&mut self,scope:&Scope)->bool{
            self.count+=1;
            !scope.instruction.is_empty() && self.yes
        }
    }
    fn from_comp(s:&mut Session)->u64{
        s.execute_checked("comp.new",json!({"name":"Manual",
            "width":640,"height":360,"frameRate":30.0,"duration":5.0}))
            .unwrap()["comp"].as_u64().unwrap()
    }
    fn plan(revision:u64,actions:Vec<Value>)->(Value,ReserveWire,OwnerConsentRequest,TaskBinding){
        let value=json!({"taskId":"realmotion1234",
            "instruction":"Native motion trusted contract test",
            "snapshot":{"engine":"motion","projectId":"native-test.ecproj",
                "sessionId":"native-session-test-1234","version":revision},
            "actions":actions});
        let hash=independently_hash(&value).unwrap();
        (value.clone(),ReserveWire {
            task_id:"realmotion1234".into(),plan_hash:hash.clone(),
            project:value["snapshot"].clone(),plan:value.clone(),
        },OwnerConsentRequest{
            task_id:"realmotion1234".into(),plan_hash:hash.clone(),
        },TaskBinding{task_id:"realmotion1234".into(),plan_hash:hash})
    }
    fn wire(plan:&Value,index:usize,version:u64)->GuardedWireRequest{
        serde_json::from_value(json!({
            "taskId":"realmotion1234","stepIndex":index,
            "idempotencyKey":"f".repeat(64),
            "expectedSnapshot":{"engine":"motion","projectId":"native-test.ecproj",
                "sessionId":"native-session-test-1234","version":version},
            "action":plan["actions"][index]
        })).unwrap()
    }

    #[test]
    fn native_composition_sqlite_approval_readback_and_durable_replay_block(){
        let tmp=TestDb::new();
        let mut s=Session::new();
        let (p,reserve,consent,bind)=plan(s.revision,vec![json!({
            "type":"motion.createComposition","name":"New Real Comp",
            "width":320,"height":180,"fps":30.0,"durationSeconds":3.0
        })]);
        let mut ledger=tmp.open();
        let mut owner=EffectcraftNativeOwner::new(&mut s,"native-test.ecproj".into(),
            "native-session-test-1234".into()).unwrap();
        let mut host=GuardedHost{ledger:&mut ledger,owner:&mut owner};
        assert_eq!(host.reserve(&reserve).unwrap()["reserved"],true);
        let mut consent_ui=TestOwnerConsent{count:0,yes:true};
        assert_eq!(host.request_consent(&consent,&mut consent_ui).unwrap()["granted"],true);
        assert_eq!(consent_ui.count,1);
        let r=host.execute(wire(&p,0,0)).unwrap();
        assert_eq!(r["nativeVerified"],true);
        assert_eq!(r["after"]["version"],1);
        assert_eq!(r["objectProofSha256"].as_str().unwrap().len(),64);
        assert_eq!(host.recover(&bind).unwrap()["steps"],json!(["verified"]));
        assert_eq!(host.cancel(&bind).unwrap()["state"],"already_complete");
        assert!(matches!(host.execute(wire(&p,0,0)),Err(GuardError::OutOfOrder)|Err(GuardError::DuplicateOrUncertain)));
        drop(host);drop(owner);
        assert_eq!(s.project.items.values().filter(|i|i.name=="New Real Comp").count(),1);
        let reopened=tmp.open();
        assert_eq!(reopened.recovery("realmotion1234").unwrap(),vec!["verified"]);
    }

    #[test]
    fn actual_native_text_create_is_sqlite_verified(){
        let tmp=TestDb::new();
        let mut s=Session::new();
        let comp=from_comp(&mut s);
        let rev=s.revision;
        let (p,r,c,b)=plan(rev,vec![json!({
            "type":"motion.addText","compId":comp,"name":"Title",
            "text":"Native EffectCraft","x":20.0,"y":40.0,"size":36.0
        })]);
        let mut ledger=tmp.open();
        let mut owner=EffectcraftNativeOwner::new(&mut s,"native-test.ecproj".into(),
            "native-session-test-1234".into()).unwrap();
        let mut h=GuardedHost{ledger:&mut ledger,owner:&mut owner};
        h.reserve(&r).unwrap();h.request_consent(&c,&mut TestOwnerConsent{count:0,yes:true}).unwrap();
        let result=h.execute(wire(&p,0,rev)).unwrap();
        assert_eq!(result["nativeVerified"],true);
        assert_eq!(h.recover(&b).unwrap()["steps"],json!(["verified"]));
        drop(h);drop(owner);
        let layer=s.project.comp(ItemId(comp)).unwrap().layers.iter().find(|l|l.name=="Title").unwrap();
        let prop=layer.props.prop("text/sourceText").unwrap();
        assert!(matches!(&prop.value,effectcraft_engine::keyframe::Value::Text(doc) if doc.text=="Native EffectCraft"));
    }

    #[test]
    fn denied_consent_prevents_actual_native_changes(){
        let t=TestDb::new();let mut s=Session::new();
        let (p,r,c,b)=plan(0,vec![json!({
            "type":"motion.createComposition","name":"Forbidden","width":300,
            "height":200,"fps":30.0,"durationSeconds":3.0
        })]);
        let mut db=t.open();
        let mut owner=EffectcraftNativeOwner::new(&mut s,"native-test.ecproj".into(),
            "native-session-test-1234".into()).unwrap();
        let mut h=GuardedHost{ledger:&mut db,owner:&mut owner};
        h.reserve(&r).unwrap();
        assert_eq!(h.request_consent(&c,&mut TestOwnerConsent{count:0,yes:false}).unwrap()["granted"],false);
        assert_eq!(h.execute(wire(&p,0,0)).unwrap_err(),GuardError::NotApproved);
        assert_eq!(h.recover(&b).unwrap()["steps"],json!(["not_started"]));
        drop(h);drop(owner);
        assert!(s.project.items.is_empty());
    }

    #[test]
    fn manual_project_edit_blocks_stale_owner_approval(){
        let t=TestDb::new();let mut s=Session::new();
        let (_,r,c,_)=plan(0,vec![json!({
            "type":"motion.createComposition","name":"Unapproved","width":300,
            "height":200,"fps":30.0,"durationSeconds":3.0
        })]);
        let mut db=t.open();
        {
            let mut owner=EffectcraftNativeOwner::new(&mut s,"native-test.ecproj".into(),
                "native-session-test-1234".into()).unwrap();
            let mut h=GuardedHost{ledger:&mut db,owner:&mut owner};
            h.reserve(&r).unwrap();
        }
        from_comp(&mut s); // genuine manual edit outside owner approval.
        let mut owner=EffectcraftNativeOwner::new(&mut s,"native-test.ecproj".into(),
            "native-session-test-1234".into()).unwrap();
        let mut h=GuardedHost{ledger:&mut db,owner:&mut owner};
        let mut prompt=TestOwnerConsent{count:0,yes:true};
        assert_eq!(h.request_consent(&c,&mut prompt).unwrap_err(),GuardError::StaleProject);
        assert_eq!(prompt.count,0);
    }

    #[test]
    fn stop_prevents_all_native_edit_and_replay(){
        let t=TestDb::new();let mut s=Session::new();
        let (p,r,c,b)=plan(0,vec![json!({
            "type":"motion.createComposition","name":"Not Created","width":300,
            "height":200,"fps":30.0,"durationSeconds":3.0
        })]);
        let mut db=t.open();
        let mut owner=EffectcraftNativeOwner::new(&mut s,"native-test.ecproj".into(),
            "native-session-test-1234".into()).unwrap();
        let mut h=GuardedHost{ledger:&mut db,owner:&mut owner};
        h.reserve(&r).unwrap();
        h.request_consent(&c,&mut TestOwnerConsent{count:0,yes:true}).unwrap();
        assert_eq!(h.cancel(&b).unwrap()["state"],"before_first_edit");
        assert_eq!(h.execute(wire(&p,0,0)).unwrap_err(),GuardError::DuplicateOrUncertain);
        drop(h);drop(owner);
        assert!(s.project.items.is_empty());
    }

    #[test]
    fn native_inventory_uses_real_session_ids_without_paths(){
        let mut s=Session::new();
        let comp=from_comp(&mut s);
        let v=native_model_inventory(&s);
        assert!(v["compIds"].as_array().unwrap().contains(&json!(comp)));
        assert!(v["layerIds"].as_array().unwrap().is_empty());
        assert!(v.get("paths").is_none());
    }
}
