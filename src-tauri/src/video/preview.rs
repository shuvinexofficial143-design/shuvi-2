//! V05 first native slice: real FilmCraft Program-frame PNG from a saved project.
use serde::{Deserialize, Serialize};
use std::fs;
use std::time::Duration;

const RENDER_TIMEOUT: Duration = Duration::from_secs(90);
const MAX_PNG_BYTES: usize = 8 * 1024 * 1024;
const PNG_MAGIC: &[u8; 8] = b"\x89PNG\r\n\x1a\n";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewRequest {
    pub selected_root: String,
    pub project_path: String,
    pub expected_revision: u64,
    pub seconds: f64,
    pub scale: f32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewReceipt {
    pub project_path: String,
    pub project_revision: u64,
    pub seconds: f64,
    pub width: u32,
    pub height: u32,
    pub png_bytes: Vec<u8>,
}

fn png_dimensions(data: &[u8]) -> Result<(u32,u32), String> {
    if data.len() < 33 || !data.starts_with(PNG_MAGIC) || &data[12..16] != b"IHDR" {
        return Err("FilmCraft frame does not contain a valid PNG header".into());
    }
    let width = u32::from_be_bytes(data[16..20].try_into().unwrap());
    let height = u32::from_be_bytes(data[20..24].try_into().unwrap());
    if width == 0 || height == 0 || width > 4096 || height > 4096 {
        return Err("FilmCraft frame dimensions are outside safe preview limits".into());
    }
    Ok((width,height))
}

pub fn render(request: PreviewRequest) -> Result<PreviewReceipt, String> {
    if !request.seconds.is_finite() || !(0.0..=86_400.0).contains(&request.seconds) ||
        !request.scale.is_finite() || !(0.1..=0.5).contains(&request.scale) {
        return Err("Preview time/scale invalid; use 0.1–0.5 resolution".into());
    }
    let project = super::timeline::checked_project(&request.selected_root,&request.project_path)?;
    // Serialized alongside imports and edits; an edit cannot change project mid-render.
    let _lock = super::media::ImportLock::acquire(&project)?;
    let cli=super::configured_cli_path()?;
    let path=project.to_str().ok_or("Invalid UTF-8 project path")?;
    let before=super::run_json_bounded(&cli,&["--compact","--project",path,"inspect","project"],RENDER_TIMEOUT)?;
    let revision=before["revision"].as_u64().ok_or("FilmCraft project revision missing")?;
    if revision!=request.expected_revision {
        return Err(format!("STALE_PROJECT_REVISION: expected {}, actual {}",request.expected_revision,revision));
    }
    let scratch=super::Scratch::create()?;
    let png=scratch.0.join("frame.png");
    let png_path=png.to_str().ok_or("PNG path cannot be encoded")?;
    let sec=format!("{:.6}",request.seconds);
    let scale=format!("{:.5}",request.scale);
    // "render" creates real frames and rejects offline footage unless explicitly allowed.
    super::run_text_bounded(&cli,&["--project",path,"render","--seconds",&sec,"--out",png_path,"--scale",&scale],RENDER_TIMEOUT)?;
    let bytes=fs::read(&png).map_err(|e| format!("FilmCraft did not write PNG frame: {e}"))?;
    if bytes.len()>MAX_PNG_BYTES { return Err("Preview PNG exceeds 8 MiB limit".into()); }
    let (width,height)=png_dimensions(&bytes)?;
    let after=super::run_json_bounded(&cli,&["--compact","--project",path,"inspect","project"],RENDER_TIMEOUT)?;
    if after["revision"].as_u64()!=Some(revision) {
        return Err("Project revision changed during preview; frame discarded".into());
    }
    Ok(PreviewReceipt{project_path:path.into(),project_revision:revision,seconds:request.seconds,width,height,png_bytes:bytes})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_fake_png_headers_and_sizes() {
        assert!(png_dimensions(&[]).is_err());
        assert!(png_dimensions(&[0; 50]).is_err());
        let mut bytes=vec![0;33];
        bytes[..8].copy_from_slice(PNG_MAGIC);
        bytes[12..16].copy_from_slice(b"IHDR");
        bytes[16..20].copy_from_slice(&64_u32.to_be_bytes());
        bytes[20..24].copy_from_slice(&32_u32.to_be_bytes());
        assert_eq!(png_dimensions(&bytes),Ok((64,32)));
    }

    #[test]
    #[ignore = "requires pinned FilmCraft CLI and real H264 MP4 video"]
    fn real_program_frame_png() {
        let tmp=super::super::Scratch::create().unwrap();
        let root=tmp.0.to_string_lossy().into_owned();
        let source=tmp.0.join("blue.mp4");
        fs::write(&source,include_bytes!("../../../tests/video/blue-64x64-12fps.mp4")).unwrap();
        let project=tmp.0.join("preview.fcproj");
        let imported=super::super::media::import_media(
            root.clone(),project.to_string_lossy().into_owned(),source.to_string_lossy().into_owned()
        ).unwrap();
        let edited=super::super::timeline::apply(super::super::timeline::TimelineRequest{
            selected_root:root.clone(),project_path:project.to_string_lossy().into_owned(),
            expected_revision:imported.project_revision.unwrap(),
            actions:vec![
                super::super::timeline::TimelineAction::CreateSequence{name:"Preview".into(),width:64,height:64,fps:12},
                super::super::timeline::TimelineAction::Place{item_id:imported.item_id,track:"V1".into(),seconds:0.0,video:true,audio:false}
            ],
        }).unwrap();
        let frame=render(PreviewRequest{
            selected_root:root,project_path:project.to_string_lossy().into_owned(),
            expected_revision:edited.after_revision,seconds:0.25,scale:0.5
        }).unwrap();
        assert_eq!((frame.width,frame.height),(32,32));
        assert!(frame.png_bytes.len()>80);
        assert!(frame.png_bytes.starts_with(PNG_MAGIC));
    }
}
