//! A05: independent native reservation of one entire JS-approved candidate plan.
//! The frontend cannot bless a changed action by sending an arbitrary planHash.
//! Native owner remains exclusive across the reservation/version comparison.
use crate::guard::{Ledger,NativeOwner,Scope,GuardError,Snapshot};
use crate::ipc::{parse_action,WireSnapshot};
use serde::Deserialize;
use serde_json::{Value,Map};
use sha2::{Digest,Sha256};

#[derive(Debug,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct ReserveWire {
    pub task_id:String,
    pub plan_hash:String,
    pub project:Value,
    pub plan:Value,
}
fn hex64(s:&str)->bool{s.len()==64&&s.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b))}
fn strict<'a>(v:&'a Value,keys:&[&str])->Result<&'a Map<String,Value>,GuardError>{
    let obj=v.as_object().ok_or(GuardError::Invalid)?;
    if obj.len()!=keys.len()||keys.iter().any(|k|!obj.contains_key(*k)) {
        return Err(GuardError::Invalid);
    }
    Ok(obj)
}
pub fn independently_hash(plan:&Value)->Result<String,GuardError>{
    let bytes=serde_json::to_vec(plan).map_err(|_|GuardError::Invalid)?;
    if bytes.len()>48000{return Err(GuardError::Invalid);}
    Ok(format!("{:x}",Sha256::digest(bytes)))
}
fn build_scope(request:&ReserveWire)->Result<Scope,GuardError>{
    if !hex64(&request.plan_hash){return Err(GuardError::Invalid);}
    let obj=strict(&request.plan,&["taskId","instruction","snapshot","actions"])?;
    let task=obj["taskId"].as_str().ok_or(GuardError::Invalid)?;
    if task!=request.task_id{return Err(GuardError::Invalid);}
    let instruction=obj["instruction"].as_str().ok_or(GuardError::Invalid)?;
    if instruction.is_empty()||instruction.trim()!=instruction||
       instruction.chars().count()>2000||
       instruction.chars().any(char::is_control) {
        return Err(GuardError::Invalid);
    }
    let project:WireSnapshot=serde_json::from_value(request.project.clone())
        .map_err(|_|GuardError::Invalid)?;
    let snapshot:WireSnapshot=serde_json::from_value(obj["snapshot"].clone())
        .map_err(|_|GuardError::Invalid)?;
    let bound:Snapshot=project.typed()?;
    let snap=snapshot.typed()?;
    if bound!=snap{return Err(GuardError::StaleProject);}
    let steps=obj["actions"].as_array().ok_or(GuardError::Invalid)?;
    if !(1..=12).contains(&steps.len()){return Err(GuardError::Invalid);}
    let mut actions=Vec::with_capacity(steps.len());
    for action in steps {
        actions.push(parse_action(action.clone(),&snap.editor)?);
    }
    // The native ledger keeps the *identical* frontend plan SHA only after
    // recomputing it from every field; merely supplying a digest never grants.
    if independently_hash(&request.plan)?!=request.plan_hash {
        return Err(GuardError::Invalid);
    }
    Ok(Scope{task_id:request.task_id.clone(),plan_hash:request.plan_hash.clone(),
        instruction:instruction.to_owned(),snapshot:snap,actions})
}
impl ReserveWire {
    /// Caller must hold native owner lock shared with manual edits while
    /// inspecting owner.snapshot and reserving. Not a Tauri command itself.
    pub fn reserve<O:NativeOwner>(&self,ledger:&Ledger,owner:&mut O)
        ->Result<String,GuardError>{
        let scope=build_scope(self)?;
        let current=owner.snapshot().map_err(|_|GuardError::NativeOutcomeUncertain)?;
        if current!=scope.snapshot{return Err(GuardError::StaleProject);}
        ledger.reserve(&scope)?;
        Ok(self.plan_hash.clone())
    }
}
#[cfg(test)]
mod tests{
    use super::*;
    use serde_json::json;
    fn candidate()->Value{json!({
       "taskId":"task0001","instruction":"एक rectangle बनाओ",
       "snapshot":{"engine":"motion","projectId":"scene.ecproj",
         "version":4,"sessionId":"host-session-1"},
       "actions":[{"type":"motion.addShape","compId":2,"name":"Shape",
          "kind":"rect","x":12,"y":20,"width":120,"height":60,"fill":"#112233"}]
    })}
    #[test]
    fn canonical_sha_is_key_order_independent(){
       let a=candidate();
       let b:Value=serde_json::from_str(r#"{"instruction":"एक rectangle बनाओ","actions":[{"fill":"#112233","height":60,"width":120,"y":20,"x":12,"kind":"rect","name":"Shape","compId":2,"type":"motion.addShape"}],"snapshot":{"sessionId":"host-session-1","version":4,"projectId":"scene.ecproj","engine":"motion"},"taskId":"task0001"}"#).unwrap();
       assert_eq!(independently_hash(&a).unwrap(),independently_hash(&b).unwrap());
       assert_eq!(independently_hash(&a).unwrap(),
           "3fbba55c9fb67a596487b13f556469770b59b40f4bf29b3fef51afb1a6cf6a40");
    }
    #[test]
    fn substitution_of_any_action_changes_native_digest(){
       let mut v=candidate();let first=independently_hash(&v).unwrap();
       v["actions"][0]["width"]=json!(121);
       assert_ne!(first,independently_hash(&v).unwrap());
    }
    #[test]
    fn rejects_wrong_or_extra_plan_fields(){
        let p=candidate();
        let r=ReserveWire{task_id:"task0001".into(),plan_hash:"0".repeat(64),
            project:p["snapshot"].clone(),plan:p.clone()};
        assert!(matches!(build_scope(&r),Err(GuardError::Invalid)));
        let mut extra=p.clone();extra["approval"]=json!(true);
        let r=ReserveWire{task_id:"task0001".into(),plan_hash:independently_hash(&extra).unwrap(),
            project:p["snapshot"].clone(),plan:extra};
        assert!(matches!(build_scope(&r),Err(GuardError::Invalid)));
    }
    #[test]
    fn untrusted_project_field_cannot_substitute_another_session(){
        let p=candidate();let sha=independently_hash(&p).unwrap();
        let mut claimed=p["snapshot"].clone();claimed["sessionId"]=json!("other-session");
        let r=ReserveWire{task_id:"task0001".into(),plan_hash:sha,project:claimed,plan:p};
        assert!(matches!(build_scope(&r),Err(GuardError::StaleProject)));
    }
}
