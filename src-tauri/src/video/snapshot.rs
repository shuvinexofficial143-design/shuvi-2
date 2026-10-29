//! Read a stable project snapshot to start/resume video edits after manual changes.
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct ProjectSnapshot {
    pub project_path:String,
    /// Persistent SHA-256 of the actual project bytes (not a session revision).
    pub project_sha256:String,
    pub session_revision:u64,
    pub project:Value,
    pub sequence:Option<Value>,
}
pub fn inspect(selected_root:String,project_path:String)->Result<ProjectSnapshot,String>{
    let path=super::timeline::checked_project(&selected_root,&project_path)?;
    let _lock=super::media::ImportLock::acquire(&path)?;
    let cli=super::configured_cli_path()?;
    let path_text=path.to_str().ok_or("Invalid project path")?;
    let digest=super::project_sha256(&path)?;
    let project=super::run_json_bounded(&cli,&["--compact","--project",path_text,"inspect","project"],Duration::from_secs(60))?;
    let session_revision=project["revision"].as_u64().ok_or("FilmCraft session revision missing")?;
    let sequence=if project.get("activeSequence").is_some_and(|v|v.is_u64()) {
        Some(super::run_json_bounded(&cli,&["--compact","--project",path_text,"inspect","sequence"],Duration::from_secs(60))?)
    } else {None};
    if super::project_sha256(&path)?!=digest {
        return Err("EXTERNAL_PROJECT_EDIT: refresh snapshot".into());
    }
    Ok(ProjectSnapshot{project_path:path_text.into(),project_sha256:digest,session_revision,project,sequence})
}
