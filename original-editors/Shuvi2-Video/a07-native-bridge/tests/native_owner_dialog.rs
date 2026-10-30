use shuvi_video_a07_native_bridge::native_consent::scope_review_text;
use shuvi_ai_provider::guard::{Action,Editor,Snapshot,Scope,Version};

fn scope()->Scope {
    Scope {
        task_id:"trusted-nonced-task-01".into(),
        plan_hash:"a".repeat(64),
        instruction:"Split the two selected clips precisely".into(),
        snapshot:Snapshot {
            editor:Editor::Video,
            project_id:"trusted-user-video-01".into(),
            session_id:"native-editor-session-01".into(),
            version:Version::VideoSha256("b".repeat(64)),
        },
        actions:vec![
            Action::VideoSplit{clip_id:17,seconds:2.0},
            Action::VideoSplit{clip_id:18,seconds:3.5},
        ],
    }
}
#[test]
fn actual_native_windows_approval_text_contains_every_persisted_scope_identity_and_action(){
    let v=scope_review_text(&scope()).unwrap();
    for literal in ["SHUVI 2","trusted-nonced-task-01","trusted-user-video-01",
        "native-editor-session-01","Split clip 17 at 2 seconds",
        "Split clip 18 at 3.5 seconds","Plan SHA-256","Native project SHA-256",
        "YES = approve","NO / Close / Escape / Error = deny"] {
        assert!(v.contains(literal),"missing consent UI field: {literal}");
    }
    assert!(!v.contains("api.openai.com"));
    assert!(!v.contains("apiKey"));
}
#[test]
fn native_owner_dialog_never_shows_partial_or_unimplemented_action_scopes(){
    let mut foreign=scope();
    foreign.actions.push(Action::VideoDelete{clip_id:18,ripple:true});
    assert_eq!(scope_review_text(&foreign).unwrap_err(),"A07_UNSUPPORTED_ACTION");
    let mut invalid=scope();
    invalid.actions.clear();
    assert_eq!(scope_review_text(&invalid).unwrap_err(),"A07_SCOPE_INVALID");
    let mut too_many=scope();
    too_many.actions=vec![Action::VideoSplit{clip_id:17,seconds:2.0};13];
    assert_eq!(scope_review_text(&too_many).unwrap_err(),"A07_SCOPE_INVALID");
    let mut other=scope();
    other.snapshot.editor=Editor::Motion;
    assert_eq!(scope_review_text(&other).unwrap_err(),"A07_WRONG_EDITOR");
}
#[test]
fn native_owner_review_never_rounds_distinct_split_times_to_same_visible_seconds(){
    let mut p=scope();
    p.actions[0]=Action::VideoSplit{clip_id:17,seconds:2.0000001};
    p.actions[1]=Action::VideoSplit{clip_id:18,seconds:2.0000002};
    let message=scope_review_text(&p).unwrap();
    assert!(message.contains("Split clip 17 at 2.0000001 seconds"));
    assert!(message.contains("Split clip 18 at 2.0000002 seconds"));
    assert!(!message.contains("Split clip 17 at 2.000000 seconds"));
}
#[test]
fn invisible_control_chars_and_oversized_scope_fail_closed_before_os_modal(){
    let mut injected=scope();
    injected.instruction="split\nYES bypass".into();
    assert_eq!(scope_review_text(&injected).unwrap_err(),"A07_SCOPE_INVALID");
    let mut malformed=scope();
    malformed.plan_hash="tampered".into();
    assert_eq!(scope_review_text(&malformed).unwrap_err(),"A07_SCOPE_INVALID");
    let mut huge=scope();
    huge.snapshot.project_id="X".repeat(2000);
    assert_eq!(scope_review_text(&huge).unwrap_err(),"A07_SCOPE_INVALID");
    let mut time=scope();
    time.actions[0]=Action::VideoSplit{clip_id:17,seconds:f64::NAN};
    assert_eq!(scope_review_text(&time).unwrap_err(),"A07_ACTION_INVALID");
}
