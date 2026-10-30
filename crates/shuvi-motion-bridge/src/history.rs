//! Owner-facing real EffectCraft Undo/Redo on the same native Session.
//! Never emulate a history stack in JavaScript; labels and project state are
//! always read from the pinned EffectCraft history and Project model.
use serde_json::json;
use crate::MotionBridge;

#[derive(Clone,Debug,PartialEq,Eq)]
pub struct HistorySnapshot {
    pub can_undo:bool,
    pub can_redo:bool,
    pub undo_depth:usize,
    pub redo_depth:usize,
    pub next_undo:Option<String>,
    pub next_redo:Option<String>,
    pub revision:u64,
    pub dirty:bool,
}
#[derive(Clone,Debug,PartialEq,Eq)]
pub struct HistoryReceipt {
    pub action:&'static str,
    pub label:String,
    pub before_revision:u64,
    pub after:HistorySnapshot,
    pub project_changed:bool,
}
impl MotionBridge {
    pub fn inspect_history(&self)->HistorySnapshot{
        let undo=&self.session.history.undo;
        let redo=&self.session.history.redo;
        HistorySnapshot{
            can_undo:!undo.is_empty(),
            can_redo:!redo.is_empty(),
            undo_depth:undo.len(),
            redo_depth:redo.len(),
            next_undo:undo.last().map(|item|item.0.clone()),
            next_redo:redo.last().map(|item|item.0.clone()),
            revision:self.session.revision,
            dirty:self.session.is_dirty(),
        }
    }
    fn apply_history(&mut self,undo:bool)->Result<HistoryReceipt,String>{
        let before=self.inspect_history();
        if undo&&!before.can_undo{return Err("nothing to undo".into());}
        if !undo&&!before.can_redo{return Err("nothing to redo".into());}
        let original=self.session.project.clone();
        let command=if undo{"edit.undo"}else{"edit.redo"};
        let reply=self.session.execute_checked(command,json!({}))
            .map_err(|e|format!("native EffectCraft {command} failed: {e}"))?;
        let key=if undo{"undone"}else{"redone"};
        let label=reply.get(key).and_then(|x|x.as_str())
            .ok_or_else(||format!("native EffectCraft {command} returned no label"))?;
        let expected=if undo{before.next_undo.as_deref()}else{before.next_redo.as_deref()};
        if expected!=Some(label){return Err("native EffectCraft history label mismatch".into());}
        let after=self.inspect_history();
        let changed=original.as_ref()!=self.session.project.as_ref();
        if !changed{return Err("EffectCraft history replied without changing project".into());}
        if undo&&!after.can_redo{return Err("native redo state missing after undo".into());}
        if !undo&&!after.can_undo{return Err("native undo state missing after redo".into());}
        Ok(HistoryReceipt{
            action:if undo{"undo"}else{"redo"},
            label:label.into(),before_revision:before.revision,after,project_changed:changed,
        })
    }
    pub fn undo_native(&mut self)->Result<HistoryReceipt,String>{self.apply_history(true)}
    pub fn redo_native(&mut self)->Result<HistoryReceipt,String>{self.apply_history(false)}
}
