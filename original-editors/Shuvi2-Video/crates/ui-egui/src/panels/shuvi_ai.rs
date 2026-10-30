//! Native Shuvi AI dock in the ORIGINAL FilmCraft egui editor.
//! This is intentionally read-only until the shared manual/AI admission lock,
//! durable action receipts, owner consent and native provider vault are wired.
//! Never call Session::execute for a model-proposed mutation in this panel.
use egui::{Rect, ScrollArea, TextEdit};
use filmcraft_engine::shuvi_ai_readonly::{NativeVideoSnapshot, snapshot};

use crate::FilmcraftApp;

const MAX_DRAFT_CHARS: usize = 4000;

#[derive(Default)]
pub struct SidebarState {
    /// Private UI-only draft. Not sent to a provider, logged or persisted.
    pub draft: String,
    /// Latest real inspection from the SAME Session used by manual editor commands.
    pub readback: Option<NativeVideoSnapshot>,
    pub last_error: Option<String>,
    /// Local JSON preflight input only: never sent to a provider or executed.
    pub preview_input: String,
    /// In-memory diagnostics, invalidated on manual native project change.
    pub preview_feedback: Option<String>,
    /// Last read-only local proposal preview; never approved or persisted.
    pub preview_plan: Option<filmcraft_engine::shuvi_ai_readonly::NativeA07PlanPreview>,
}

impl SidebarState {
    pub fn refresh(&mut self, session: &mut filmcraft_engine::Session) {
        self.preview_feedback = None;
        self.preview_plan = None;
        match snapshot(session) {
            Ok(value) => {
                self.readback = Some(value);
                self.last_error = None;
            }
            Err(error) => {
                self.readback = None;
                self.last_error = Some(error.to_string());
            }
        }
    }

    pub fn is_stale(&self, session: &filmcraft_engine::Session) -> bool {
        self.readback.as_ref().is_none_or(|view| {
            view.revision != session.revision
                || view.document_epoch != session.document_epoch
                || view.active_sequence != session.state.active_sequence.map(|id| id.0)
                || view.project_path != session.path
                || view.dirty != session.is_dirty()
        })
    }

    pub fn clear_draft(&mut self) {
        self.draft.clear();
    }
}

