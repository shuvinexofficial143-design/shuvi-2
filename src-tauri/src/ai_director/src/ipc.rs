//! A04 typed WebView -> native-guard conversion. No arbitrary IPC or shell.
//! Does not register a Tauri command; only the reviewed unified native host may
//! call this after validating its own durable owner consent and step receipt.
use crate::guard::{Action,Editor,GuardError,Ledger,NativeOwner,Receipt,Snapshot,Version};
use serde::Deserialize;
use serde_json::{Value,json};
#[derive(Debug,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct GuardedWireRequest{
    pub task_id:String,
    pub step_index:usize,
    pub idempotency_key:String,
    pub expected_snapshot:WireSnapshot,
    pub action:Value,
}
#[derive(Debug,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct WireSnapshot{
    pub engine:String,pub project_id:String,pub session_id:String,pub version:Value,
}
fn lowercase_sha(v:&str)->bool{
    v.len()==64&&v.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b))
}
impl WireSnapshot{
    pub fn typed(self)->Result<Snapshot,GuardError>{
        let (editor,version)=match self.engine.as_str(){
            "video"=>{
                let v=self.version.as_str().ok_or(GuardError::Invalid)?;
                if !lowercase_sha(v){return Err(GuardError::Invalid);}
                (Editor::Video,Version::VideoSha256(v.to_owned()))
            },
            "motion"=>{
                let v=self.version.as_u64().ok_or(GuardError::Invalid)?;
                if v>9_007_199_254_740_991{return Err(GuardError::Invalid);}
                (Editor::Motion,Version::MotionRevision(v))
            },
            _=>return Err(GuardError::Invalid),
        };
        let s=Snapshot{editor,project_id:self.project_id,
            session_id:self.session_id,version};
        if !s.is_valid(){return Err(GuardError::Invalid);}
        Ok(s)
    }
}
fn mapped_action_name(name:&str)->Option<&'static str>{
    Some(match name{
        "video.split"=>"videoSplit","video.place"=>"videoPlace",
        "video.trim"=>"videoTrim","video.move"=>"videoMove",
        "video.delete"=>"videoDelete",
        "motion.createComposition"=>"motionCreateComposition",
        "motion.addText"=>"motionAddText",
        "motion.editText"=>"motionEditText",
        "motion.addShape"=>"motionAddShape",
        "motion.setTransform"=>"motionSetTransform",
        "motion.addEffect"=>"motionAddEffect",
        "motion.setMaskProperty"=>"motionSetMaskProperty",
        _=>return None,
    })
}
pub fn parse_action(mut value:Value,editor:&Editor)->Result<Action,GuardError>{
    let object=value.as_object_mut().ok_or(GuardError::Invalid)?;
    let original=object.get("type").and_then(Value::as_str).ok_or(GuardError::Invalid)?;
    let name=mapped_action_name(original).ok_or(GuardError::Invalid)?;
    object.insert("type".into(),Value::String(name.into()));
    let action:Action=serde_json::from_value(value).map_err(|_|GuardError::Invalid)?;
    if !action.is_valid(editor){return Err(GuardError::Invalid);}
    Ok(action)
}
#[derive(Debug)]
pub struct GuardedStep{
    pub task_id:String,pub step_index:usize,pub idempotency_key:String,
    pub expected:Snapshot,pub action:Action,
}
impl GuardedStep{
    pub fn parse(w:GuardedWireRequest)->Result<Self,GuardError>{
        if w.task_id.len()<8 || w.task_id.len()>64 ||
           !w.task_id.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'||b==b'_') ||
           w.step_index>=12||!lowercase_sha(&w.idempotency_key){
            return Err(GuardError::Invalid);
        }
        let expected=w.expected_snapshot.typed()?;
        let action=parse_action(w.action,&expected.editor)?;
        Ok(Self{task_id:w.task_id,step_index:w.step_index,
            idempotency_key:w.idempotency_key,expected,action})
    }
    /// Native owner must be locked across this call (including all manual UI
    /// edits); this only executes a previously reserved+approved native plan.
    /// The JS idempotency key is a receipt correlation ID, NOT authorization.
    pub fn execute<O:NativeOwner>(&self,ledger:&Ledger,owner:&mut O)->Result<Value,GuardError>{
        let r:Receipt=ledger.execute_bound(&self.task_id,self.step_index,
            &self.expected,&self.action,owner)?;
        self.format_receipt(r)
    }
    /// A06: preferred atomic SQLite step admission, native edit and verified
    /// readback. The single actual editor owner lock must span this full call.
    pub fn execute_transactional<O:NativeOwner>(
        &self,ledger:&mut crate::transactional::TransactionalLedger,owner:&mut O
    )->Result<Value,GuardError>{
        let r:Receipt=ledger.execute_bound(&self.task_id,self.step_index,
            &self.expected,&self.action,owner)?;
        self.format_receipt(r)
    }
    fn format_receipt(&self,r:Receipt)->Result<Value,GuardError>{
        // The native owner must return its exact affected-object SHA-256.
        if !lowercase_sha(&r.object_proof_sha256){
            return Err(GuardError::NativeOutcomeUncertain);
        }
        Ok(json!({
            "guarded":true,"nativeVerified":true,
            "taskId":self.task_id,"stepIndex":self.step_index,
            "idempotencyKey":self.idempotency_key,
            "objectProofSha256":r.object_proof_sha256,
            "after":{
                "engine":match r.after.editor{Editor::Video=>"video",Editor::Motion=>"motion"},
                "projectId":r.after.project_id,
                "sessionId":r.after.session_id,
                "version":match r.after.version {
                    Version::VideoSha256(s)=>json!(s),
                    Version::MotionRevision(n)=>json!(n),
                }
            }
        }))
    }
}
#[cfg(test)]
mod tests{
    use super::*;
    fn m()->Value{json!({
      "taskId":"task0001","stepIndex":0,"idempotencyKey":"a".repeat(64),
      "expectedSnapshot":{"engine":"motion","projectId":"scene.ecproj",
        "sessionId":"owner-1","version":4},
      "action":{"type":"motion.addShape","compId":2,"name":"Plate",
        "kind":"rect","x":1.0,"y":2.0,"width":120.0,"height":60.0,"fill":"#aa3355"}
    })}
    #[test]
    fn exact_webview_motion_action_parses_to_fixed_rust_enum(){
        let w:GuardedWireRequest=serde_json::from_value(m()).unwrap();
        let parsed=GuardedStep::parse(w).unwrap();
        assert!(matches!(parsed.action,Action::MotionAddShape{comp_id:2,..}));
    }
    #[test]
    fn model_cannot_send_arbitrary_commands_or_extra_keys(){
        let mut x=m();x["action"]["type"]=json!("system.shell");
        let w:GuardedWireRequest=serde_json::from_value(x).unwrap();
        assert!(GuardedStep::parse(w).is_err());
        let mut x=m();x["action"]["extra"]=json!("writeFile");
        let w:GuardedWireRequest=serde_json::from_value(x).unwrap();
        assert!(GuardedStep::parse(w).is_err());
    }
    #[test]
    fn stale_or_untrusted_snapshot_version_is_rejected(){
        let mut x=m();x["expectedSnapshot"]["version"]=json!("fake");
        let w:GuardedWireRequest=serde_json::from_value(x).unwrap();
        assert!(GuardedStep::parse(w).is_err());
        let mut x=m();x["expectedSnapshot"]["engine"]=json!("video");
        let w:GuardedWireRequest=serde_json::from_value(x).unwrap();
        assert!(GuardedStep::parse(w).is_err());
    }
    #[test]
    fn native_request_shape_rejects_additional_untrusted_fields(){
        let mut x=m();x["approval"]=json!(true);
        assert!(serde_json::from_value::<GuardedWireRequest>(x).is_err());
    }
}
