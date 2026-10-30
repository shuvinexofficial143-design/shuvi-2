//! Shuvi AI native egui dock. No HTML editor, no TCP listener, no provider or model mock.
//! The only native access in this phase is the real, same-session read-only probe.
//! This panel is NOT an authorization authority: a disabled approval control is intentional.

use egui::{Rect, UiBuilder};
use serde_json::Value;
use std::sync::{Arc, Weak};
use effectcraft_engine::{Session, project::{Project, ItemId}};

use crate::EffectcraftApp;
use crate::shuvi_ai::{CompositionDraft, InspectRequest, NativeMotionProbe, PendingCommand};

const MAX_MESSAGE_CHARS: usize = 4000;
const MAX_CHAT_TURNS: usize = 40;

/// Snapshot of the ACTUAL original native editor document at local preview
/// creation. A revision alone is insufficient: file.newProject, file.open and
/// composition switches can produce the same revision on different projects.
/// A Weak native project identity invalidates on document replacement without
/// retaining potentially large old project snapshots or forcing extra COW clones.
/// This is NOT a model-provided identity or an authorization token.
#[derive(Clone, Debug)]
pub struct NativePreviewBinding {
    revision: u64,
    project: Weak<Project>,
    plan: PendingCommand,
    path: Option<String>,
    active_comp: Option<ItemId>,
}

impl NativePreviewBinding {
    pub fn capture(session: &Session, plan: &PendingCommand) -> Self {
        Self {
            revision: session.revision,
            project: Arc::downgrade(&session.project),
            plan: plan.clone(),
            path: session.path.clone(),
            active_comp: session.active_comp_id(),
        }
    }

    pub fn matches(&self, session: &Session, pending: &PendingCommand) -> bool {
        self.plan == *pending
            && self.plan.requires_owner_approval
            && self.revision == session.revision
            && self.project.upgrade().is_some_and(|p|Arc::ptr_eq(&p,&session.project))
            && self.path == session.path
            && self.active_comp == session.active_comp_id()
    }
}

#[derive(Clone, Debug)]
pub struct ChatTurn {
    pub role: &'static str,
    pub text: String,
}

/// Frontend-only state: deliberately not serialized to project files or sent to logging.
#[derive(Clone, Debug)]
pub struct ShuviAiState {
    pub input: String,
    pub chat: Vec<ChatTurn>,
    pub status: String,
    pub draft: CompositionDraft,
    pub pending: Option<PendingCommand>,
    pub preview_binding: Option<NativePreviewBinding>,
    pub last_read_revision: Option<u64>,
}

impl Default for ShuviAiState {
    fn default() -> Self {
        Self {
            input: String::new(),
            chat: Vec::new(),
            status: "Not connected — no API key, provider, or edit execution configured".into(),
            draft: CompositionDraft {
                name: "Shuvi Motion Composition".into(),
                width: 1920,
                height: 1080,
                frame_rate: 30.0,
                duration_seconds: 5.0,
            },
            pending: None,
            preview_binding: None,
            last_read_revision: None,
        }
    }
}

impl ShuviAiState {
    pub fn provider_label(&self) -> &'static str {
        "Provider: Not connected"
    }

    /// Capture the owner's instruction locally, but NEVER represent it as a model response.
    pub fn submit_local_message(&mut self) -> bool {
        let text = self.input.trim();
        if text.is_empty() {
            self.status = "Enter an instruction first".into();
            return false;
        }
        if text.chars().count() > MAX_MESSAGE_CHARS {
            self.status = format!("Instruction too long (maximum {MAX_MESSAGE_CHARS} characters)");
            return false;
        }
        let message = text.to_owned();
        self.input.clear();
        self.chat.push(ChatTurn { role: "You", text: message });
        self.chat.push(ChatTurn {
            role: "System",
            text: "Provider not connected. This note remains local; no AI request or native edit was sent.".into(),
        });
        if self.chat.len() > MAX_CHAT_TURNS {
            self.chat.drain(..(self.chat.len() - MAX_CHAT_TURNS));
        }
        self.status = "Instruction captured locally. AI execution disabled.".into();
        true
    }

    /// Fail closed if a preview lost its native project owner. Called each UI
    /// pass before the preview is shown. Never grants permission to execute.
    pub fn invalidate_stale_preview(&mut self, session: &Session) {
        if self.pending.is_some() &&
            !self.preview_binding.as_ref().is_some_and(|binding|
                self.pending.as_ref().is_some_and(|p| p.expected_revision == session.revision)
                    && self.pending.as_ref().is_some_and(|p|binding.matches(session,p))) {
            self.pending = None;
            self.preview_binding = None;
            self.status = "Native project, composition or revision changed: previous preview invalidated.".into();
        }
    }

    pub fn discard_preview(&mut self) {
        self.pending = None;
        self.preview_binding = None;
        self.status = "Local preview discarded. No native action was cancelled or executed.".into();
    }
}

