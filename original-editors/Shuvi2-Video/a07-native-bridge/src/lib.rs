//! V-AI09 reviewed-in-isolation A07 NativeOwner -> ORIGINAL FilmCraft adapter.
//!
//! Native Session is borrowed mutably across the real canonical A07 GuardedHost
//! SQLite intent/readback call. This crate is NOT linked into production egui:
//! manual and AI edit paths in the running GUI are not yet under one owner lock.
//! It cannot be a WebView/model endpoint. Only one closed action is supported.
pub mod shared_owner;
pub mod native_consent;
pub mod gui_runtime;

use filmcraft_edit::razor_items;
use filmcraft_engine::{Session, shuvi_ai_readonly};
use filmcraft_project::{ClipId, ItemId};
use filmcraft_time::{Tick, TICKS_PER_SECOND};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use shuvi_ai_provider::guard::{Action, Editor, NativeOwner, Snapshot, Version};

#[derive(Debug)]
struct AppliedSplit {
    clip_id: u64,
    tick: i64,
    new_clip_id: u64,
    before_revision: u64,
    before: Value,
    proof_returned: bool,
}

/// Identity is supplied ONLY by the future trusted native desktop host. The
/// model MUST NOT choose project/session IDs. These strings do not create a
/// valid authorization: A07 persists one trusted plan and owner approval.
pub struct VideoOwner<'a> {
    session: &'a mut Session,
    project_id: String,
    session_id: String,
    bound_document_epoch: u64,
    bound_sequence: Option<ItemId>,
    bound_path: Option<String>,
    last: Option<AppliedSplit>,
}

