//! AI01 baseline: exercise the ORIGINAL native FilmCraft Session, not a fake
//! transport, WebView clone, synthetic input path or mocked editor.
use filmcraft_engine::{Session, shuvi_ai_readonly};
use serde_json::json;

#[test]
fn snapshot_is_read_only_and_advertises_no_edit_authority() {
    let mut session = Session::default();
    let before = (session.revision, session.document_epoch, session.journal.len());
    let observed = shuvi_ai_readonly::snapshot(&mut session).expect("native project inspection");
    assert_eq!(observed.revision, before.0);
    assert_eq!(observed.document_epoch, before.1);
    assert_eq!(observed.active_sequence, None);
    assert!(observed.sequence.is_none());
    assert!(observed.project.is_object());
    assert_eq!((session.revision, session.document_epoch, session.journal.len()), before);
    let readiness = shuvi_ai_readonly::readiness();
    assert!(readiness.source_session_readback);
    assert!(!readiness.ai_mutations_enabled);
    assert!(!readiness.shared_owner_lock);
    assert!(!readiness.durable_action_ledger);
    assert!(!readiness.native_owner_consent);
}

#[test]
fn registry_is_original_engine_registry_without_write_side_effects() {
    let mut session = Session::default();
    let rev = session.revision;
    let journal = session.journal.len();
    let cmds = shuvi_ai_readonly::command_registry(&mut session).expect("registry");
    let commands = cmds.as_array().expect("array");
    for id in ["command.list", "project.inspect", "sequence.inspect",
               "file.newSequence", "sequence.addEditAllTracks", "edit.undo",
               "edit.redo", "file.saveAs", "file.open"] {
        let entry = commands.iter().find(|x| x["id"] == id).expect("native registry entry");
        assert!(entry["params"].is_string(), "{entry}");
    }
    assert_eq!(session.revision, rev);
    assert_eq!(session.journal.len(), journal);
}

#[test]
fn native_sequence_create_and_snapshot_share_exact_session() {
    let mut session = Session::default();
    let before = shuvi_ai_readonly::snapshot(&mut session).unwrap();
    let result = session.execute("file.newSequence", json!({"name": "Shuvi Test", "width": 320, "height": 180})).unwrap();
    let after = shuvi_ai_readonly::snapshot(&mut session).unwrap();
    assert_eq!(after.active_sequence, result["sequence"].as_u64());
    assert!(after.revision > before.revision);
    assert!(after.sequence.as_ref().is_some_and(|x| x["video"].is_array()));
    assert_eq!(after.document_epoch, before.document_epoch);
    assert!(session.journal.iter().any(|(id, _)| id == "file.newSequence"));
}

#[test]
fn native_timeline_split_undo_redo_verified_from_readback() {
    let mut session = Session::default();
    session.execute("file.openDemoProject", json!({})).unwrap();
    let before = shuvi_ai_readonly::snapshot(&mut session).unwrap();
    let clip_count = |value: &serde_json::Value| -> usize {
        value["video"][0]["items"].as_array().unwrap().len()
    };
    let original = clip_count(before.sequence.as_ref().unwrap());
    session.execute("playhead.set", json!({"seconds": 2.0})).unwrap();
    let split = session.execute("sequence.addEditAllTracks", json!({})).unwrap();
    assert!(split["cuts"].as_u64().unwrap_or(0) > 0, "real split must have made cuts: {split}");
    let changed = shuvi_ai_readonly::snapshot(&mut session).unwrap();
    assert_eq!(clip_count(changed.sequence.as_ref().unwrap()), original + 1);
    assert!(changed.revision > before.revision);
    session.execute("edit.undo", json!({})).unwrap();
    let undone = shuvi_ai_readonly::snapshot(&mut session).unwrap();
    assert_eq!(clip_count(undone.sequence.as_ref().unwrap()), original);
    session.execute("edit.redo", json!({})).unwrap();
    let redone = shuvi_ai_readonly::snapshot(&mut session).unwrap();
    assert_eq!(clip_count(redone.sequence.as_ref().unwrap()), original + 1);
}

#[test]
fn native_project_save_reopen_preserves_project_geometry() {
    let path = std::env::temp_dir().join(format!(
        "shuvi-ai01-{}-{}.fcproj",
        std::process::id(),
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
    ));
    let target = path.to_string_lossy().to_string();
    let mut session = Session::default();
    session.execute("file.newSequence", json!({"name": "Persisted", "width": 320, "height": 180, "fps": 24.0})).unwrap();
    let before = shuvi_ai_readonly::snapshot(&mut session).unwrap();
    session.execute("file.saveAs", json!({"path": target})).unwrap();
    assert!(path.metadata().unwrap().len() > 0);
    let mut reloaded = Session::default();
    reloaded.execute("file.open", json!({"path": path.to_string_lossy()})).unwrap();
    let after = shuvi_ai_readonly::snapshot(&mut reloaded).unwrap();
    // Native FilmCraft Save As intentionally renames the document after the filename.
    // The original in-memory name was "Untitled"; the saved document is not.
    assert_eq!(before.project["name"], "Untitled");
    assert_eq!(after.project["name"], path.file_stem().unwrap().to_string_lossy().as_ref());
    assert_eq!(reloaded.project.sequences().count(), 1);
    assert_eq!(reloaded.active_sequence().map(|s| s.settings.width), Some(320));
    assert_eq!(reloaded.active_sequence().map(|s| s.settings.height), Some(180));
    drop(reloaded);
    drop(session);
    std::fs::remove_file(&path).unwrap();
}