/// Never claims a connection or a completed task. All edit controls stay inert.
pub fn show(app: &mut FilmcraftApp, ui: &mut egui::Ui, _rect: Rect) {
    let state = &mut app.shuvi_ai;
    // Readbacks are revision-keyed: never run the engine query on every UI frame.
    // A Refresh button is also available for changes that don't bump project revision.
    if state.is_stale(&app.session) {
        state.refresh(&mut app.session);
    }
    ui.vertical(|ui| {
        ui.heading("Shuvi AI");
        ui.horizontal(|ui| {
            ui.strong("Not connected");
            ui.small("Native AI edits disabled");
        });
        ui.label("Original FilmCraft editor · local native Session");
        ui.separator();
        ui.horizontal(|ui| {
            ui.strong("Current project");
            if ui.small_button("Refresh").clicked() {
                state.refresh(&mut app.session);
            }
        });
        if let Some(error) = &state.last_error {
            ui.label(format!("Native readback error: {error}"));
        } else if let Some(view) = &state.readback {
            ui.label(format!("Project: {}", view.project["name"].as_str().unwrap_or("Untitled")));
            ui.label(format!("Revision: {}  |  Document epoch: {}", view.revision, view.document_epoch));
            ui.small(format!("Native project SHA-256: {}", view.project_sha256));
            ui.label(format!("Saved state: {}", if view.dirty { "Unsaved changes" } else { "No unsaved changes" }));
            match &view.sequence {
                Some(sequence) => {
                    ui.label(format!("Active sequence: {}", sequence["name"].as_str().unwrap_or("Unnamed")));
                    let count = ["video", "audio"].iter().filter_map(|kind| sequence[*kind].as_array()).flat_map(|tracks| tracks.iter()).filter_map(|track| track["items"].as_array()).map(Vec::len).sum::<usize>();
                    ui.label(format!("Native timeline clips: {count}"));
                }
                None => { ui.label("No active sequence"); }
            }
        }
        ui.separator();
        ui.strong("Chat draft");
        ui.label("Instructions are stored only in this open editor. No request is sent.");
        ui.add(TextEdit::multiline(&mut state.draft).desired_rows(5).hint_text("Describe the edit you want Shuvi AI to perform…"));
        if state.draft.chars().count() > MAX_DRAFT_CHARS {
            state.draft = state.draft.chars().take(MAX_DRAFT_CHARS).collect();
        }
        ui.horizontal(|ui| {
            if ui.add_enabled(!state.draft.is_empty(), egui::Button::new("Clear draft")).clicked() {
                state.clear_draft();
            }
            ui.add_enabled(false, egui::Button::new("Send to AI"));
        });

        ui.separator();
        ui.strong("Native action preflight (read-only)");
        ui.small("Inspect up to 12 A07 split actions. No approval, provider call or edit occurs.");
        ui.add(TextEdit::multiline(&mut state.preview_input)
            .desired_rows(2)
            .hint_text(r#"{"reason":"cut","actions":[{"type":"video.split","clipId":7,"seconds":2.0}]}"#));
        if state.preview_input.chars().count() > MAX_DRAFT_CHARS {
            state.preview_input = state.preview_input.chars().take(MAX_DRAFT_CHARS).collect();
        }
        if ui.add_enabled(!state.preview_input.trim().is_empty(), egui::Button::new("Inspect plan (no edit)")).clicked() {
            state.preview_plan = None;
            let result = serde_json::from_str::<serde_json::Value>(&state.preview_input)
                .map_err(|_| "Invalid A07 JSON".to_string())
                .and_then(|proposal| {
                    // A single A07 action is allowed as local shorthand.
                    let actions = if proposal.get("type").is_some() {
                        serde_json::json!([proposal])
                    } else {
                        proposal
                    };
                    filmcraft_engine::shuvi_ai_readonly::a07_preflight_video_plan(&mut app.session, actions)
                        .map_err(|error| error.to_string())
                });
            match result {
                Ok(plan) => {
                    state.preview_feedback = Some(format!(
                        "Read-only preflight: {} action(s), revision {}. NOT approved or executed.",
                        plan.actions.len(), plan.revision
                    ));
                    state.preview_plan = Some(plan);
                }
                Err(error) => state.preview_feedback = Some(format!("Rejected: {error}")),
            };
        }
        if let Some(feedback) = &state.preview_feedback {
            ui.label(feedback);
        }
        if let Some(plan) = &state.preview_plan {
            ui.small(format!("Plan context SHA-256: {}", plan.project_sha256));
            for (index, action) in plan.actions.iter().enumerate() {
                ui.label(format!(
                    "{}. {} track {} / clip {} / source {} / tick {}",
                    index + 1, action.track_kind, action.track_id,
                    action.clip_id, action.source_item_id, action.tick
                ));
            }
            ui.small("Preview only. Requires A07 durable reservation, one native owner approval and shared lock.");
        }
        ui.separator();
        ui.strong("Task scope / progress");
        ScrollArea::vertical().max_height(125.0).show(ui, |ui| {
            ui.label("Task: None");
            ui.label("Scope: Not approved");
            ui.label("Progress: No native AI action running");
            ui.label("Provider: Not connected");
        });
        ui.horizontal(|ui| {
            ui.add_enabled(false, egui::Button::new("Approve task"));
            ui.add_enabled(false, egui::Button::new("Stop task"));
        });
        ui.small("Requires a real provider, native credential vault, owner approval, durable ledger and one shared editor lock.");
    });
}

#[cfg(test)]
mod shuvi_ai_tests {
    use super::*;

    #[test]
    fn local_sidebar_sees_real_session_and_revisions() {
        let mut session = filmcraft_engine::Session::default();
        let mut sidebar = SidebarState::default();
        assert!(sidebar.is_stale(&session));
        sidebar.refresh(&mut session);
        assert!(!sidebar.is_stale(&session));
        let original = session.revision;
        session.execute("file.newSequence", serde_json::json!({"name": "AI view", "width": 320, "height": 180})).unwrap();
        assert!(session.revision > original);
        assert!(sidebar.is_stale(&session));
        sidebar.refresh(&mut session);
        assert_eq!(sidebar.readback.as_ref().and_then(|x| x.active_sequence), session.state.active_sequence.map(|id| id.0));
        assert!(!sidebar.is_stale(&session));
    }

    #[test]
    fn preview_diagnostics_reset_when_native_readback_is_refreshed() {
        let mut session = filmcraft_engine::Session::default();
        let mut sidebar = SidebarState { preview_feedback: Some("stale".into()), ..Default::default() };
        sidebar.refresh(&mut session);
        assert!(sidebar.preview_feedback.is_none());
        assert!(sidebar.preview_plan.is_none());
        assert!(!filmcraft_engine::shuvi_ai_readonly::readiness().ai_mutations_enabled);
    }

    #[test]
    fn draft_clear_does_not_change_engine_or_make_an_ai_task() {
        let mut session = filmcraft_engine::Session::default();
        let revision = session.revision;
        let mut sidebar = SidebarState { draft: "split timeline".into(), ..Default::default() };
        sidebar.refresh(&mut session);
        sidebar.clear_draft();
        assert!(sidebar.draft.is_empty());
        assert_eq!(session.revision, revision);
        assert!(!filmcraft_engine::shuvi_ai_readonly::readiness().ai_mutations_enabled);
        assert!(!filmcraft_engine::shuvi_ai_readonly::readiness().native_owner_consent);
    }
}
