//! Durable FilmCraft project-level Undo/Redo across separate CLI sessions.
//!
//! The upstream "edit.undo" command is an in-process history only. Here we keep
//! verified .fcproj snapshots and an append-only JSONL journal on disk.
//! Every restore uses the existing per-project lock + exact SHA-256 before write.
//! This is NOT a media-file undo: source video assets remain untouched.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs::{self, File, OpenOptions}, io::Write, path::{Path,PathBuf}, time::Duration};

const MAX_JOURNAL_BYTES: u64 = 1024 * 1024;
const MAX_RECORDS: usize = 4000;
const INSPECT_TIMEOUT: Duration = Duration::from_secs(75);

#[derive(Clone,Debug,Serialize,Deserialize)]
struct Entry {
    event: String,
    from: String,
    to: String,
}
#[derive(Default,Debug)]
struct Chain {states:Vec<String>,index:usize}

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct HistoryStatus {
    pub project_path:String,
    pub project_sha256:String,
    pub can_undo:bool,
    pub can_redo:bool,
    pub depth:usize,
    pub position:usize,
    pub diverged:bool,
}

#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct RestoreRequest {
    pub selected_root:String,
    pub project_path:String,
    pub expected_project_sha256:String,
    pub direction:String,
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct RestoreReceipt {
    pub project_sha256:String,
    pub project:Value,
    pub sequence:Option<Value>,
    pub backup_path:String,
    pub history:HistoryStatus,
}

