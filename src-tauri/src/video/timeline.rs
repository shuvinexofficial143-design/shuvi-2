//! FilmCraft V04: real timeline actions in a headless single project session.
//! Every submitted action has fixed typed arguments, not model-supplied shell.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const MAX_ACTIONS: usize = 32;
const MAX_PROJECT_BYTES: u64 = 64 * 1024 * 1024;
const MAX_SECONDS: f64 = 86_400.0;
const TICKS_PER_SECOND: f64 = 254_016_000_000.0;
const TIMEOUT: Duration = Duration::from_secs(240);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineRequest {
    pub selected_root: String,
    pub project_path: String,
    pub expected_revision: u64,
    pub expected_project_sha256: String,
    pub actions: Vec<TimelineAction>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum TimelineAction {
    CreateSequence { name: String, width: u32, height: u32, fps: u32 },
    Place { item_id: u64, track: String, seconds: f64, video: bool, audio: bool },
    Split { clip_id: u64, seconds: f64 },
    Trim { clip_id: u64, edge: String, ripple: bool, delta_frames: i64 },
    Move { clip_id: u64, track: String, seconds: f64, insert: bool },
    Delete { clip_id: u64, ripple: bool },
    Undo,
    Redo,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimelineReceipt {
    pub project_path: String,
    pub before_revision: u64,
    pub after_revision: u64,
    pub project_sha256: String,
    pub commands: Vec<Value>,
    pub sequence_readback: Value,
    pub project_readback: Value,
    pub backup_path: String,
}

fn valid_track(track: &str) -> bool {
    let mut chars = track.chars();
    matches!(chars.next(), Some('V' | 'A'))
        && matches!(chars.as_str().parse::<u8>(), Ok(1..=16))
}

fn ticks(seconds: f64) -> Result<i64, String> {
    if !seconds.is_finite() || !(0.0..=MAX_SECONDS).contains(&seconds) {
        return Err("Timeline seconds must be finite and inside the supported range".into());
    }
    Ok((seconds * TICKS_PER_SECOND).round() as i64)
}

fn mapped_action(a: &TimelineAction) -> Result<Value, String> {
    let cmd = match a {
        TimelineAction::CreateSequence { name, width, height, fps } => {
            if name.trim().is_empty() || name.len() > 120 || name.chars().any(char::is_control) ||
                !(16..=7680).contains(width) || !(16..=4320).contains(height) ||
                !(1..=120).contains(fps) {
                return Err("Invalid sequence name/dimensions/frame rate".into());
            }
            json!({"id":"file.newSequence","params":{"name":name,"width":width,"height":height,"fps":fps,"video":3,"audio":3}})
        }
        TimelineAction::Place { item_id, track, seconds, video, audio } => {
            if *item_id == 0 || !valid_track(track) || !(*video || *audio) {
                return Err("Invalid item, track or disabled streams".into());
            }
            json!({"id":"timeline.place","params":{"item":item_id,"track":track,"time":ticks(*seconds)?,"video":video,"audio":audio}})
        }
        TimelineAction::Split { clip_id, seconds } => {
            if *clip_id == 0 { return Err("Clip ID must be nonzero".into()); }
            json!({"id":"timeline.razor","params":{"clip":clip_id,"time":ticks(*seconds)?}})
        }
        TimelineAction::Trim { clip_id, edge, ripple, delta_frames } => {
            if *clip_id == 0 || !["in","out"].contains(&edge.as_str()) ||
                *delta_frames == 0 || delta_frames.unsigned_abs() > 144_000 {
                return Err("Invalid clip/trim edge/frame delta".into());
            }
            json!({"id":"timeline.trim","params":{"clip":clip_id,"edge":edge,"mode":if *ripple {"ripple"} else {"regular"},"deltaFrames":delta_frames}})
        }
        TimelineAction::Move { clip_id, track, seconds, insert } => {
            if *clip_id == 0 || !valid_track(track) { return Err("Invalid clip or destination track".into()); }
            json!({"id":"timeline.move","params":{"moves":[{"clip":clip_id,"track":track,"time":ticks(*seconds)?}],"linked":false,"insert":insert,"copy":false}})
        }
        TimelineAction::Delete { clip_id, ripple } => {
            if *clip_id == 0 { return Err("Clip ID must be nonzero".into()); }
            json!({"id":if *ripple {"edit.rippleDelete"} else {"edit.clear"},"params":{"clips":[clip_id]}})
        }
        TimelineAction::Undo => json!({"id":"edit.undo","params":{}}),
        TimelineAction::Redo => json!({"id":"edit.redo","params":{}}),
    };
    Ok(cmd)
}

pub(super) fn checked_project(root: &str, file: &str) -> Result<std::path::PathBuf, String> {
    if !Path::new(root).is_absolute() || !Path::new(file).is_absolute() {
        return Err("Owner-selected root and project must be absolute".into());
    }
    let root = fs::canonicalize(root).map_err(|e| format!("Cannot resolve root: {e}"))?;
    if !root.is_dir() { return Err("Selection root is not a directory".into()); }
    let project = fs::canonicalize(file).map_err(|e| format!("Cannot resolve project: {e}"))?;
    if !project.starts_with(&root) || !project.is_file() ||
        !project.extension().and_then(|x| x.to_str()).is_some_and(|x| x.eq_ignore_ascii_case("fcproj")) {
        return Err("Existing .fcproj is required inside the owner-selected root".into());
    }
    let bytes = fs::metadata(&project).map_err(|e| e.to_string())?.len();
    if bytes == 0 || bytes > MAX_PROJECT_BYTES {
        return Err("Invalid, empty or oversized project".into());
    }
    Ok(project)
}

/// Original is backed up before any command, and remains available even if a
/// subprocess crashes. A failed JSONL command is not saved by FilmCraft CLI.
pub fn apply(request: TimelineRequest) -> Result<TimelineReceipt, String> {
    if request.actions.is_empty() || request.actions.len() > MAX_ACTIONS {
        return Err("Batch requires 1–32 typed timeline operations".into());
    }
    // Validate the complete request before launching anything.
    let actions: Vec<Value> = request.actions.iter().map(mapped_action).collect::<Result<_,_>>()?;
    let project = checked_project(&request.selected_root, &request.project_path)?;
    let _lock = super::media::ImportLock::acquire(&project)?;
    let source_digest = super::project_sha256(&project)?;
    if source_digest != request.expected_project_sha256 {
        return Err("STALE_PROJECT_CONTENT: project bytes changed since planning. Refresh/replan.".into());
    }
    let cli = super::configured_cli_path()?;
    let project_str = project.to_str().ok_or("Project path cannot be UTF-8 encoded")?;
    let before = super::run_json_bounded(&cli, &["--compact","--project",project_str,"inspect","project"], TIMEOUT)?;
    let revision = before["revision"].as_u64().ok_or("FilmCraft revision unavailable")?;
    if revision != request.expected_revision {
        return Err(format!("STALE_PROJECT_REVISION: expected {}, actual {}. Refresh and replan.",request.expected_revision,revision));
    }
    let before_bytes = fs::read(&project).map_err(|e| format!("Cannot read original project: {e}"))?;
    let scratch = super::Scratch::create()?;
    let script = scratch.0.join("timeline.jsonl");
    {
        let mut file = OpenOptions::new().create_new(true).write(true).open(&script)
            .map_err(|e| format!("Cannot create isolated command manifest: {e}"))?;
        for cmd in &actions {
            serde_json::to_writer(&mut file, cmd).map_err(|e| e.to_string())?;
            file.write_all(b"\n").map_err(|e| e.to_string())?;
        }
        file.sync_all().map_err(|e| e.to_string())?;
    }
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let backup = project.with_file_name(format!("{}.shuvi-backup-{}-{}.fcproj",
        project.file_stem().unwrap_or_default().to_string_lossy(),std::process::id(),nonce));
    {
        let mut backup_file=OpenOptions::new().write(true).create_new(true).open(&backup).map_err(|e| e.to_string())?;
        backup_file.write_all(&before_bytes).map_err(|e| e.to_string())?;
        backup_file.sync_all().map_err(|e| e.to_string())?;
    }
    if fs::read(&project).map_err(|e| e.to_string())? != before_bytes {
        return Err("EXTERNAL_PROJECT_EDIT: original changed during preparation; no commands dispatched".into());
    }
    let script_str = script.to_str().ok_or("Script filename is not UTF-8")?;
    let output = super::run_text_bounded(&cli, &["--compact","--project",project_str,"--save","run",script_str], TIMEOUT)?;
    let receipts: Vec<Value> = output.lines().filter(|line| !line.trim().is_empty())
        .map(|line| serde_json::from_str::<Value>(line).map_err(|e| format!("FilmCraft receipt malformed: {e}")))
        .collect::<Result<_,_>>()?;
    if receipts.len()!=actions.len() || receipts.iter().any(|v| v["ok"]!=true) {
        return Err("FilmCraft returned missing or failed command receipts; inspect backup and project".into());
    }
    let after = super::run_json_bounded(&cli, &["--compact","--project",project_str,"inspect","project"], TIMEOUT)?;
    let new_revision=after["revision"].as_u64().ok_or("Saved project revision absent; preserve backup")?;
    let seq = super::run_json_bounded(&cli, &["--compact","--project",project_str,"inspect","sequence"], TIMEOUT)?;
    if !seq["video"].is_array() || !seq["audio"].is_array() {
        return Err("Saved sequence readback unavailable; original backup preserved".into());
    }
    if after["root"].is_null() {
        return Err("Project tree readback unavailable; original backup preserved".into());
    }
    let verified_after_bytes=fs::read(&project).map_err(|e|e.to_string())?;
    super::history::record_edit(&project,&before_bytes,&verified_after_bytes)?;
    Ok(TimelineReceipt {
        project_path: project_str.into(), before_revision: revision, after_revision: new_revision,
        project_sha256: super::project_sha256(&project)?,
        commands:receipts,sequence_readback:seq,project_readback:after,
        backup_path:backup.to_string_lossy().into_owned()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_untrusted_actions_before_side_effects() {
        assert!(mapped_action(&TimelineAction::Place {item_id:1,track:"../../../".into(),seconds:0.0,video:true,audio:false}).is_err());
        assert!(mapped_action(&TimelineAction::Split {clip_id:1,seconds:f64::NAN}).is_err());
        assert!(mapped_action(&TimelineAction::CreateSequence {name:"".into(),width:1920,height:1080,fps:30}).is_err());
        assert!(mapped_action(&TimelineAction::Trim {clip_id:1,edge:"middle".into(),ripple:false,delta_frames:1}).is_err());
        assert!(mapped_action(&TimelineAction::Move {clip_id:1,track:"V1".into(),seconds:-1.0,insert:false}).is_err());
        assert!(valid_track("V1") && valid_track("A16") && !valid_track("V17"));
    }
    #[test]
    fn browser_camelcase_actions_deserialize_into_real_native_timeline_commands() {
        // Exact JSON keys emitted by src/studios/video/timeline.ts and Tauri invoke.
        // Serde enum rename_all handles the TYPE name only; the fields require
        // rename_all_fields. Previously "itemId" was silently unknown and
        // "item_id" was reported missing after a successful real media import.
        let cases = [
            (json!({"type":"createSequence","name":"Scene","width":64,"height":64,"fps":12}),"file.newSequence"),
            (json!({"type":"place","itemId":7,"track":"V1","seconds":0.0,"video":true,"audio":false}),"timeline.place"),
            (json!({"type":"split","clipId":9,"seconds":0.5}),"timeline.razor"),
            (json!({"type":"trim","clipId":9,"edge":"out","ripple":false,"deltaFrames":-3}),"timeline.trim"),
            (json!({"type":"move","clipId":9,"track":"V1","seconds":1.0,"insert":false}),"timeline.move"),
            (json!({"type":"delete","clipId":9,"ripple":false}),"edit.clear"),
            (json!({"type":"undo"}),"edit.undo"),
            (json!({"type":"redo"}),"edit.redo"),
        ];
        for (raw, expected) in cases {
            let action:TimelineAction=serde_json::from_value(raw).expect("UI camelCase must match native action");
            assert_eq!(mapped_action(&action).unwrap()["id"],expected);
        }
        let request:TimelineRequest=serde_json::from_value(json!({
            "selectedRoot":"C:\\Owner","projectPath":"C:\\Owner\\work.fcproj",
            "expectedRevision":3,"expectedProjectSha256":"a".repeat(64),
            "actions":[{"type":"place","itemId":7,"track":"V1","seconds":0.0,"video":true,"audio":false}]
        })).unwrap();
        assert_eq!(request.actions.len(),1);
        // No snake_case alias: browser must use the documented typed contract.
        assert!(serde_json::from_value::<TimelineAction>(json!({
            "type":"place","item_id":7,"track":"V1","seconds":0.0,
            "video":true,"audio":false
        })).is_err());
        assert!(serde_json::from_value::<TimelineAction>(json!({
            "type":"split","clip_id":9,"seconds":0.5
        })).is_err());
    }
    #[test]
    fn maps_real_filmcraft_command_ids() {
        let mapped = mapped_action(&TimelineAction::Place {item_id:11,track:"V1".into(),seconds:0.5,video:true,audio:false}).unwrap();
        assert_eq!(mapped["id"],"timeline.place");
        assert_eq!(mapped["params"]["time"].as_i64(),Some(127_008_000_000));
        assert_eq!(mapped_action(&TimelineAction::Undo).unwrap()["id"],"edit.undo");
        assert_eq!(mapped_action(&TimelineAction::Delete{clip_id:12,ripple:true}).unwrap()["id"],"edit.rippleDelete");
    }

    #[test]
    #[ignore = "requires pinned FilmCraft CLI + real MP4 fixture; run explicitly in CI"]
    fn real_timeline_placement_split_move_delete() {
        let tmp=super::super::Scratch::create().unwrap();
        let root=tmp.0.to_string_lossy().into_owned();
        let source=tmp.0.join("blue.mp4");
        fs::write(&source, include_bytes!("../../../tests/video/blue-64x64-12fps.mp4")).unwrap();
        let project=tmp.0.join("edit.fcproj");
        let imported=super::super::media::import_media(root.clone(),project.to_string_lossy().into_owned(),source.to_string_lossy().into_owned()).unwrap();
        let mkreq=|revision,hash:String,actions| TimelineRequest {selected_root:root.clone(),project_path:project.to_string_lossy().into_owned(),expected_revision:revision,expected_project_sha256:hash,actions};
        let ready=apply(mkreq(imported.project_revision.unwrap(),imported.project_sha256.clone(),vec![
            TimelineAction::CreateSequence{name:"Verified".into(),width:64,height:64,fps:12},
            TimelineAction::Place{item_id:imported.item_id,track:"V1".into(),seconds:0.0,video:true,audio:false},
        ])).unwrap();
        let clips=&ready.sequence_readback["video"][0]["items"];
        assert_eq!(clips.as_array().unwrap().len(),1);
        assert!(ready.backup_path.ends_with(".fcproj"));
        let left=clips[0]["clip"].as_u64().unwrap();
        let cut=apply(mkreq(ready.after_revision,ready.project_sha256.clone(),vec![TimelineAction::Split{clip_id:left,seconds:0.5}])).unwrap();
        let items=cut.sequence_readback["video"][0]["items"].as_array().unwrap();
        assert_eq!(items.len(),2);
        let right=items.iter().find_map(|v|(v["clip"].as_u64()!=Some(left)).then(||v["clip"].as_u64()).flatten()).unwrap();
        let moved=apply(mkreq(cut.after_revision,cut.project_sha256.clone(),vec![
            TimelineAction::Move{clip_id:right,track:"V1".into(),seconds:2.0,insert:false},
        ])).unwrap();
        assert_eq!(moved.sequence_readback["video"][0]["items"].as_array().unwrap().len(),2);
        let deleted=apply(mkreq(moved.after_revision,moved.project_sha256.clone(),vec![
            TimelineAction::Delete{clip_id:right,ripple:false},TimelineAction::Undo,TimelineAction::Redo
        ])).unwrap();
        assert_eq!(deleted.sequence_readback["video"][0]["items"].as_array().unwrap().len(),1);
        let stale = apply(mkreq(deleted.after_revision, "0".repeat(64), vec![TimelineAction::Undo]));
        assert!(stale.unwrap_err().contains("STALE_PROJECT_CONTENT"));
    }
}
