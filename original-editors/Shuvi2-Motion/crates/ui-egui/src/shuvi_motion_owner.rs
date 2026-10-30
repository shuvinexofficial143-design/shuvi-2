//! M-AI03 native EffectCraft motion adapter. Production approval remains OFF.
//! The only permit constructor is cfg(test). The 2.0.3 SQLite OwnerConsent
//! and guarded step executor must be integrated before a production permit.

use effectcraft_engine::{commands, Session};
use effectcraft_engine::project::{ItemId, LayerId, LayerSource};
use effectcraft_keyframe::Value as Kv;
use serde::Serialize;
use serde_json::{json, Value};

#[derive(Clone, Debug)]
pub(crate) enum TypedMotionAction {
    CreateComposition { name: String, width: u32, height: u32, fps: f64, duration: f64 },
    AddText { comp: u64, name: String, text: String, x: f64, y: f64, size: f64 },
    EditText { comp: u64, layer: u64, text: String },
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum MotionError {
    Stale,
    Invalid(String),
    /// After an attempted native mutation, never automatically retry.
    Uncertain(String),
}
#[derive(Clone, Debug, Serialize)]
pub(crate) struct NativeReceipt {
    pub command: &'static str,
    pub before_revision: u64,
    pub after_revision: u64,
    pub object_id: u64,
    pub native_readback: Value,
    pub verified: bool,
}
/// Impossible to construct from a frontend/AI request in production M-AI03.
/// A future *trusted* 2.0.3 guarded executor must own authorization.
pub(crate) struct OwnerPermit { _private: () }
#[cfg(test)]
impl OwnerPermit {
    fn for_test() -> Self { Self { _private: () } }
}
fn name_ok(s: &str) -> bool {
    !s.is_empty() && s.len() <= 120 && s.trim() == s && !s.chars().any(char::is_control)
}
fn text_ok(s: &str) -> bool {
    !s.is_empty() && s.chars().count() <= 2000 && s.trim() == s && !s.chars().any(char::is_control)
}
fn finite_xy(x: f64) -> bool { x.is_finite() && (-100000.0..=100000.0).contains(&x) }
fn native_params(action: &TypedMotionAction) -> (&'static str, Value) {
    match action {
        TypedMotionAction::CreateComposition { name, width, height, fps, duration } =>
            ("comp.new", json!({"name":name,"width":width,"height":height,"frameRate":fps,"duration":duration})),
        TypedMotionAction::AddText { name,text,x,y,size,.. } =>
            ("layer.newText", json!({"name":name,"text":text,"position":[x,y],"size":size,"edit":false})),
        TypedMotionAction::EditText { layer,text,.. } =>
            ("layer.setText", json!({"layer":layer,"text":text})),
    }
}
fn text_value(session: &Session, comp: u64, layer: u64) -> Option<String> {
    let l = session.project.comp(ItemId(comp))?.layer(LayerId(layer))?;
    if !matches!(l.source, LayerSource::Text) { return None; }
    let prop = l.props.prop("text/sourceText")?;
    match &prop.value {
        Kv::Text(doc) => Some(doc.text.clone()),
        Kv::Str(txt) => Some(txt.clone()),
        _ => None,
    }
}
fn preflight(s: &Session, action: &TypedMotionAction) -> Result<(), MotionError> {
    let valid = match action {
        TypedMotionAction::CreateComposition { name,width,height,fps,duration } =>
            name_ok(name) && (1..=8192).contains(width) && (1..=8192).contains(height)
                && fps.is_finite() && (1.0..=120.0).contains(fps)
                && duration.is_finite() && *duration>=1.0/fps && *duration<=600.0
                && !s.project.items.values().any(|it| it.name == *name),
        TypedMotionAction::AddText { comp,name,text,x,y,size } =>
            *comp>0 && s.active_comp_id()==Some(ItemId(*comp)) &&
                name_ok(name) && text_ok(text) && finite_xy(*x) && finite_xy(*y)
                && size.is_finite() && (1.0..=1000.0).contains(size)
                && s.project.comp(ItemId(*comp)).is_some_and(|c|!c.layers.iter().any(|l|l.name==*name)),
        TypedMotionAction::EditText { comp,layer,text } =>
            *comp>0 && *layer>0 && text_ok(text) &&
                s.active_comp_id()==Some(ItemId(*comp)) &&
                text_value(s,*comp,*layer).is_some_and(|existing|existing!=*text),
    };
    if !valid { return Err(MotionError::Invalid("rejected action, target or unchanged content".into())); }
    let (cmd,params)=native_params(action);
    let spec=commands::find(cmd).ok_or_else(||MotionError::Invalid("native command unavailable".into()))?;
    if !spec.journal { return Err(MotionError::Invalid("native edit lacks journal".into())); }
    commands::check_params(spec,&params).map_err(|e|MotionError::Invalid(e.to_string()))
}
fn readback(s: &Session, action: &TypedMotionAction, result: &Value) -> Result<(u64,Value),MotionError> {
    let uncertain=|msg:&str|MotionError::Uncertain(msg.into());
    match action {
        TypedMotionAction::CreateComposition { name,width,height,fps,duration } => {
            let id=result["comp"].as_u64().filter(|x|*x>0).ok_or_else(||uncertain("missing comp id"))?;
            let item=s.project.item(ItemId(id)).ok_or_else(||uncertain("comp item disappeared"))?;
            let comp=s.project.comp(ItemId(id)).ok_or_else(||uncertain("not native comp"))?;
            if item.name!=*name || comp.width!=*width || comp.height!=*height ||
                (comp.frame_rate.as_f64()-fps).abs()>0.02 ||
                (comp.duration.seconds()-duration).abs()>1.0/fps+0.00001 {
                return Err(uncertain("composition native readback mismatched"));
            }
            Ok((id,json!({"kind":"composition","id":id,"name":item.name,
                "width":comp.width,"height":comp.height,
                "fps":comp.frame_rate.as_f64(),"duration":comp.duration.seconds()})))
        }
        TypedMotionAction::AddText { comp,name,text,x,y,size:_ } => {
            let id=result["layer"].as_u64().filter(|x|*x>0).ok_or_else(||uncertain("missing text layer id"))?;
            let layer=s.project.comp(ItemId(*comp)).and_then(|c|c.layer(LayerId(id)))
                .ok_or_else(||uncertain("text layer missing in project"))?;
            if layer.name!=*name || text_value(s,*comp,id).as_deref()!=Some(text.as_str()){
                return Err(uncertain("new text content mismatch"));
            }
            let pos=layer.props.prop("transform/position").and_then(|p|match &p.value {
                Kv::Vec3(v)=>Some(*v),
                _=>None,
            }).ok_or_else(||uncertain("position missing"))?;
            if (pos[0]-x).abs()>0.00001 || (pos[1]-y).abs()>0.00001 {
                return Err(uncertain("text native position mismatch"));
            }
            Ok((id,json!({"kind":"textLayer","comp":comp,"id":id,"name":layer.name,"text":text,"position":pos})))
        }
        TypedMotionAction::EditText { comp,layer,text } => {
            let l=s.project.comp(ItemId(*comp)).and_then(|c|c.layer(LayerId(*layer)))
                .ok_or_else(||uncertain("edited layer missing"))?;
            if text_value(s,*comp,*layer).as_deref()!=Some(text.as_str()){
                return Err(uncertain("edited native text mismatch"));
            }
            Ok((*layer,json!({"kind":"textLayer","comp":comp,"id":layer,"name":l.name,"text":text})))
        }
    }
}
/// Same Session as the original UI; caller must persist 2.0.3 SQLite intent
/// and hold a shared owner lock BEFORE presenting a production permit.
pub(crate) fn apply_native(
    session: &mut Session,
    expected_revision: u64,
    action: &TypedMotionAction,
    _permit: &OwnerPermit,
) -> Result<NativeReceipt,MotionError> {
    if session.revision!=expected_revision {return Err(MotionError::Stale);}
    preflight(session,action)?;
    let (cmd,params)=native_params(action);
    let result=session.execute_checked(cmd,params)
        .map_err(|e|MotionError::Uncertain(format!("native engine: {e}")))?;
    if session.revision<=expected_revision {return Err(MotionError::Uncertain("no revision progression".into()));}
    let (id,proof)=readback(session,action,&result)?;
    Ok(NativeReceipt {command:cmd,before_revision:expected_revision,
        after_revision:session.revision,object_id:id,
        native_readback:proof,verified:true})
}
#[cfg(test)]
mod tests {
    use super::*;
    fn new_comp() -> TypedMotionAction {
        TypedMotionAction::CreateComposition {
            name:"Shuvi Native".into(),width:640,height:360,fps:30.0,duration:5.0
        }
    }
    fn run(s:&mut Session,a:&TypedMotionAction) -> Result<NativeReceipt,MotionError> {
        let rev=s.revision;
        apply_native(s,rev,a,&OwnerPermit::for_test())
    }
    #[test]
    fn creates_a_real_native_comp_with_proven_content() {
        let mut s=Session::new();
        let r=run(&mut s,&new_comp()).unwrap();
        assert!(r.verified && r.after_revision>r.before_revision);
        assert_eq!(r.native_readback["width"],640);
        assert_eq!(r.native_readback["name"],"Shuvi Native");
        assert!(s.project.comp(ItemId(r.object_id)).is_some());
    }
    #[test]
    fn creates_and_edits_actual_native_text_properties() {
        let mut s=Session::new();
        let comp=run(&mut s,&new_comp()).unwrap().object_id;
        let a=TypedMotionAction::AddText {
            comp,name:"Title".into(),text:"Hello".into(),x:140.0,y:80.0,size:48.0
        };
        let r=run(&mut s,&a).unwrap();
        assert_eq!(r.native_readback["text"],"Hello");
        let edit=TypedMotionAction::EditText {comp,layer:r.object_id,text:"Updated".into()};
        let changed=run(&mut s,&edit).unwrap();
        assert_eq!(changed.native_readback["text"],"Updated");
        assert_eq!(changed.object_id,r.object_id);
    }
    #[test]
    fn stale_revision_refuses_without_native_edit() {
        let mut s=Session::new();
        let _=run(&mut s,&new_comp()).unwrap();
        let size=s.journal.len();
        assert!(matches!(apply_native(&mut s,0,&new_comp(),&OwnerPermit::for_test()),Err(MotionError::Stale)));
        assert_eq!(s.journal.len(),size);
    }
    #[test]
    fn rejects_foreign_comp_and_missing_layer() {
        let mut s=Session::new();
        let _=run(&mut s,&new_comp()).unwrap();
        let old=s.journal.len();
        let action=TypedMotionAction::EditText {comp:1234,layer:777,text:"Hijack".into()};
        assert!(matches!(run(&mut s,&action),Err(MotionError::Invalid(_))));
        assert_eq!(s.journal.len(),old);
    }
    #[test]
    fn rejects_invalid_dimensions_and_nonfinite_numbers() {
        let mut s=Session::new();
        let action=TypedMotionAction::CreateComposition {
            name:"Wrong".into(),width:0,height:1080,fps:f64::NAN,duration:8.0
        };
        assert!(matches!(run(&mut s,&action),Err(MotionError::Invalid(_))));
        assert_eq!(s.revision,0);
        assert_eq!(s.journal.len(),0);
    }
    #[test]
    fn no_duplicate_same_value_text_write() {
        let mut s=Session::new();
        let comp=run(&mut s,&new_comp()).unwrap().object_id;
        let layer=run(&mut s,&TypedMotionAction::AddText {
            comp,name:"T".into(),text:"Same".into(),x:0.0,y:0.0,size:24.0
        }).unwrap().object_id;
        let old=s.journal.len();
        assert!(matches!(run(&mut s,&TypedMotionAction::EditText {
            comp,layer,text:"Same".into()
        }),Err(MotionError::Invalid(_))));
        assert_eq!(s.journal.len(),old);
    }
    #[test]
    fn chat_has_no_production_owner_permit() {
        let state=crate::panels::shuvi_ai::ShuviAiState::default();
        assert!(state.pending.is_none());
        assert_eq!(state.provider_label(),"Provider: Not connected");
    }
}
