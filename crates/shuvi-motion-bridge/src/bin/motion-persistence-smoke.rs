//! Windows CI M03: save genuine .ecproj, discard session, reopen, verify IDs/settings.
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use shuvi_motion_bridge::{CompositionSpec, MotionBridge};

struct Scratch(PathBuf);
impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn run() -> Result<(), String> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let folder = std::env::temp_dir().join(format!("shuvi-m03-{}-{nonce}", std::process::id()));
    fs::create_dir(&folder).map_err(|e| format!("cannot create smoke test folder: {e}"))?;
    let _cleanup = Scratch(folder.clone());

    let mut writer = MotionBridge::new();
    let original = writer.create_composition(&CompositionSpec {
        name: "Shuvi Hindi Persisted Title".into(),
        width: 1920,
        height: 1080,
        fps: 30.0,
        duration_seconds: 10.0,
    })?;
    let saved = writer.save_project(&folder, "shuvi_m03.ecproj")?;
    if !saved.verified_from_disk || saved.bytes == 0 {
        return Err("native saved file not verified".into());
    }

    // Separate native Session, not a fake in-memory or JSON-only echo.
    drop(writer);
    let mut reader = MotionBridge::new();
    let reopened = reader.open_project(&folder, "shuvi_m03.ecproj")?;
    let state = reader.inspect_composition(original.id)?;
    if !reopened.verified_from_disk
        || state.id != original.id
        || state.name != original.name
        || state.width != original.width
        || state.height != original.height
        || (state.fps - original.fps).abs() > 0.001
        || (state.duration_seconds - original.duration_seconds).abs() > 0.001
    {
        return Err("disk-reloaded EffectCraft project differs from original".into());
    }
    if reader.is_dirty() {
        return Err("just-reopened project unexpectedly marked dirty".into());
    }

    println!(
        "{}",
        serde_json::json!({
            "ok": true,
            "engine": "effectcraft",
            "proof": "native-disk-save-reopen",
            "fileBytes": reopened.bytes,
            "compositions": reopened.compositions.len(),
            "composition": {
                "id": state.id,
                "name": state.name,
                "width": state.width,
                "height": state.height,
                "fps": state.fps,
                "durationSeconds": state.duration_seconds
            }
        })
    );
    Ok(())
}

fn main() {
    if let Err(err) = run() {
        eprintln!("M03 native persistence smoke FAILED: {err}");
        std::process::exit(1);
    }
}
