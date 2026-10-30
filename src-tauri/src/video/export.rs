//! FilmCraft native H.264 MP4 export, not a mock/demo video.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs, path::{Path,PathBuf},time::{Duration,SystemTime,UNIX_EPOCH}};
const EXPORT_TIMEOUT: Duration=Duration::from_secs(300);
const MAX_FILE_BYTES: u64=2 * 1024 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct ExportRequest {
    pub selected_root: String,
    pub project_path: String,
    pub expected_revision: u64,
    pub expected_project_sha256: String,
    pub output_path: String,
    pub scale: f32,
    pub include_audio: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct ExportReceipt {
    pub project_revision: u64,
    pub project_sha256: String,
    pub output_path: String,
    pub output_bytes: u64,
    pub duration_ticks: i64,
    pub width: u64,
    pub height: u64,
    pub codec: String,
    pub output_probe: Value,
    pub engine_receipt: Value,
}

fn checked_destination(root: &str, output: &str) -> Result<PathBuf,String> {
    let root=Path::new(root);
    let output=Path::new(output);
    if !root.is_absolute() || !output.is_absolute() ||
        !output.extension().and_then(|e|e.to_str()).is_some_and(|e|e.eq_ignore_ascii_case("mp4")) {
        return Err("Output requires an absolute path ending in .mp4".into());
    }
    let canonical_root=fs::canonicalize(root).map_err(|e|e.to_string())?;
    let canonical_parent=fs::canonicalize(output.parent().ok_or("Missing output directory")?)
        .map_err(|e|format!("Output directory unavailable: {e}"))?;
    if !canonical_parent.starts_with(&canonical_root) {return Err("Export cannot escape user-selected root".into());}
    if output.exists() {return Err("Refusing to overwrite existing output".into());}
    let name=output.file_name().ok_or("Missing output filename")?;
    Ok(canonical_parent.join(name))
}

struct Pending(PathBuf);
impl Drop for Pending {
    fn drop(&mut self) {let _=fs::remove_file(&self.0);}
}

fn looks_like_mp4(path:&Path) -> Result<u64,String> {
    let bytes=fs::metadata(path).map_err(|e|e.to_string())?.len();
    if !(100..=MAX_FILE_BYTES).contains(&bytes) {
        return Err("Rendered MP4 empty or exceeds the 2 GiB pilot size cap".into());
    }
    use std::io::Read;
    let mut file=fs::File::open(path).map_err(|e|e.to_string())?;
    let mut header=[0u8;12];
    file.read_exact(&mut header).map_err(|e|e.to_string())?;
    if &header[4..8]!=b"ftyp" {return Err("Rendered output has no ISO BMFF ftyp atom".into());}
    Ok(bytes)
}

pub fn export_mp4(request:ExportRequest) -> Result<ExportReceipt,String> {
    if !request.scale.is_finite() || !(0.25..=1.0).contains(&request.scale) {
        return Err("Pilot MP4 scale must be finite between 0.25 and 1.0".into());
    }
    let project=super::timeline::checked_project(&request.selected_root,&request.project_path)?;
    let dest=checked_destination(&request.selected_root,&request.output_path)?;
    if dest==project {return Err("Project and output must differ".into());}
    let _lock=super::media::ImportLock::acquire(&project)?;
    let fingerprint=super::project_sha256(&project)?;
    if fingerprint!=request.expected_project_sha256 {
        return Err("STALE_PROJECT_CONTENT: export project changed".into());
    }
    let cli=super::configured_cli_path()?;
    let project_str=project.to_str().ok_or("Invalid project path")?;
    let state=super::run_json_bounded(&cli,&["--compact","--project",project_str,"inspect","project"],EXPORT_TIMEOUT)?;
    let rev=state["revision"].as_u64().ok_or("FilmCraft project revision missing")?;
    if rev!=request.expected_revision {
        return Err(format!("STALE_PROJECT_REVISION: expected {}, actual {}",request.expected_revision,rev));
    }
    let nonce=SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e|e.to_string())?.as_nanos();
    let staging=dest.parent().ok_or("Output has no parent")?.join(format!(".shuvi-export-{}-{nonce}.mp4",std::process::id()));
    let _cleanup=Pending(staging.clone());
    let staging_text=staging.to_str().ok_or("Invalid staging file path")?;
    let scale=format!("{:.5}",request.scale);
    let mut args=vec!["--compact","--project",project_str,"export",staging_text,"--format","h264","--scale",&scale];
    if !request.include_audio {args.push("--no-audio");}
    let engine_receipt=super::run_json_bounded(&cli,&args,EXPORT_TIMEOUT)?;
    if engine_receipt.get("offlineMedia").and_then(Value::as_array).is_some_and(|a|!a.is_empty()){
        return Err("Export included offline media; refusing placeholder MP4".into());
    }
    let output_bytes=looks_like_mp4(&staging)?;
    let verified=super::run_json_bounded(&cli,&["--compact","probe",staging_text],EXPORT_TIMEOUT)?;
    let duration=verified["duration"].as_i64().filter(|v|*v>0).ok_or("MP4 duration not verified")?;
    let video=verified.get("video").filter(|v|v.is_object()).ok_or("MP4 video stream missing")?;
    let width=video["width"].as_u64().filter(|v|*v>0).ok_or("MP4 width missing")?;
    let height=video["height"].as_u64().filter(|v|*v>0).ok_or("MP4 height missing")?;
    let codec=video["codec"].as_str().ok_or("MP4 codec missing")?.to_string();
    if !codec.to_ascii_lowercase().contains("264") {return Err(format!("Unexpected output codec: {codec}"));}
    // hard_link creates destination only if it does NOT exist, avoiding silent clobber.
    if super::project_sha256(&project)? != fingerprint {
        return Err("Project changed during export; refusing to publish old render".into());
    }
    fs::hard_link(&staging,&dest).map_err(|e|format!("Cannot publish verified MP4 without overwrite: {e}"))?;
    Ok(ExportReceipt{
        project_revision:rev,project_sha256:fingerprint,output_path:dest.to_string_lossy().into_owned(),
        output_bytes,duration_ticks:duration,width,height,codec,output_probe:verified,engine_receipt,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refuse_output_override_and_untrusted_path() {
        let tmp=super::super::Scratch::create().unwrap();
        let root=tmp.0.to_string_lossy().into_owned();
        let outside=std::env::temp_dir().join("video_out.mp4");
        assert!(checked_destination(&root,outside.to_str().unwrap()).is_err());
        let path=tmp.0.join("exists.mp4");
        fs::write(&path,b"existing").unwrap();
        assert!(checked_destination(&root,path.to_str().unwrap()).is_err());
        assert!(looks_like_mp4(&path).is_err());
    }
    #[test]
    #[ignore="requires real pinned FilmCraft H264 encoder and MP4 decoder"]
    fn real_export_playable_h264_mp4() {
        let tmp=super::super::Scratch::create().unwrap();
        let root=tmp.0.to_string_lossy().into_owned();
        let source=tmp.0.join("blue.mp4");
        fs::write(&source,include_bytes!("../../../tests/video/blue-64x64-12fps.mp4")).unwrap();
        let project=tmp.0.join("edit.fcproj");
        let imported=super::super::media::import_media(root.clone(),project.to_string_lossy().into_owned(),source.to_string_lossy().into_owned()).unwrap();
        let edited=super::super::timeline::apply(super::super::timeline::TimelineRequest{
            selected_root:root.clone(),project_path:project.to_string_lossy().into_owned(),
            expected_revision:imported.project_revision.unwrap(),
            expected_project_sha256:imported.project_sha256.clone(),
            actions:vec![
                super::super::timeline::TimelineAction::CreateSequence{name:"H264 Export".into(),width:64,height:64,fps:12},
                super::super::timeline::TimelineAction::Place{item_id:imported.item_id,track:"V1".into(),seconds:0.,video:true,audio:false}
            ]
        }).unwrap();
        let output=tmp.0.join("rendered.mp4");
        let receipt=export_mp4(ExportRequest{
            selected_root:root,project_path:project.to_string_lossy().into_owned(),
            expected_revision:edited.after_revision,
            expected_project_sha256:edited.project_sha256.clone(),
            output_path:output.to_string_lossy().into_owned(),scale:1.0,include_audio:false
        }).unwrap();
        assert_eq!((receipt.width,receipt.height),(64,64));
        assert!(receipt.output_bytes>100);
        assert!(receipt.duration_ticks>0);
        assert!(output.is_file());
        assert!(export_mp4(ExportRequest{
            selected_root:tmp.0.to_string_lossy().into_owned(),project_path:project.to_string_lossy().into_owned(),
            expected_revision:edited.after_revision,
            expected_project_sha256:edited.project_sha256.clone(),
            output_path:output.to_string_lossy().into_owned(),scale:1.0,include_audio:false
        }).is_err(),"Must not overwrite");
    }
}