/// The panel's manual draft uses native schema validation; no engine edit is invoked.
fn prepare_preview(app: &mut EffectcraftApp) {
    let expected = app.session.revision;
    let result = NativeMotionProbe::new(&mut app.session)
        .preview_new_composition(expected, &app.shuvi_ai.draft);
    match result {
        Ok(plan) => {
            app.shuvi_ai.preview_binding = Some(NativePreviewBinding::capture(&app.session,&plan));
            app.shuvi_ai.pending = Some(plan);
            app.shuvi_ai.status = "Native plan checked and bound to this project; owner-approved editing is not connected.".into();
        }
        Err(error) => {
            app.shuvi_ai.pending = None;
            app.shuvi_ai.preview_binding = None;
            app.shuvi_ai.status = format!("Preview rejected: {error}");
        }
    }
}

fn inspect(app: &mut EffectcraftApp) -> (Result<Value, String>, Option<Result<Value, String>>, Option<Result<Value, String>>) {
    let rev = app.session.revision;
    let comp = app.session.active_comp_id().map(|id| id.0);
    let layer = app.session.state.selected_layers.first().map(|id| id.0);
    let mut probe = NativeMotionProbe::new(&mut app.session);
    let summary = probe.inspect(rev, InspectRequest::ProjectSummary).map(|x| x.result);
    let composition = comp.map(|id| probe.inspect(rev, InspectRequest::Composition { comp: Some(id) }).map(|x| x.result));
    let layer_tree = layer.map(|id| probe.inspect(rev, InspectRequest::Layer { comp, layer: id, depth: 1 }).map(|x| x.result));
    (summary, composition, layer_tree)
}