impl<'a> VideoOwner<'a> {
    pub fn new(session: &'a mut Session, project_id: String, session_id: String) -> Result<Self, String> {
        if project_id.is_empty() || project_id.len() > 1024 ||
            project_id.chars().any(char::is_control) ||
            session_id.len() < 8 || session_id.len() > 128 ||
            !session_id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
            return Err("INVALID_TRUSTED_NATIVE_IDENTITY".into());
        }
        if session.state.active_sequence.is_none() {
            return Err("NO_ACTIVE_NATIVE_SEQUENCE".into());
        }
        Ok(Self {
            bound_document_epoch: session.document_epoch,
            bound_sequence: session.state.active_sequence,
            bound_path: session.path.clone(),
            session, project_id, session_id, last: None,
        })
    }

    fn same_native_document(&self) -> bool {
        self.session.document_epoch == self.bound_document_epoch
            && self.session.state.active_sequence == self.bound_sequence
            && self.session.path == self.bound_path
    }

    fn checked_target(&self, action: &Action) -> Option<(u64, i64)> {
        if !self.same_native_document() { return None; }
        let Action::VideoSplit { clip_id, seconds } = action else { return None };
        if *clip_id == 0 || *clip_id > 9_007_199_254_740_991 ||
            !seconds.is_finite() || !(0.0..=21_600.0).contains(seconds) { return None; }
        let seq = self.session.active_sequence()?;
        let tick = self.session.sequence_rate()
            .snap_nearest(Tick((seconds * TICKS_PER_SECOND as f64).round() as i64)).0;
        let mut matches = 0usize;
        for track in seq.video_tracks.iter().chain(seq.audio_tracks.iter()) {
            for clip in &track.items {
                if clip.id.0 != *clip_id { continue; }
                // A damaged project can reuse a ClipId across tracks. No
                // selection-based fallback and no edit before ambiguity check.
                if track.locked || clip.start.0 >= tick || tick >= clip.end().0 {
                    return None;
                }
                matches += 1;
                if matches > 1 { return None; }
            }
        }
        (matches == 1).then_some((*clip_id, tick))
    }

    fn sequence(&mut self) -> Result<Value, String> {
        if !self.same_native_document() {
            return Err("STALE_NATIVE_DOCUMENT_IDENTITY".into());
        }
        shuvi_ai_readonly::snapshot(self.session)
            .map_err(|_| "NATIVE_SEQUENCE_READBACK_FAILED".to_string())?
            .sequence.ok_or_else(|| "NO_ACTIVE_NATIVE_SEQUENCE".into())
    }

    fn inspect_split(&mut self, action: &Action) -> Result<(u64, Value), String> {
        if !self.same_native_document() {
            return Err("STALE_NATIVE_DOCUMENT_IDENTITY".into());
        }
        // Post-split the original left clip ends AT tick, so checking whether
        // it still strictly contains tick would wrongly reject a successful edit.
        // Compare the canonical action to the captured pre-edit intent instead.
        let Action::VideoSplit { clip_id, seconds } = action else {
            return Err("NATIVE_ACTION_MISMATCH".into());
        };
        let clip_id = *clip_id;
        if !seconds.is_finite() {
            return Err("NATIVE_ACTION_MISMATCH".into());
        }
        let tick = self.session.sequence_rate()
            .snap_nearest(Tick((seconds * TICKS_PER_SECOND as f64).round() as i64)).0;
        let state = self.last.as_ref().ok_or("NATIVE_INTENT_NOT_EXECUTED")?;
        if state.clip_id != clip_id || state.tick != tick {
            return Err("NATIVE_ACTION_MISMATCH".into());
        }
        let before = state.before.clone();
        let new_id = state.new_clip_id;
        let before_rev = state.before_revision;
        let after = self.sequence()?;
        let before_tracks = ["video", "audio"];
        let mut found = false;
        for kind in before_tracks {
            let a = before[kind].as_array().ok_or("NATIVE_BEFORE_TRACKS_INVALID")?;
            let b = after[kind].as_array().ok_or("NATIVE_AFTER_TRACKS_INVALID")?;
            if a.len() != b.len() { return Err("NATIVE_TRACK_COUNT_CHANGED".into()); }
            for (old, now) in a.iter().zip(b.iter()) {
                if old["id"] != now["id"] { return Err("NATIVE_TRACK_ID_CHANGED".into()); }
                let old_items = old["items"].as_array().ok_or("NATIVE_OLD_ITEMS_MISSING")?;
                let new_items = now["items"].as_array().ok_or("NATIVE_NEW_ITEMS_MISSING")?;
                let contains = old_items.iter().any(|c| c["clip"].as_u64() == Some(clip_id));
                if !contains {
                    if old != now { return Err("UNRELATED_NATIVE_TRACK_CHANGED".into()); }
                    continue;
                }
                if found || new_items.len() != old_items.len() + 1 {
                    return Err("NATIVE_SPLIT_NOT_EXACTLY_ONE".into());
                }
                found = true;
                let old_clip = old_items.iter().find(|c|c["clip"].as_u64()==Some(clip_id))
                    .ok_or("NATIVE_SOURCE_CLIP_MISSING")?;
                let left = new_items.iter().find(|c|c["clip"].as_u64()==Some(clip_id))
                    .ok_or("NATIVE_LEFT_CLIP_MISSING")?;
                let right = new_items.iter().find(|c|c["clip"].as_u64()==Some(new_id))
                    .ok_or("NATIVE_RIGHT_CLIP_MISSING")?;
                if left["start"] != old_clip["start"] ||
                   left["end"].as_i64() != Some(tick) ||
                   right["start"].as_i64() != Some(tick) ||
                   right["end"] != old_clip["end"] ||
                   left["item"] != old_clip["item"] ||
                   right["item"] != old_clip["item"] ||
                   left["sourceIn"] != old_clip["sourceIn"] ||
                   left["reverse"] != old_clip["reverse"] ||
                   right["reverse"] != old_clip["reverse"] {
                    return Err("NATIVE_SPLIT_GEOMETRY_UNVERIFIED".into());
                }
                for item in old_items.iter().filter(|c|c["clip"].as_u64()!=Some(clip_id)) {
                    if new_items.iter().find(|c|c["clip"] == item["clip"]) != Some(item) {
                        return Err("UNRELATED_NATIVE_CLIP_CHANGED".into());
                    }
                }
            }
        }
        if !found || self.session.revision <= before_rev {
            return Err("NATIVE_SPLIT_REVISION_UNVERIFIED".into());
        }
        Ok((new_id, after))
    }

    /// Native test-only direct access is impossible for arbitrary model JSON;
    /// the canonical A07 host invokes the trait, not this method.
    pub fn read_native_clip_count(&mut self) -> Result<usize, String> {
        let snapshot = self.sequence()?;
        let mut count=0;
        for kind in ["video","audio"] {
            for track in snapshot[kind].as_array().ok_or("NATIVE_TRACKS_INVALID")? {
                count+=track["items"].as_array().ok_or("NATIVE_ITEMS_INVALID")?.len();
            }
        }
        Ok(count)
    }
}

