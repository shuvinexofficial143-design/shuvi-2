//! M03 E2E integration tests: real EffectCraft native file.saveAs / file.open,
//! independent sessions, strict workspace and content-equivalent readback.
use std::fs;
use shuvi_motion_bridge::{CompositionSnapshot, CompositionSpec, MotionBridge};

fn spec(name: &str, width: u32, height: u32, fps: f64, seconds: f64) -> CompositionSpec {
    CompositionSpec {
        name: name.to_string(),
        width,
        height,
        fps,
        duration_seconds: seconds,
    }
}
fn equivalent(a: &CompositionSnapshot, b: &CompositionSnapshot) {
    assert_eq!(a.id, b.id, "native ItemId changed after persistence");
    assert_eq!(a.name, b.name);
    assert_eq!((a.width, a.height), (b.width, b.height));
    assert!((a.fps - b.fps).abs() < 0.001);
    assert!((a.duration_seconds - b.duration_seconds).abs() < 0.001);
}

#[test]
fn saves_and_reopens_real_multi_comp_project_with_stable_ids() {
    let folder = tempfile::tempdir().unwrap();
    let mut creator = MotionBridge::new();
    assert!(!creator.is_dirty());
    let main = creator
        .create_composition(&spec("Hindi_Title", 1920, 1080, 24.0, 12.0))
        .unwrap();
    let vertical = creator
        .create_composition(&spec("Vertical_Overlay", 1080, 1920, 60.0, 5.0))
        .unwrap();
    assert!(creator.is_dirty());
    let saved = creator.save_project(folder.path(), "scene.ecproj").unwrap();
    assert!(saved.verified_from_disk);
    assert!(saved.bytes > 100);
    assert_eq!(saved.compositions.len(), 2);
    assert!(!creator.is_dirty());
    assert!(fs::read_to_string(&saved.path).unwrap().contains("Hindi_Title"));

    let mut restart = MotionBridge::new();
    let opened = restart.open_project(folder.path(), "scene.ecproj").unwrap();
    assert!(opened.verified_from_disk);
    assert!(!restart.is_dirty());
    assert_eq!(opened.bytes, saved.bytes);
    for original in [&main, &vertical] {
        equivalent(original, &restart.inspect_composition(original.id).unwrap());
    }

    // The native allocator must persist, so subsequent editing cannot reuse IDs.
    let after = restart
        .create_composition(&spec("Continued_Edit", 1280, 720, 30.0, 9.0))
        .unwrap();
    assert!(restart.is_dirty());
    assert!(after.id > main.id && after.id > vertical.id);
    assert!(restart.open_project(folder.path(), "scene.ecproj").is_err());
    equivalent(&after, &restart.inspect_composition(after.id).unwrap());

    // Save again to the exact currently-owned file; ensure reopen contains all edits.
    let saved_again = restart.save_project(folder.path(), "scene.ecproj").unwrap();
    assert_eq!(saved_again.compositions.len(), 3);
    assert!(!restart.is_dirty());
    let mut second_restart = MotionBridge::new();
    let loaded_again = second_restart.open_project(folder.path(), "scene.ecproj").unwrap();
    assert_eq!(loaded_again.compositions.len(), 3);
    for original in [&main, &vertical, &after] {
        equivalent(original, &second_restart.inspect_composition(original.id).unwrap());
    }
}

#[test]
fn cannot_overwrite_unowned_file_or_traverse_workspace() {
    let folder = tempfile::tempdir().unwrap();
    let existing = folder.path().join("unowned.ecproj");
    fs::write(&existing, "untouched").unwrap();
    let mut bridge = MotionBridge::new();
    bridge.create_composition(&spec("Title", 640, 360, 24.0, 4.0)).unwrap();
    let prior = bridge.revision();
    assert!(bridge.save_project(folder.path(), "unowned.ecproj").is_err());
    assert_eq!(fs::read_to_string(&existing).unwrap(), "untouched");
    assert!(bridge.save_project(folder.path(), "../escape.ecproj").is_err());
    assert!(bridge.save_project(folder.path(), "bad\\path.ecproj").is_err());
    assert!(bridge.save_project(folder.path(), "not-a-project.json").is_err());
    assert_eq!(bridge.revision(), prior);
    assert!(bridge.is_dirty());
}

#[test]
fn malformed_or_missing_project_never_replaces_valid_state() {
    let folder = tempfile::tempdir().unwrap();
    let mut bridge = MotionBridge::new();
    let original = bridge.create_composition(&spec("Stay", 800, 600, 25.0, 7.0)).unwrap();
    bridge.save_project(folder.path(), "good.ecproj").unwrap();
    assert!(!bridge.is_dirty());

    fs::write(folder.path().join("malformed.ecproj"), b"not an EffectCraft file").unwrap();
    assert!(bridge.open_project(folder.path(), "malformed.ecproj").is_err());
    assert!(bridge.open_project(folder.path(), "absent.ecproj").is_err());
    equivalent(&original, &bridge.inspect_composition(original.id).unwrap());
    assert!(!bridge.is_dirty());
}

#[test]
fn untracked_existing_file_cannot_be_claimed_even_when_it_is_a_valid_project() {
    let folder = tempfile::tempdir().unwrap();
    let mut first = MotionBridge::new();
    first.create_composition(&spec("Owned", 640, 480, 30.0, 3.0)).unwrap();
    let saved = first.save_project(folder.path(), "keep.ecproj").unwrap();
    let bytes = fs::read(&saved.path).unwrap();

    let mut another = MotionBridge::new();
    another.create_composition(&spec("Unrelated", 1920, 1080, 30.0, 3.0)).unwrap();
    assert!(another.save_project(folder.path(), "keep.ecproj").is_err());
    assert_eq!(fs::read(&saved.path).unwrap(), bytes);
}

#[cfg(unix)]
#[test]
fn symlink_project_target_is_rejected_even_when_pointing_inside_workspace() {
    use std::os::unix::fs::symlink;
    let folder = tempfile::tempdir().unwrap();
    let target = folder.path().join("real.ecproj");
    fs::write(&target, "target").unwrap();
    symlink(&target, folder.path().join("link.ecproj")).unwrap();
    let mut bridge = MotionBridge::new();
    assert!(bridge.open_project(folder.path(), "link.ecproj").is_err());
}
