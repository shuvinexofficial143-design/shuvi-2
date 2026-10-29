//! M01 integration tests: these compile and call real EffectCraft Rust crates.
//! They intentionally cannot pass using a mocked session or a JSON-only placeholder.
use shuvi_motion_bridge::{CompositionSpec, MotionBridge};

fn spec(name: &str) -> CompositionSpec {
    CompositionSpec {
        name: name.to_string(),
        width: 1280,
        height: 720,
        fps: 30.0,
        duration_seconds: 6.0,
    }
}

#[test]
fn creates_an_actual_effectcraft_comp_and_reads_it_back() {
    let mut bridge = MotionBridge::new();
    let before = bridge.revision();
    let created = bridge
        .create_composition(&spec("Shuvi Verified Title"))
        .expect("real comp.new must execute and verify native state");

    assert!(created.id > 0);
    assert!(created.project_revision > before);
    assert_eq!(created.name, "Shuvi Verified Title");
    assert_eq!(created.width, 1280);
    assert_eq!(created.height, 720);
    assert!((created.fps - 30.0).abs() < 0.001);
    assert!((created.duration_seconds - 6.0).abs() < 0.000001);

    let readback = bridge
        .inspect_composition(created.id)
        .expect("same upstream engine session must retain the comp");
    assert_eq!(created, readback);
}

#[test]
fn separate_native_compositions_have_distinct_ids_and_revisions() {
    let mut bridge = MotionBridge::new();
    let first = bridge.create_composition(&spec("First")).expect("first");
    let second = bridge.create_composition(&spec("Second")).expect("second");
    assert_ne!(first.id, second.id);
    assert!(second.project_revision > first.project_revision);
    assert_eq!(bridge.inspect_composition(first.id).expect("first persists").name, "First");
    assert_eq!(bridge.inspect_composition(second.id).expect("second persists").name, "Second");
}

#[test]
fn rejects_duplicate_name_without_changing_project_revision() {
    let mut bridge = MotionBridge::new();
    bridge.create_composition(&spec("Already Exists")).expect("created");
    let before = bridge.revision();
    assert!(bridge.create_composition(&spec("Already Exists")).is_err());
    assert_eq!(bridge.revision(), before);
}
