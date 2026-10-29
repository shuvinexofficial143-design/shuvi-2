//! Direct, typed Motion Studio boundary over the real pinned EffectCraft engine.
//! No socket listener, UI automation, fake renderer, or third-party editor window.

use effectcraft_engine::{Session, project::ItemId};
use serde_json::json;

/// Approved basic composition parameters, rather than arbitrary AI-authored engine JSON.
#[derive(Debug, Clone)]
pub struct CompositionSpec {
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub duration_seconds: f64,
}

impl CompositionSpec {
    pub fn validate(&self) -> Result<(), String> {
        if self.name.trim() != self.name
            || self.name.is_empty()
            || self.name.len() > 120
            || self.name.chars().any(char::is_control)
        {
            return Err("name must be 1-120 bytes, trimmed, without control characters".into());
        }
        if !(4..=8192).contains(&self.width) || !(4..=8192).contains(&self.height) {
            return Err("composition dimensions must be between 4 and 8192 pixels".into());
        }
        if !self.fps.is_finite() || !(1.0..=120.0).contains(&self.fps) {
            return Err("fps must be a finite number between 1 and 120".into());
        }
        if !self.duration_seconds.is_finite()
            || self.duration_seconds < 1.0 / self.fps
            || self.duration_seconds > 600.0
        {
            return Err("duration must be finite, at least one frame, and at most 600s".into());
        }
        Ok(())
    }
}

/// The actual engine project's composition, not a fabricated client-side echo.
#[derive(Debug, Clone, PartialEq)]
pub struct CompositionSnapshot {
    pub id: u64,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub duration_seconds: f64,
    pub project_revision: u64,
}

/// Retains one real EffectCraft session. Later milestones can share this session with
/// the preview and manual timeline UI instead of creating divergent copies.
pub struct MotionBridge {
    session: Session,
}

impl Default for MotionBridge {
    fn default() -> Self {
        Self::new()
    }
}

impl MotionBridge {
    pub fn new() -> Self {
        Self {
            session: Session::default(),
        }
    }

    pub fn revision(&self) -> u64 {
        self.session.revision
    }

    pub fn create_composition(
        &mut self,
        spec: &CompositionSpec,
    ) -> Result<CompositionSnapshot, String> {
        spec.validate()?;

        // Refuse silent upstream name de-duplication: the returned name must
        // unambiguously match what the owner/agent intended.
        if self.session.project.items.values().any(|item| item.name == spec.name) {
            return Err("a project item with this name already exists".into());
        }

        let prior_revision = self.session.revision;
        let reply = self
            .session
            .execute_checked(
                "comp.new",
                json!({
                    "name": spec.name,
                    "width": spec.width,
                    "height": spec.height,
                    "frameRate": spec.fps,
                    "duration": spec.duration_seconds,
                    "open": true
                }),
            )
            .map_err(|err| format!("EffectCraft comp.new failed: {err}"))?;

        let id = reply
            .get("comp")
            .and_then(serde_json::Value::as_u64)
            .ok_or_else(|| "EffectCraft comp.new returned no numeric comp id".to_string())?;

        let actual = self.inspect_composition(id)?;

        // Read AFTER executing the native command; a successful reply alone
        // is never considered proof that an engine edit occurred.
        if actual.project_revision <= prior_revision
            || actual.name != spec.name
            || actual.width != spec.width
            || actual.height != spec.height
            || (actual.fps - spec.fps).abs() > 0.001
            || (actual.duration_seconds - spec.duration_seconds).abs() > 0.5 / spec.fps + 0.000001
        {
            return Err(format!(
                "EffectCraft read-after-write verification failed: {actual:?}"
            ));
        }
        Ok(actual)
    }

    pub fn inspect_composition(&self, id: u64) -> Result<CompositionSnapshot, String> {
        let item_id = ItemId(id);
        let item = self
            .session
            .project
            .item(item_id)
            .ok_or_else(|| format!("composition {id} has no project item"))?;
        let comp = self
            .session
            .project
            .comp(item_id)
            .ok_or_else(|| format!("project item {id} is not a composition"))?;

        Ok(CompositionSnapshot {
            id,
            name: item.name.clone(),
            width: comp.width,
            height: comp.height,
            fps: comp.frame_rate.as_f64(),
            duration_seconds: comp.duration.seconds(),
            project_revision: self.session.revision,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid() -> CompositionSpec {
        CompositionSpec {
            name: "Shuvi Hindi Motion".into(),
            width: 1920,
            height: 1080,
            fps: 30.0,
            duration_seconds: 10.0,
        }
    }

    #[test]
    fn rejects_unsafe_and_invalid_compositions() {
        let mut spec = valid();
        spec.fps = f64::NAN;
        assert!(spec.validate().is_err());
        spec = valid();
        spec.width = 0;
        assert!(spec.validate().is_err());
        spec = valid();
        spec.name = "  untidy".into();
        assert!(spec.validate().is_err());
        spec = valid();
        spec.duration_seconds = 0.001;
        assert!(spec.validate().is_err());
    }
}
