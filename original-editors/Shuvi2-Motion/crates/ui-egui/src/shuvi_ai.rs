//! Shuvi Motion M-AI01. Same-session native readback, NO TCP and NO AI editing.
//! No user/model-generated approval or arbitrary commands can execute here.

use std::sync::Arc;
use effectcraft_engine::{Session, commands};
use serde::Serialize;
use serde_json::{Value, json};

/// These variants are the entire native read-only allowlist.
#[derive(Clone, Debug)]
pub enum InspectRequest {
    ProjectSummary,
    EditorState,
    Capabilities,
    Composition { comp: Option<u64> },
    Layer { comp: Option<u64>, layer: u64, depth: u8 },
    DescribeCommand { command: String },
}

impl InspectRequest {
    fn native(&self) -> (&'static str, Value) {
        match self {
            Self::ProjectSummary => ("project.summary", json!({})),
            Self::EditorState => ("editor.state", json!({})),
            Self::Capabilities => ("app.capabilities", json!({})),
            Self::Composition { comp } => {
                let mut p = json!({});
                if let Some(c) = comp { p["comp"] = json!(c); }
                ("comp.info", p)
            }
            Self::Layer { comp, layer, depth } => {
                let mut p = json!({"layer": layer, "depth": (*depth).min(6)});
                if let Some(c) = comp { p["comp"] = json!(c); }
                ("layer.tree", p)
            }
            Self::DescribeCommand { command } => ("command.describe", json!({"command": command})),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct InspectionReceipt {
    pub native_command: &'static str,
    pub revision: u64,
    pub result: Value,
}

#[derive(Clone, Debug)]
pub struct CompositionDraft {
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub frame_rate: f64,
    pub duration_seconds: f64,
}

/// Preview data only. M-AI01 deliberately has no execution method.
#[derive(Clone, Debug, Serialize)]
pub struct PendingCommand {
    pub native_command: &'static str,
    pub expected_revision: u64,
    pub params: Value,
    pub requires_owner_approval: bool,
}

/// The original egui app must pass its own actual mutable Session reference.
pub struct NativeMotionProbe<'a> {
    session: &'a mut Session,
}

impl<'a> NativeMotionProbe<'a> {
    pub fn new(session: &'a mut Session) -> Self { Self { session } }
    pub fn revision(&self) -> u64 { self.session.revision }

    fn ensure_revision(&self, expected: u64) -> Result<(), String> {
        if self.session.revision != expected {
            return Err(format!("stale native revision: expected {expected}, actual {}", self.session.revision));
        }
        Ok(())
    }

    /// Only native engine queries with journal=false are allowed.
    /// Extra readback checks detect a surprising side effect.
    pub fn inspect(&mut self, expected: u64, request: InspectRequest) -> Result<InspectionReceipt, String> {
        self.ensure_revision(expected)?;
        let (id, params) = request.native();
        let spec = commands::find(id).ok_or_else(|| format!("missing native query: {id}"))?;
        if spec.journal { return Err(format!("journaled query rejected: {id}")); }
        let project = Arc::clone(&self.session.project);
        let undo = self.session.history.undo.len();
        let journal = self.session.journal.len();
        let value = self.session.execute_checked(id, params)
            .map_err(|err| format!("native inspection failed: {err}"))?;
        if self.session.revision != expected
            || !Arc::ptr_eq(&project, &self.session.project)
            || undo != self.session.history.undo.len()
            || journal != self.session.journal.len()
        {
            return Err("native inspection changed state; abort".into());
        }
        Ok(InspectionReceipt { native_command: id, revision: expected, result: value })
    }

    /// Command-schema-backed plan. It does not execute a comp or grant consent.
    pub fn preview_new_composition(&self, expected: u64, draft: &CompositionDraft) -> Result<PendingCommand, String> {
        self.ensure_revision(expected)?;
        let name = draft.name.trim();
        if name.is_empty() || name.chars().count() > 100 || name.chars().any(char::is_control) {
            return Err("invalid composition name".into());
        }
        if !(1..=8192).contains(&draft.width) || !(1..=8192).contains(&draft.height) {
            return Err("invalid composition dimensions".into());
        }
        if !draft.frame_rate.is_finite()
            || !(1.0..=120.0).contains(&draft.frame_rate)
            || !draft.duration_seconds.is_finite()
            || !(0.1..=3600.0).contains(&draft.duration_seconds)
        {
            return Err("invalid frame rate or duration".into());
        }
        let p = json!({
            "name": name,
            "width": draft.width,
            "height": draft.height,
            "frameRate": draft.frame_rate,
            "duration": draft.duration_seconds
        });
        let spec = commands::find("comp.new").ok_or_else(|| "native comp.new unavailable".to_string())?;
        if !spec.journal { return Err("native edit is not journaled".into()); }
        commands::check_params(spec, &p).map_err(|err| format!("schema rejected plan: {err}"))?;
        Ok(PendingCommand {
            native_command: "comp.new",
            expected_revision: expected,
            params: p,
            requires_owner_approval: true,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_is_non_mutating() -> Result<(), String> {
        let mut session = Session::new();
        let original = Arc::clone(&session.project);
        let rev = session.revision;
        let read = NativeMotionProbe::new(&mut session).inspect(rev, InspectRequest::ProjectSummary)?;
        assert_eq!(read.native_command, "project.summary");
        assert!(read.result["items"].is_array());
        assert!(Arc::ptr_eq(&original, &session.project));
        assert!(session.history.undo.is_empty());
        assert!(session.journal.is_empty());
        Ok(())
    }

    #[test]
    fn same_session_reads_manual_edits() -> Result<(), String> {
        let mut session = Session::new();
        let made = session.execute_checked("comp.new", json!({
            "name": "Manual", "width": 640, "height": 360, "frameRate": 30, "duration": 4
        })).map_err(|e| e.to_string())?;
        let id = made["comp"].as_u64().ok_or_else(|| "no comp id".to_string())?;
        let rev = session.revision;
        let read = NativeMotionProbe::new(&mut session)
            .inspect(rev, InspectRequest::Composition { comp: Some(id) })?;
        assert_eq!(read.result["name"], "Manual");
        assert_eq!(read.result["width"], 640);
        Ok(())
    }

    #[test]
    fn stale_guard_blocks_queries_and_previews() -> Result<(), String> {
        let mut session = Session::new();
        let old = session.revision;
        session.execute_checked("comp.new", json!({"name": "Changed"}))
            .map_err(|e| e.to_string())?;
        assert_ne!(session.revision, old);
        let mut probe = NativeMotionProbe::new(&mut session);
        assert!(probe.inspect(old, InspectRequest::ProjectSummary).is_err());
        assert!(probe.preview_new_composition(old, &CompositionDraft {
            name: "Stale".into(), width: 1280, height: 720,
            frame_rate: 30.0, duration_seconds: 4.0,
        }).is_err());
        Ok(())
    }

    #[test]
    fn preview_never_executes_edit() -> Result<(), String> {
        let mut session = Session::new();
        let original = Arc::clone(&session.project);
        let rev = session.revision;
        let plan = NativeMotionProbe::new(&mut session).preview_new_composition(rev, &CompositionDraft {
            name: "AI Proposal".into(), width: 1920, height: 1080,
            frame_rate: 30.0, duration_seconds: 5.0,
        })?;
        assert_eq!(plan.native_command, "comp.new");
        assert!(plan.requires_owner_approval);
        assert!(Arc::ptr_eq(&original, &session.project));
        assert!(session.journal.is_empty());
        Ok(())
    }

    #[test]
    fn invalid_previews_are_rejected() {
        let mut session = Session::new();
        let rev = session.revision;
        let probe = NativeMotionProbe::new(&mut session);
        let mut d = CompositionDraft {
            name: "Safe".into(), width: 0, height: 1080,
            frame_rate: 30.0, duration_seconds: 4.0,
        };
        assert!(probe.preview_new_composition(rev, &d).is_err());
        d.width = 1920;
        d.name = "bad\nname".into();
        assert!(probe.preview_new_composition(rev, &d).is_err());
        d.name = "Safe".into();
        d.frame_rate = f64::NAN;
        assert!(probe.preview_new_composition(rev, &d).is_err());
    }

    #[test]
    fn readback_of_actual_schema() -> Result<(), String> {
        let mut session = Session::new();
        let rev = session.revision;
        let read = NativeMotionProbe::new(&mut session)
            .inspect(rev, InspectRequest::DescribeCommand { command: "comp.new".into() })?;
        assert_eq!(read.result["id"], "comp.new");
        assert!(read.result["schema"].is_object());
        Ok(())
    }

    #[test]
    fn all_typed_commands_are_query_only() {
        let requests = [
            InspectRequest::ProjectSummary,
            InspectRequest::EditorState,
            InspectRequest::Capabilities,
            InspectRequest::Composition { comp: None },
            InspectRequest::Layer { comp: None, layer: 1, depth: 255 },
            InspectRequest::DescribeCommand { command: "comp.new".into() },
        ];
        for r in requests {
            let (id, _) = r.native();
            assert!(commands::find(id).is_some_and(|spec| !spec.journal));
            assert!(!id.starts_with("file."));
            assert!(!id.starts_with("script."));
        }
    }
}
