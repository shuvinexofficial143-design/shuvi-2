use serde::Serialize;

mod subtitles;
mod video;

// Source-pinned does NOT imply installed, compiled, loaded, or operational.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineStatus {
    name: &'static str,
    source_pinned: bool,
    runtime_ready: bool,
}

#[tauri::command]
fn engine_status() -> Vec<EngineStatus> {
    vec![
        EngineStatus { name: "video", source_pinned: true, runtime_ready: false },
        EngineStatus { name: "motion", source_pinned: true, runtime_ready: false },
    ]
}

#[tauri::command]
fn serialize_captions(cues: Vec<subtitles::Cue>) -> Result<String, String> {
    subtitles::serialize(&cues)
}

/// Actual FilmCraft Program frame PNG; never substitute a mock render.
#[tauri::command]
async fn video_preview_frame(
    request: video::preview::PreviewRequest,
) -> Result<video::preview::PreviewReceipt, String> {
    tauri::async_runtime::spawn_blocking(move || video::preview::render(request))
        .await.map_err(|e| format!("Preview worker failed: {e}"))?
}

/// Explicit user-scoped timeline request, with project revision verification.
#[tauri::command]
async fn video_timeline_apply(
    request: video::timeline::TimelineRequest,
) -> Result<video::timeline::TimelineReceipt, String> {
    tauri::async_runtime::spawn_blocking(move || video::timeline::apply(request))
        .await.map_err(|e| format!("Timeline worker failed: {e}"))?
}

/// Explicitly owner-selected import scoped to selected_root. No AI permission
/// delegation is implied by accepting these paths.
#[tauri::command]
async fn video_import_media(
    selected_root: String,
    project_path: String,
    source_path: String,
) -> Result<video::media::VideoImportedMedia, String> {
    tauri::async_runtime::spawn_blocking(move || {
        video::media::import_media(selected_root, project_path, source_path)
    }).await.map_err(|e| format!("Video import worker failed: {e}"))?
}

/// Opt-in real FilmCraft headless smoke, never a fabricated readiness signal.
#[tauri::command]
async fn video_engine_probe() -> Result<video::VideoProbe, String> {
    tauri::async_runtime::spawn_blocking(video::smoke_probe)
        .await
        .map_err(|e| format!("Video engine probe worker failed: {e}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![engine_status, serialize_captions, video_engine_probe, video_import_media, video_timeline_apply, video_preview_frame])
        .run(tauri::generate_context!())
        .expect("Failed to start Shuvi 2");
}