/// Real docked egui control surface. The original EffectcraftApp owns its Session.
pub fn show(app: &mut EffectcraftApp, ui: &mut egui::Ui, rect: Rect) {
    let revision = app.session.revision;
    app.shuvi_ai.invalidate_stale_preview(&app.session);
    let (summary, composition, layer) = inspect(app);
    app.shuvi_ai.last_read_revision = summary.as_ref().ok().map(|_| revision);

    let bounds = rect.shrink(7.0);
    let mut child = ui.new_child(UiBuilder::new().max_rect(bounds).id_salt("shuvi-ai-native-egui"));
    child.set_clip_rect(bounds.intersect(ui.clip_rect()));
    child.set_max_width(bounds.width());

    child.vertical(|ui| {
        ui.heading("Shuvi AI · Motion");
        ui.label(app.shuvi_ai.provider_label());
        ui.small("Original EffectCraft native Session · Read-only AI integration");
        ui.separator();

        ui.collapsing("Live native project inspector", |ui| {
            ui.label(format!("Session revision: {revision}"));
            match &summary {
                Ok(s) => {
                    ui.label(format!("Project dirty: {}", s["dirty"].as_bool().unwrap_or(false)));
                    ui.label(format!("Project items: {}", s["items"].as_array().map_or(0, Vec::len)));
                    ui.label(format!("Active composition: {}", s["activeComp"]));
                    ui.label(format!("Selected layers: {}", s["selectedLayers"]));
                }
                Err(e) => { ui.colored_label(egui::Color32::LIGHT_RED, format!("Readback failed: {e}")); }
            }
            if let Some(result) = &composition {
                match result {
                    Ok(comp) => {
                        ui.label(format!("Composition: {}", comp["name"].as_str().unwrap_or("unnamed")));
                        ui.label(format!("{} × {} at {} fps", comp["width"], comp["height"], comp["frameRate"]));
                        ui.label(format!("Layer count: {}", comp["layers"].as_array().map_or(0, Vec::len)));
                    }
                    Err(e) => { ui.label(format!("Composition readback unavailable: {e}")); }
                }
            }
            if let Some(result) = &layer {
                match result {
                    Ok(layer) => { ui.label(format!("Selected layer: {} (id {})", layer["name"], layer["id"])); }
                    Err(e) => { ui.label(format!("Layer readback unavailable: {e}")); }
                }
            }
        });

        ui.separator();
        ui.label("Chat — local instructions only");
        egui::ScrollArea::vertical().id_salt("shuvi-ai-chat").max_height(130.0).show(ui, |ui| {
            if app.shuvi_ai.chat.is_empty() {
                ui.small("Enter an instruction. No model call will run until a real provider is connected.");
            }
            for msg in &app.shuvi_ai.chat {
                ui.label(format!("{}: {}", msg.role, msg.text));
            }
        });
        let input_response = ui.add(
            egui::TextEdit::multiline(&mut app.shuvi_ai.input)
                .desired_rows(2)
                .desired_width(f32::INFINITY)
                .hint_text("e.g. Create a 1920×1080 title composition…")
        );
        app.auto.add_response("shuviAI.input", &input_response, "Shuvi AI chat instruction");
        let send = ui.button("Save instruction locally");
        app.auto.add_response("shuviAI.send", &send, "Save Shuvi AI instruction locally");
        if send.clicked() {
            app.shuvi_ai.submit_local_message();
        }

        ui.separator();
        ui.collapsing("Native composition proposal (preview only)", |ui| {
            ui.horizontal(|ui| {
                ui.label("Name");
                ui.text_edit_singleline(&mut app.shuvi_ai.draft.name);
            });
            ui.horizontal(|ui| {
                ui.label("Width");
                ui.add(egui::DragValue::new(&mut app.shuvi_ai.draft.width).range(1..=8192));
                ui.label("Height");
                ui.add(egui::DragValue::new(&mut app.shuvi_ai.draft.height).range(1..=8192));
            });
            ui.horizontal(|ui| {
                ui.label("FPS");
                ui.add(egui::DragValue::new(&mut app.shuvi_ai.draft.frame_rate).speed(0.5));
                ui.label("Seconds");
                ui.add(egui::DragValue::new(&mut app.shuvi_ai.draft.duration_seconds).speed(0.5));
            });
            let preview_button = ui.button("Validate native plan (no edit)");
            app.auto.add_response("shuviAI.preview", &preview_button, "Preview native comp.new command");
            if preview_button.clicked() { prepare_preview(app); }
            if let Some(pending) = &app.shuvi_ai.pending {
                ui.label(format!("Command: {} | Revision: {}", pending.native_command, pending.expected_revision));
                ui.small(pending.params.to_string());
                ui.small("Native project binding: revision + object identity + file path + active composition");
                ui.small("Task stages: preview ready → approval unavailable → native edit blocked");
                ui.add_enabled(false, egui::Button::new("Approve & execute — not integrated"));
                let discard = ui.button("Discard preview");
                app.auto.add_response("shuviAI.discard", &discard, "Discard native AI preview");
                if discard.clicked() { app.shuvi_ai.discard_preview(); }
            }
        });
        ui.separator();
        ui.small(&app.shuvi_ai.status);
        ui.small("No provider access • no credentials stored • no TCP • no completed AI actions");
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dock::{PanelKind, WorkspaceExt, workspace};

    #[test]
    fn original_editor_default_docks_ai_as_optional_tab() {
        let w = crate::dock::Workspace::new(workspace("Default"));
        assert!(w.is_open(PanelKind::ShuviAi));
        assert!(w.is_visible(PanelKind::Properties));
        assert!(!w.is_visible(PanelKind::ShuviAi));
        assert_eq!(PanelKind::from_name("Shuvi AI"), Some(PanelKind::ShuviAi));
    }

    #[test]
    fn instructions_do_not_claim_provider_responses() {
        let mut state = ShuviAiState { input: "create title".into(), ..Default::default() };
        assert_eq!(state.provider_label(), "Provider: Not connected");
        assert!(state.submit_local_message());
        assert_eq!(state.chat.len(), 2);
        assert_eq!(state.chat[0].role, "You");
        assert_eq!(state.chat[1].role, "System");
        assert!(state.chat[1].text.contains("no AI request"));
    }

    #[test]
    fn chat_is_bounded_and_empty_input_is_rejected() {
        let mut state = ShuviAiState::default();
        assert!(!state.submit_local_message());
        state.input = "x".repeat(MAX_MESSAGE_CHARS + 1);
        assert!(!state.submit_local_message());
        for _ in 0..40 {
            state.input = "local note".into();
            assert!(state.submit_local_message());
        }
        assert_eq!(state.chat.len(), MAX_CHAT_TURNS);
    }

    fn install_bound_preview(session: &Session, state: &mut ShuviAiState) {
        state.pending = Some(PendingCommand {
            native_command: "comp.new",
            expected_revision: session.revision,
            params: serde_json::json!({"name": "Plan"}),
            requires_owner_approval: true,
        });
        state.preview_binding = state.pending.as_ref().map(|p|NativePreviewBinding::capture(session,p));
    }

    #[test]
    fn manual_edit_invalidates_unapproved_plan() {
        let mut state = ShuviAiState::default();
        let mut session = Session::new();
        install_bound_preview(&session, &mut state);
        state.invalidate_stale_preview(&session);
        assert!(state.pending.is_some());
        session.execute_checked("comp.new", serde_json::json!({"name":"Other"})).unwrap();
        state.invalidate_stale_preview(&session);
        assert!(state.pending.is_none());
        assert!(state.preview_binding.is_none());
        assert!(state.status.contains("invalidated"));
    }

    #[test]
    fn new_project_with_same_revision_invalidates_preview() {
        let mut session = Session::new();
        let mut state = ShuviAiState::default();
        install_bound_preview(&session, &mut state);
        session.execute_checked("file.newProject", serde_json::json!({})).unwrap();
        state.invalidate_stale_preview(&session);
        assert!(state.pending.is_none(), "old project preview must never survive a new project");
    }

    #[test]
    fn different_document_same_revision_invalidates_preview() {
        let first = Session::new();
        let other = Session::new();
        assert_eq!(first.revision, other.revision);
        let mut state = ShuviAiState::default();
        install_bound_preview(&first, &mut state);
        state.invalidate_stale_preview(&other);
        assert!(state.pending.is_none(), "same revision across separate native projects cannot authorize stale preview");
    }

    #[test]
    fn active_composition_switch_invalidates_even_without_revision_change() {
        let mut session = Session::new();
        let first = session.execute_checked("comp.new",serde_json::json!({"name":"First"})).unwrap()["comp"].as_u64().unwrap();
        let second = session.execute_checked("comp.new",serde_json::json!({"name":"Second"})).unwrap()["comp"].as_u64().unwrap();
        let mut state = ShuviAiState::default();
        install_bound_preview(&session, &mut state);
        // A UI-only composition selection may not advance native revision.
        assert_eq!(session.active_comp_id(),Some(ItemId(second)));
        session.execute_checked("comp.open", serde_json::json!({"comp":first})).unwrap();
        state.invalidate_stale_preview(&session);
        assert!(state.pending.is_none());
    }

    #[test]
    fn tampered_preview_payload_cannot_keep_old_native_binding() {
        let session = Session::new();
        let mut state = ShuviAiState::default();
        install_bound_preview(&session, &mut state);
        state.pending.as_mut().unwrap().params["name"] = serde_json::json!("Different");
        state.invalidate_stale_preview(&session);
        assert!(state.pending.is_none(), "a changed plan payload cannot inherit the old native binding");
        install_bound_preview(&session, &mut state);
        state.pending.as_mut().unwrap().requires_owner_approval = false;
        state.invalidate_stale_preview(&session);
        assert!(state.pending.is_none(), "an owner approval flag may never be removed from a preview");
    }

    #[test]
    fn silent_native_cow_mutation_cannot_keep_preview_by_reusing_revision() {
        let mut session = Session::new();
        let before_revision = session.revision;
        let mut state = ShuviAiState::default();
        install_bound_preview(&session, &mut state);
        // Direct project replacement without the command revision can occur
        // through future host integrations. The weak Arc identity must detect
        // it even when the old revision and visible path are unchanged.
        let native = Arc::make_mut(&mut session.project);
        native.next_id += 1;
        assert_eq!(session.revision, before_revision);
        state.invalidate_stale_preview(&session);
        assert!(state.pending.is_none());
        assert!(state.preview_binding.is_none());
    }

    #[test]
    fn preview_binding_does_not_retain_or_copy_large_native_project() {
        let session = Session::new();
        let before = Arc::strong_count(&session.project);
        let mut state = ShuviAiState::default();
        install_bound_preview(&session, &mut state);
        assert_eq!(Arc::strong_count(&session.project), before,
            "native preview identity must never retain the full project snapshot");
        state.invalidate_stale_preview(&session);
        assert!(state.pending.is_some());
        state.discard_preview();
        assert_eq!(Arc::strong_count(&session.project), before);
    }

    #[test]
    fn changed_saved_file_path_invalidates_same_document_preview() {
        let mut session = Session::new();
        let mut state = ShuviAiState::default();
        install_bound_preview(&session, &mut state);
        session.path = Some("native-saved-as.ecproj".into());
        state.invalidate_stale_preview(&session);
        assert!(state.pending.is_none(), "Save As must invalidate a preview bound to the previous path");
    }

    #[test]
    fn unbound_preview_fails_closed() {
        let session = Session::new();
        let mut state = ShuviAiState::default();
        install_bound_preview(&session, &mut state);
        state.preview_binding = None;
        state.invalidate_stale_preview(&session);
        assert!(state.pending.is_none());
    }

    #[test]
    fn discard_does_not_claim_native_stop() {
        let mut state = ShuviAiState::default();
        state.discard_preview();
        assert!(state.status.contains("No native action was cancelled"));
    }
}
