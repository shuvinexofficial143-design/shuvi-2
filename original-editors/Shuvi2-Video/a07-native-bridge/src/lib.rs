//! V-AI09 reviewed-in-isolation A07 NativeOwner -> ORIGINAL FilmCraft adapter.
//!
//! Native Session is borrowed mutably across the real canonical A07 GuardedHost
//! SQLite intent/readback call. This crate is NOT linked into production egui:
//! manual and AI edit paths in the running GUI are not yet under one owner lock.
//! It cannot be a WebView/model endpoint. Only one closed action is supported.
use filmcraft_edit::razor_items;
use filmcraft_engine::{Session, shuvi_ai_readonly};
use filmcraft_project::ClipId;
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
}

/// Identity is supplied ONLY by the future trusted native desktop host. The
/// model MUST NOT choose project/session IDs. These strings do not create a
/// valid authorization: A07 persists one trusted plan and owner approval.
pub struct VideoOwner<'a> {
    session: &'a mut Session,
    project_id: String,
    session_id: String,
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
        Ok(Self { session, project_id, session_id, last: None })
    }

    fn checked_target(&self, action: &Action) -> Option<(u64, i64)> {
        let Action::VideoSplit { clip_id, seconds } = action else { return None };
        if *clip_id == 0 || *clip_id > 9_007_199_254_740_991 ||
            !seconds.is_finite() || !(0.0..=21_600.0).contains(seconds) { return None; }
        let seq = self.session.active_sequence()?;
        let tick = self.session.sequence_rate()
            .snap_nearest(Tick((seconds * TICKS_PER_SECOND as f64).round() as i64)).0;
        for track in seq.video_tracks.iter().chain(seq.audio_tracks.iter()) {
            if track.locked { continue; }
            if track.items.iter().any(|c| c.id.0 == *clip_id && c.start.0 < tick && tick < c.end().0) {
                return Some((*clip_id, tick));
            }
        }
        None
    }

    fn sequence(&mut self) -> Result<Value, String> {
        shuvi_ai_readonly::snapshot(self.session)
            .map_err(|_| "NATIVE_SEQUENCE_READBACK_FAILED".to_string())?
            .sequence.ok_or_else(|| "NO_ACTIVE_NATIVE_SEQUENCE".into())
    }

    fn inspect_split(&mut self, action: &Action) -> Result<(u64, Value), String> {
        // Post-split the original left clip ends AT tick, so checking whether
        // it still strictly contains tick would wrongly reject a successful edit.
        // Compare the canonical action to the captured pre-edit intent instead.
        let Action::VideoSplit { clip_id, seconds } = action else {
            return Err("NATIVE_ACTION_MISMATCH".into());
        };
        if !seconds.is_finite() {
            return Err("NATIVE_ACTION_MISMATCH".into());
        }
        let tick = self.session.sequence_rate()
            .snap_nearest(Tick((seconds * TICKS_PER_SECOND as f64).round() as i64)).0;
        let state = self.last.as_ref().ok_or("NATIVE_INTENT_NOT_EXECUTED")?;
        if state.clip_id != *clip_id || state.tick != tick {
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
        if self.last.is_some() {
            // One adapter instance serves only one native mutation. A next step
            // requires a fresh adapter and a fresh A07 stored receipt/snapshot.
            return Err("NATIVE_ADAPTER_ALREADY_USED".into());
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
            clip_id, tick, new_clip_id: created[0].0, before_revision: before_rev, before
        });
        Ok(())
    }
    fn verify_action(&mut self, action: &Action) -> Result<bool, String> {
        Ok(self.inspect_split(action).is_ok())
    }
    fn object_proof_sha256(&mut self, action: &Action) -> Result<String, String> {
        let (new_id,after)=self.inspect_split(action)?;
        let Action::VideoSplit { clip_id, .. } = action else {
            return Err("A07_PROOF_TARGET_MISSING".into());
        };
        for kind in ["video","audio"] {
            if let Some(tracks)=after[kind].as_array() {
                for tr in tracks {
                    let Some(items)=tr["items"].as_array() else {continue};
                    let left=items.iter().find(|c|c["clip"].as_u64()==Some(clip_id));
                    let right=items.iter().find(|c|c["clip"].as_u64()==Some(new_id));
                    if let (Some(a),Some(b))=(left,right) {
                        let bytes=serde_json::to_vec(&json!({"left":a,"right":b,"track":tr["id"]}))
                            .map_err(|_| "A07_OBJECT_PROOF_SERIALIZE_FAILED".to_string())?;
                        return Ok(format!("{:x}",Sha256::digest(bytes)));
                    }
                }
            }
        }
        Err("A07_NATIVE_OBJECT_PROOF_MISSING".into())
    }
}
