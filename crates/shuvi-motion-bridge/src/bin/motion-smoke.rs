//! Standalone headless M01 proof. Prints JSON only after reading actual engine state.
use shuvi_motion_bridge::{CompositionSpec, MotionBridge};

fn run() -> Result<(), String> {
    let mut engine = MotionBridge::new();
    let before = engine.revision();
    let snapshot = engine.create_composition(&CompositionSpec {
        name: "Shuvi M01 Engine Smoke".to_string(),
        width: 1920,
        height: 1080,
        fps: 30.0,
        duration_seconds: 10.0,
    })?;
    let readback = engine.inspect_composition(snapshot.id)?;
    if snapshot != readback || snapshot.project_revision <= before {
        return Err("native session did not preserve verified composition".into());
    }
    println!(
        "{}",
        serde_json::json!({
            "ok": true,
            "engine": "effectcraft",
            "command": "comp.new",
            "proof": "native-project-readback",
            "composition": {
                "id": readback.id,
                "name": readback.name,
                "width": readback.width,
                "height": readback.height,
                "fps": readback.fps,
                "durationSeconds": readback.duration_seconds
            },
            "projectRevision": readback.project_revision
        })
    );
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("M01 real-engine smoke FAILED: {error}");
        std::process::exit(1);
    }
}
