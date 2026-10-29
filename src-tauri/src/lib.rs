use serde::Serialize;

mod subtitles;
mod motion;

// Source-pinned does NOT imply installed, compiled, loaded, or operational.
// False means no verified direct engine integration is available yet.
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(motion::MotionHost::new())
        .invoke_handler(tauri::generate_handler![engine_status, serialize_captions, motion::motion_command])
        .run(tauri::generate_context!())
        .expect("Failed to start Shuvi 2");
}
