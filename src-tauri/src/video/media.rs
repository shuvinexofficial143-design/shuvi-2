//! V03: real FilmCraft media ingestion with checked file scope and saved-ID readback.
//! This API is for explicit user-selected import, not an unrestricted agent tool.
use serde::Serialize;
use serde_json::Value;
use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};
use std::time::Duration;

const MAX_PROBE_BYTES: u64 = 384 * 1024 * 1024;
const IMPORT_TIMEOUT: Duration = Duration::from_secs(180);
const TICKS_PER_SECOND: f64 = 254_016_000_000.0;
const EXTENSIONS: &[&str] = &["mp4", "m4v", "mov", "mkv", "webm", "avi", "wav", "wave", "m4a", "mp3", "png", "jpg", "jpeg"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoImportedMedia {
    /// A FilmCraft item ID remains stable when its project is saved/reopened.
    /// Scope itemId to projectPath; it is not globally unique.
    pub item_id: u64,
    pub project_path: String,
    pub source_path: String,
    pub source_bytes: u64,
    pub container: String,
    pub duration_ticks: i64,
    pub duration_seconds: f64,
    pub width: Option<u64>,
    pub height: Option<u64>,
    pub fps_numerator: Option<i64>,
    pub fps_denominator: Option<i64>,
    pub audio_streams: usize,
    pub project_revision: Option<u64>,
    pub project_readback: Value,
}

pub(super) struct ImportLock {
    _file: File,
    path: PathBuf,
}
impl ImportLock {
    pub(super) fn acquire(project: &Path) -> Result<Self, String> {
        let path = project.with_extension("fcproj.shuvi-import.lock");
        let file = OpenOptions::new()
            .write(true).create_new(true).open(&path)
            .map_err(|e| format!("Cannot acquire exclusive Video Studio project import lock: {e}"))?;
        Ok(Self { _file: file, path })
    }
}
impl Drop for ImportLock {
    fn drop(&mut self) { let _ = fs::remove_file(&self.path); }
}

fn absolute_file_inside_root(raw: &str, root: &Path, must_exist: bool) -> Result<PathBuf, String> {
    let path = Path::new(raw);
    if !path.is_absolute() { return Err("Import paths must be absolute".into()); }
    let canonical = if must_exist || path.exists() {
        fs::canonicalize(path).map_err(|e| format!("File cannot be resolved: {e}"))?
    } else {
        let parent = path.parent().ok_or("Project path has no parent")?;
        let directory = fs::canonicalize(parent).map_err(|e| format!("Project directory is unavailable: {e}"))?;
        let name = path.file_name().ok_or("Project filename missing")?;
        directory.join(name)
    };
    if !canonical.starts_with(root) {
        return Err("Media/project is outside the explicitly selected directory".into());
    }
    if must_exist && !canonical.is_file() { return Err("Media input is not a file".into()); }
    if canonical.is_dir() { return Err("Project path names a directory".into()); }
    Ok(canonical)
}

fn validate_paths(root: &str, project: &str, media: &str) -> Result<(PathBuf, PathBuf), String> {
    if !Path::new(root).is_absolute() { return Err("Selected directory must be absolute".into()); }
    let base = fs::canonicalize(root).map_err(|e| format!("Selected directory unavailable: {e}"))?;
    if !base.is_dir() { return Err("Selected root is not a directory".into()); }
    let media_path = absolute_file_inside_root(media, &base, true)?;
    let project_path = absolute_file_inside_root(project, &base, false)?;
    if project_path.extension().and_then(|s| s.to_str()).is_none_or(|s| !s.eq_ignore_ascii_case("fcproj")) {
        return Err("Video Studio project must end in .fcproj".into());
    }
    let ext = media_path.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
    if !EXTENSIONS.contains(&ext.as_str()) { return Err("Unsupported V03 media extension".into()); }
    if media_path == project_path { return Err("Source and project paths must differ".into()); }
    let size = fs::metadata(&media_path).map_err(|e| format!("Cannot stat media file: {e}"))?.len();
    if size == 0 { return Err("Empty media file".into()); }
    // The upstream CLI probe currently reads the whole file into memory.
    if size > MAX_PROBE_BYTES {
        return Err(format!("V03 metadata probe limit is {} MiB on low-memory laptops; larger files need streaming metadata support", MAX_PROBE_BYTES / 1_048_576));
    }
    Ok((project_path, media_path))
}

fn present_in_bin(node: &Value, item_id: u64) -> bool {
    node.get("children").and_then(Value::as_array).is_some_and(|children| {
        children.iter().any(|child| {
            child.get("item").and_then(Value::as_u64) == Some(item_id)
                || present_in_bin(child, item_id)
        })
    })
}

fn required_i64(metadata: &Value, key: &str) -> Result<i64, String> {
    metadata.get(key).and_then(Value::as_i64).filter(|v| *v >= 0)
        .ok_or_else(|| format!("FilmCraft probe missing valid {key}"))
}

/// Only import a file under a directory the owner explicitly selected.
/// The returned project+item identity is verified after reopening the saved project.
pub fn import_media(selected_root: String, project_path: String, source_path: String) -> Result<VideoImportedMedia, String> {
    let (project, media) = validate_paths(&selected_root, &project_path, &source_path)?;
    let _lock = ImportLock::acquire(&project)?;
    let cli = super::configured_cli_path()?;
    let project_text = project.to_str().ok_or("Project path contains invalid UTF-8")?;
    let media_text = media.to_str().ok_or("Media path contains invalid UTF-8")?;
    let metadata = super::run_json_bounded(&cli, &["--compact", "probe", media_text], IMPORT_TIMEOUT)?;
    let ticks = required_i64(&metadata, "duration")?;
    let video = metadata.get("video").filter(|v| v.is_object());
    let width = video.and_then(|v| v.get("width")).and_then(Value::as_u64);
    let height = video.and_then(|v| v.get("height")).and_then(Value::as_u64);
    let rate = video.and_then(|v| v.get("frame_rate"));
    let fps_num = rate.and_then(|v| v.get("num")).and_then(Value::as_i64);
    let fps_den = rate.and_then(|v| v.get("den")).and_then(Value::as_i64);
    if video.is_some() && !(width.is_some_and(|v| v > 0) && height.is_some_and(|v| v > 0) && fps_num.is_some_and(|v| v > 0) && fps_den.is_some_and(|v| v > 0)) {
        return Err("FilmCraft video probe returned incomplete frame metadata".into());
    }
    let existed = project.is_file();
    let mut args = vec!["--compact"];
    if existed { args.extend(["--project", project_text, "--save"]); }
    else { args.extend(["--save-as", project_text]); }
    args.extend(["import", media_text]);
    let imported = super::run_json_bounded(&cli, &args, IMPORT_TIMEOUT)?;
    if imported.get("errors").and_then(Value::as_array).is_some_and(|e| !e.is_empty()) {
        return Err(format!("FilmCraft import reported errors: {}", imported["errors"]));
    }
    let item_id = imported.get("items").and_then(Value::as_array)
        .and_then(|items| (items.len() == 1).then(|| items[0].as_u64()).flatten())
        .ok_or("FilmCraft import did not return exactly one persistent media ID")?;
    if fs::metadata(&project).map_err(|e| format!("FilmCraft failed to persist project: {e}"))?.len() == 0 {
        return Err("FilmCraft persisted an empty project".into());
    }
    let readback = super::run_json_bounded(&cli, &["--compact", "--project", project_text, "inspect", "project"], IMPORT_TIMEOUT)?;
    if !readback.get("root").is_some_and(|root| present_in_bin(root, item_id)) {
        return Err("Imported FilmCraft item ID was absent after reopening saved project".into());
    }
    let source_bytes = fs::metadata(&media).map_err(|e| e.to_string())?.len();
    Ok(VideoImportedMedia {
        item_id,
        project_path: project_text.to_string(),
        source_path: media_text.to_string(),
        source_bytes,
        container: metadata.get("container").and_then(Value::as_str).unwrap_or("unknown").into(),
        duration_ticks: ticks,
        duration_seconds: ticks as f64 / TICKS_PER_SECOND,
        width, height,
        fps_numerator: fps_num, fps_denominator: fps_den,
        audio_streams: metadata.get("audio_streams").and_then(Value::as_array).map_or(0, Vec::len),
        project_revision: readback.get("revision").and_then(Value::as_u64),
        project_readback: readback,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_scope_escape_and_bad_format() {
        let tmp = super::super::Scratch::create().unwrap();
        let inside = tmp.0.join("clip.exe");
        fs::write(&inside, b"not media").unwrap();
        let project = tmp.0.join("edit.fcproj");
        let root = tmp.0.to_string_lossy().to_string();
        assert!(validate_paths(&root, project.to_str().unwrap(), inside.to_str().unwrap()).is_err());
        let outside = std::env::current_exe().unwrap();
        assert!(validate_paths(&root, project.to_str().unwrap(), outside.to_str().unwrap()).is_err());
        let wrong = tmp.0.join("bad.txt");
        assert!(validate_paths(&root, wrong.to_str().unwrap(), inside.to_str().unwrap()).is_err());
    }

    #[test]
    fn verifies_nested_project_item_identity() {
        let example = serde_json::json!({"children": [{"name": "nested", "children": [{"item": 42, "name":"clip"}]}]});
        assert!(present_in_bin(&example, 42));
        assert!(!present_in_bin(&example, 43));
    }

    /// Real 64x64 H.264 MP4 fixture, independently generated with ffmpeg.
    /// Runs only when pinned FilmCraft CLI is available.
    #[test]
    #[ignore = "requires pinned FilmCraft CLI binary"]
    fn real_mp4_import_round_trip() {
        let tmp = super::super::Scratch::create().unwrap();
        let root = tmp.0.to_string_lossy().into_owned();
        let mp4 = tmp.0.join("blue-64x64-12fps.mp4");
        let project = tmp.0.join("video.fcproj");
        fs::write(&mp4, include_bytes!("../../../tests/video/blue-64x64-12fps.mp4")).unwrap();
        let asset = import_media(root, project.to_string_lossy().into_owned(), mp4.to_string_lossy().into_owned()).unwrap();
        assert_eq!(asset.source_bytes, 1642);
        assert_eq!(asset.width, Some(64));
        assert_eq!(asset.height, Some(64));
        assert_eq!(asset.fps_numerator, Some(12));
        assert_eq!(asset.fps_denominator, Some(1));
        assert!(asset.duration_seconds > 0.9 && asset.duration_seconds < 1.1, "{:?}", asset);
        assert!(present_in_bin(&asset.project_readback["root"], asset.item_id));
    }
}