fn is_sha(s:&str)->bool {
    s.len()==64 && s.as_bytes().iter().all(|b|b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}
fn journal_path(project:&Path)->PathBuf {project.with_extension("fcproj.shuvi-history.jsonl")}
fn snapshot_path(project:&Path,sha:&str)->PathBuf{
    project.with_file_name(format!("{}.shuvi-state-{}.fcproj",
        project.file_stem().unwrap_or_default().to_string_lossy(),sha))
}
fn safe_regular_file(path:&Path)->Result<(),String>{
    let metadata=fs::symlink_metadata(path).map_err(|e|e.to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("Unsafe history path: symlink or non-file".into());
    }
    Ok(())
}
fn replay(entries:&[Entry])->Result<Chain,String>{
    let mut chain=Chain::default();
    for e in entries {
        if !is_sha(&e.from)||!is_sha(&e.to) {return Err("Corrupt history digest".into());}
        match e.event.as_str() {
            "edit" | "reset" => {
                if e.event=="reset" || chain.states.is_empty() {
                    chain.states=vec![e.from.clone(),e.to.clone()];
                    chain.index=1;
                } else if chain.states.get(chain.index)==Some(&e.from) {
                    chain.states.truncate(chain.index+1);
                    chain.states.push(e.to.clone());
                    chain.index+=1;
                } else{return Err("History event SHA chain mismatch".into());}
            }
            "undo" => {
                if chain.index==0 || chain.states[chain.index]!=e.from ||
                    chain.states[chain.index-1]!=e.to {return Err("History undo chain invalid".into());}
                chain.index-=1;
            }
            "redo" => {
                if chain.index+1>=chain.states.len() || chain.states[chain.index]!=e.from ||
                    chain.states[chain.index+1]!=e.to {return Err("History redo chain invalid".into());}
                chain.index+=1;
            }
            _ => return Err("Unsupported history journal event".into()),
        }
    }
    Ok(chain)
}
fn read_entries(project:&Path)->Result<Vec<Entry>,String>{
    let path=journal_path(project);
    if !path.exists(){return Ok(vec![]);}
    safe_regular_file(&path)?;
    if fs::metadata(&path).map_err(|e|e.to_string())?.len()>MAX_JOURNAL_BYTES {
        return Err("History journal exceeds safe limit; archive or reset manually".into());
    }
    let text=fs::read_to_string(path).map_err(|e|format!("Cannot read history: {e}"))?;
    let mut items=Vec::new();
    for line in text.lines().filter(|l|!l.is_empty()) {
        if items.len()>=MAX_RECORDS {return Err("History entry limit reached".into());}
        items.push(serde_json::from_str::<Entry>(line).map_err(|e|format!("Corrupt history journal: {e}"))?);
    }
    replay(&items)?;
    Ok(items)
}
fn append(project:&Path,entry:&Entry)->Result<(),String>{
    let path=journal_path(project);
    if path.exists(){safe_regular_file(&path)?;}
    let mut f=OpenOptions::new().create(true).append(true).open(&path)
        .map_err(|e|format!("Cannot open history journal: {e}"))?;
    serde_json::to_writer(&mut f,entry).map_err(|e|e.to_string())?;
    f.write_all(b"\n").map_err(|e|e.to_string())?;
    f.sync_all().map_err(|e|e.to_string())
}
fn snapshot(project:&Path,bytes:&[u8],sha:&str)->Result<(),String>{
    if !is_sha(sha) || bytes.is_empty() || bytes.len()>64*1024*1024 {
        return Err("Unsafe history snapshot content".into());
    }
    let path=snapshot_path(project,sha);
    if path.exists(){
        safe_regular_file(&path)?;
        if super::project_sha256(&path)?!=sha {return Err("Existing snapshot checksum mismatch".into());}
        return Ok(());
    }
    let mut file=OpenOptions::new().write(true).create_new(true).open(&path)
        .map_err(|e|format!("Cannot create history snapshot: {e}"))?;
    file.write_all(bytes).map_err(|e|e.to_string())?;
    file.sync_all().map_err(|e|e.to_string())?;
    if super::project_sha256(&path)?!=sha {return Err("Created snapshot SHA mismatch".into());}
    Ok(())
}
pub(super) fn record_edit(project:&Path,before:&[u8],after:&[u8])->Result<(),String>{
    if before==after{return Ok(());}
    let from=super::sha256_bytes(before);
    let to=super::sha256_bytes(after);
    // Under ImportLock: another Shuvi writer cannot advance this journal.
    let entries=read_entries(project)?;
    let old=replay(&entries)?;
    snapshot(project,before,&from)?;
    snapshot(project,after,&to)?;
    if super::project_sha256(project)?!=to {return Err("Project mutated before history commit".into());}
    let event=if old.states.is_empty() || old.states.get(old.index)==Some(&from) {"edit"} else {"reset"};
    append(project,&Entry{event:event.into(),from,to})
}
fn status_unlocked(project:&Path)->Result<HistoryStatus,String>{
    let digest=super::project_sha256(project)?;
    let chain=replay(&read_entries(project)?)?;
    let diverged=!chain.states.is_empty() && chain.states[chain.index]!=digest;
    Ok(HistoryStatus {
        project_path:project.to_string_lossy().into_owned(),
        project_sha256:digest,
        can_undo:!diverged && chain.index>0,
        can_redo:!diverged && chain.index+1<chain.states.len(),
        depth:chain.states.len().saturating_sub(1),
        position:chain.index,
        diverged,
    })
}
pub fn status(selected_root:String,project_path:String)->Result<HistoryStatus,String>{
    let project=super::timeline::checked_project(&selected_root,&project_path)?;
    let _lock=super::media::ImportLock::acquire(&project)?;
    status_unlocked(&project)
}
pub fn restore(request:RestoreRequest)->Result<RestoreReceipt,String>{
    if !["undo","redo"].contains(&request.direction.as_str()) {
        return Err("Direction must be undo or redo".into());
    }
    if !is_sha(&request.expected_project_sha256){return Err("Expected project SHA invalid".into());}
    let project=super::timeline::checked_project(&request.selected_root,&request.project_path)?;
    let _lock=super::media::ImportLock::acquire(&project)?;
    let current=super::project_sha256(&project)?;
    if current!=request.expected_project_sha256 {
        return Err("STALE_PROJECT_CONTENT: history changed; refresh before Undo/Redo".into());
    }
    let chain=replay(&read_entries(&project)?)?;
    if chain.states.is_empty() || chain.states[chain.index]!=current {
        return Err("HISTORY_DIVERGED: current project differs from history journal".into());
    }
    let target=if request.direction=="undo" {
        chain.index.checked_sub(1).ok_or("No edit to undo")?
    } else {
        let next=chain.index+1;
        if next>=chain.states.len(){return Err("No edit to redo".into());}
        next
    };
    let target_sha=chain.states[target].clone();
    let source=snapshot_path(&project,&target_sha);
    safe_regular_file(&source)?;
    if super::project_sha256(&source)?!=target_sha {
        return Err("Snapshot content verification failed".into());
    }
    let before_bytes=fs::read(&project).map_err(|e|e.to_string())?;
    let target_bytes=fs::read(&source).map_err(|e|e.to_string())?;
    if super::sha256_bytes(&target_bytes)!=target_sha {
        return Err("Snapshot changed between read and restore".into());
    }
    snapshot(&project,&before_bytes,&current)?;
    // Validate the candidate in an isolated temporary .fcproj BEFORE touching
    // the original user's project. A corrupt, forged or incompatible snapshot
    // is never copied over the verified source.
    let scratch=super::Scratch::create()?;
    let candidate=scratch.0.join("undo-preflight.fcproj");
    {
        let mut writer=OpenOptions::new().write(true).create_new(true).open(&candidate)
            .map_err(|e|format!("Cannot stage history candidate: {e}"))?;
        writer.write_all(&target_bytes).map_err(|e|e.to_string())?;
        writer.sync_all().map_err(|e|e.to_string())?;
    }
    if super::project_sha256(&candidate)?!=target_sha {
        return Err("Staged candidate failed SHA-256; original untouched".into());
    }
    let cli=super::configured_cli_path()?;
    let candidate_path=candidate.to_str().ok_or("Invalid temporary preflight path")?;
    let preflight=super::run_json_bounded(&cli,&["--compact","--project",candidate_path,"inspect","project"],INSPECT_TIMEOUT)?;
    if preflight["root"].is_null() {
        return Err("FilmCraft rejects history candidate; original untouched".into());
    }
    let _preflight_seq=if preflight["activeSequence"].is_u64() {
        Some(super::run_json_bounded(&cli,&["--compact","--project",candidate_path,"inspect","sequence"],INSPECT_TIMEOUT)?)
    }else{None};
    if super::project_sha256(&project)?!=current {
        return Err("EXTERNAL_PROJECT_EDIT: original changed while staging restore".into());
    }
    // Existing SHA-verified source snapshot remains available for recovery.
    let write_result=(||->Result<(),String>{
        let mut writer=OpenOptions::new().write(true).truncate(true).open(&project)
            .map_err(|e|format!("Cannot restore FilmCraft project: {e}"))?;
        writer.write_all(&target_bytes).map_err(|e|format!("Restore write failed: {e}"))?;
        writer.sync_all().map_err(|e|e.to_string())?;
        if super::project_sha256(&project)?!=target_sha {
            return Err("Restored bytes failed SHA-256 check".into());
        }
        Ok(())
    })();
    if let Err(e)=write_result {
        // Best-effort immediate rollback from independently saved source bytes;
        // a persisted source snapshot still exists if rollback also fails.
        let rollback=fs::write(&project,&before_bytes);
        return Err(format!("Restore aborted: {e}; rollback result: {rollback:?}"));
    }
    let path=project.to_str().ok_or("Invalid project path")?;
    let info=super::run_json_bounded(&cli,&["--compact","--project",path,"inspect","project"],INSPECT_TIMEOUT)?;
    if info["root"].is_null(){return Err("Restored project readback invalid; previous snapshot retained".into());}
    let seq=if info["activeSequence"].is_u64() {
        Some(super::run_json_bounded(&cli,&["--compact","--project",path,"inspect","sequence"],INSPECT_TIMEOUT)?)
    }else{None};
    if super::project_sha256(&project)?!=target_sha {return Err("Project changed during restore verification".into());}
    append(&project,&Entry{event:request.direction,from:current,to:target_sha.clone()})?;
    let final_status=status_unlocked(&project)?;
    Ok(RestoreReceipt{
        project_sha256:target_sha,project:info,sequence:seq,
        backup_path:snapshot_path(&project,&request.expected_project_sha256).to_string_lossy().into_owned(),
        history:final_status,
    })
}

#[cfg(test)]
mod tests{
    use super::*;
    fn sha(ch:char)->String{ch.to_string().repeat(64)}
    fn entry(event:&str,from:String,to:String)->Entry{Entry{event:event.into(),from,to}}
    #[test]
    fn edit_undo_redo_and_fork_redo_chain_are_durable(){
        let a=sha('a');let b=sha('b');let c=sha('c');let d=sha('d');
        let log=vec![entry("edit",a.clone(),b.clone()),entry("edit",b.clone(),c.clone()),
            entry("undo",c.clone(),b.clone()),entry("redo",b.clone(),c.clone()),
            entry("undo",c.clone(),b.clone()),entry("edit",b.clone(),d.clone())];
        let result=replay(&log).unwrap();
        assert_eq!(result.states,vec![a,b,d]);assert_eq!(result.index,2);
        assert!(replay(&[entry("redo",sha('a'),sha('b'))]).is_err());
        assert!(replay(&[entry("edit","../escape".into(),sha('b'))]).is_err());
    }
    #[test]
    fn snapshot_detects_tampering_and_history_chain_persists(){
        let root=super::super::Scratch::create().unwrap();
        let project=root.0.join("test.fcproj");
        let old=b"old project";let new=b"new project";
        fs::write(&project,old).unwrap();
        snapshot(&project,old,&super::super::sha256_bytes(old)).unwrap();
        fs::write(&project,new).unwrap();
        record_edit(&project,old,new).unwrap();
        let stats=status_unlocked(&project).unwrap();
        assert!(stats.can_undo&&!stats.can_redo&&!stats.diverged);
        let loaded=read_entries(&project).unwrap();
        assert_eq!(replay(&loaded).unwrap().states.len(),2);
        fs::write(&project,b"external change").unwrap();
        assert!(status_unlocked(&project).unwrap().diverged);
    }
    #[test]
    #[ignore="requires pinned real FilmCraft CLI and MP4 fixture"]
    fn real_cross_session_undo_redo() {
        let root=super::super::Scratch::create().unwrap();
        let base=root.0.to_string_lossy().into_owned();
        let media=root.0.join("real.mp4");
        fs::write(&media,include_bytes!("../../../tests/video/blue-64x64-12fps.mp4")).unwrap();
        let project=root.0.join("edit.fcproj");
        let imported=super::super::media::import_media(base.clone(),project.to_string_lossy().into_owned(),media.to_string_lossy().into_owned()).unwrap();
        let edited=super::super::timeline::apply(super::super::timeline::TimelineRequest {
            selected_root:base.clone(),project_path:project.to_string_lossy().into_owned(),
            expected_revision:imported.project_revision.unwrap(),expected_project_sha256:imported.project_sha256.clone(),
            actions:vec![super::super::timeline::TimelineAction::CreateSequence{name:"History".into(),width:64,height:64,fps:12}],
        }).unwrap();
        let state=status(base.clone(),project.to_string_lossy().into_owned()).unwrap();
        assert_eq!(state.project_sha256,edited.project_sha256);
        assert!(state.can_undo);
        let undo=restore(RestoreRequest{
            selected_root:base.clone(),project_path:project.to_string_lossy().into_owned(),
            expected_project_sha256:edited.project_sha256.clone(),direction:"undo".into(),
        }).unwrap();
        assert_eq!(undo.project_sha256,imported.project_sha256);
        assert!(undo.sequence.is_none());
        assert!(undo.history.can_redo);
        let redo=restore(RestoreRequest{
            selected_root:base,project_path:project.to_string_lossy().into_owned(),
            expected_project_sha256:undo.project_sha256,direction:"redo".into(),
        }).unwrap();
        assert_eq!(redo.project_sha256,edited.project_sha256);
        assert!(redo.sequence.is_some());
        assert!(redo.history.can_undo && !redo.history.can_redo);
    }
}