impl NativeOwner for VideoOwner<'_> {
    fn snapshot(&mut self) -> Result<Snapshot, String> {
        if !self.same_native_document() {
            return Err("STALE_NATIVE_DOCUMENT_IDENTITY".into());
        }
        Ok(Snapshot {
            editor: Editor::Video,
            project_id: self.project_id.clone(),
            session_id: self.session_id.clone(),
            version: Version::VideoSha256(shuvi_ai_readonly::a07_native_project_sha256(self.session)),
        })
    }
    fn preflight_action(&mut self, action: &Action) -> Result<bool, String> {
        Ok(self.checked_target(action).is_some())
    }
    fn apply(&mut self, action: &Action) -> Result<(), String> {
        let Some((clip_id,tick))=self.checked_target(action) else {
            return Err("NATIVE_ACTION_NOT_ALLOWED".into());
        };
        if self.last.as_ref().is_some_and(|x| !x.proof_returned) {
            // The prior native outcome needs an independent object proof.
            // A07 additionally requires a verified SQLite receipt for step 2.
            return Err("PREVIOUS_NATIVE_OUTCOME_UNVERIFIED".into());
        }
        let before_rev = self.session.revision;
        let before = self.sequence()?;
        let created = self.session.edit_sequence("A07 Native Split", |seq,ctx,_| {
            Ok(razor_items(seq, &[ClipId(clip_id)], Tick(tick), ctx))
        }).map_err(|_| "NATIVE_SPLIT_FAILED_OR_UNCERTAIN".to_owned())?;
        if created.len()!=1 {
            // A native command may already have altered the project. Never retry.
            return Err("NATIVE_SPLIT_OUTCOME_UNCERTAIN".into());
        }
        self.last=Some(AppliedSplit {
            clip_id, tick, new_clip_id: created[0].0, before_revision: before_rev,
            before, proof_returned: false,
        });
        Ok(())
    }
    fn verify_action(&mut self, action: &Action) -> Result<bool, String> {
        match self.inspect_split(action) {
            Ok(_) => Ok(true),
            Err(code) => {
                // Fixed native verification code: never output paths or secrets.
                eprintln!("A07_NATIVE_VIDEO_READBACK_REJECTED: {code}");
                Ok(false)
            }
        }
    }
    fn object_proof_sha256(&mut self, action: &Action) -> Result<String, String> {
        let (new_id,after)=self.inspect_split(action)?;
        let Action::VideoSplit { clip_id, .. } = action else {
            return Err("A07_PROOF_TARGET_MISSING".into());
        };
        let clip_id = *clip_id;
        for kind in ["video","audio"] {
            if let Some(tracks)=after[kind].as_array() {
                for tr in tracks {
                    let Some(items)=tr["items"].as_array() else {continue};
                    let left=items.iter().find(|c|c["clip"].as_u64()==Some(clip_id));
                    let right=items.iter().find(|c|c["clip"].as_u64()==Some(new_id));
                    if let (Some(a),Some(b))=(left,right) {
                        let bytes=serde_json::to_vec(&json!({"left":a,"right":b,"track":tr["id"]}))
                            .map_err(|_| "A07_OBJECT_PROOF_SERIALIZE_FAILED".to_string())?;
                        let proof = format!("{:x}", Sha256::digest(bytes));
                        if let Some(last) = self.last.as_mut() {
                            last.proof_returned = true;
                        }
                        return Ok(proof);
                    }
                }
            }
        }
        Err("A07_NATIVE_OBJECT_PROOF_MISSING".into())
    }
}