#[test]
fn invalid_or_disabled_native_commands_do_not_mutate_project() {
    let mut session = Session::default();
    let before = (session.revision, session.document_epoch, session.journal.len());
    assert!(session.execute("shuvi.ai.executeArbitrary", json!({})).is_err());
    assert!(session.execute("sequence.addEditAllTracks", json!({"time": 5})).is_err());
    assert_eq!((session.revision, session.document_epoch, session.journal.len()), before);
}

#[test]
fn native_a07_model_inventory_is_exact_and_has_no_paths_or_credentials() {
    let mut session = Session::default();
    session.execute("file.openDemoProject", json!({})).unwrap();
    let revision = session.revision;
    let inventory = shuvi_ai_readonly::a07_video_inventory(&mut session).unwrap();
    let keys = inventory.as_object().unwrap();
    assert_eq!(keys.len(), 2);
    assert!(keys.contains_key("clipIds"));
    assert!(keys.contains_key("mediaIds"));
    let all = inventory.to_string();
    for key in ["projectPath", "path", "apiKey", "token", "content", "authorization"] {
        assert!(!all.contains(key), "native inventory leaked forbidden data: {key}");
    }
    assert!(inventory["clipIds"].as_array().unwrap().len() <= 128);
    assert!(inventory["mediaIds"].as_array().unwrap().len() <= 128);
    assert_eq!(session.revision, revision, "inventory is read-only");
}

#[test]
fn native_a07_project_sha256_tracks_real_manual_edit_and_undo_without_model_input() {
    let mut session = Session::default();
    let original = shuvi_ai_readonly::a07_native_project_sha256(&session);
    assert_eq!(original.len(), 64);
    assert!(original.bytes().all(|c| c.is_ascii_hexdigit()));
    let proof = shuvi_ai_readonly::a07_readonly_native_fingerprint(&mut session).unwrap();
    assert_eq!(proof["versionSha256"], original);
    assert_eq!(proof["editor"], "video");
    assert!(proof.as_object().unwrap().len() == 5);
    assert_eq!(session.revision, proof["revision"].as_u64().unwrap());
    session.execute("file.newSequence", json!({"name": "Native SHA test"})).unwrap();
    let after = shuvi_ai_readonly::a07_native_project_sha256(&session);
    assert_ne!(after, original, "actual project edit changes canonical native bytes");
    assert_eq!(after, shuvi_ai_readonly::a07_native_project_sha256(&session));
    session.execute("edit.undo", json!({})).unwrap();
    assert_eq!(shuvi_ai_readonly::a07_native_project_sha256(&session), original);
}

#[test]
fn native_a07_clip_proof_detects_real_split_and_rejects_invalid_ids() {
    let mut session = Session::default();
    session.execute("file.openDemoProject", json!({})).unwrap();
    let original = shuvi_ai_readonly::snapshot(&mut session).unwrap();
    let clip = original.sequence.as_ref().unwrap()["video"][0]["items"].as_array()
        .unwrap().iter().find(|item| item["start"].as_i64().unwrap_or(0) < 2 * filmcraft_engine::time::TICKS_PER_SECOND
            && item["end"].as_i64().unwrap_or(0) > 2 * filmcraft_engine::time::TICKS_PER_SECOND)
        .and_then(|item|item["clip"].as_u64()).expect("a real clip crosses two seconds");
    let sha = shuvi_ai_readonly::a07_native_clip_sha256(&session, clip).unwrap();
    assert_eq!(sha.len(), 64);
    assert_eq!(sha, shuvi_ai_readonly::a07_native_clip_sha256(&session, clip).unwrap());
    assert!(shuvi_ai_readonly::a07_native_clip_sha256(&session, 0).is_err());
    assert!(shuvi_ai_readonly::a07_native_clip_sha256(&session, u64::MAX).is_err());
    session.execute("playhead.set", json!({"seconds": 2.0})).unwrap();
    session.execute("sequence.addEditAllTracks", json!({})).unwrap();
    let changed = shuvi_ai_readonly::a07_native_clip_sha256(&session, clip).unwrap();
    assert_ne!(sha, changed, "original clip shorter after native split");
}
