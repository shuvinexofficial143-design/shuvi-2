//! V-AI16 real Windows-owned OS Yes/No confirmation for canonical persisted A07 scopes.
//!
//! Important: isolated bridge only. It does not secretly enable the FilmCraft
//! production GUI. The GUI must migrate to the canonical SQLite GuardedHost
//! before the owner dialog is able to approve real AI editing.
//!
//! Never open a modal from a provider callback. Ledger::approve calls grant()
//! with its validated, PERSISTED Scope after current native owner verification.
//! A Windows operator must see all split actions and explicitly press YES.
use shuvi_ai_provider::guard::{Action,Editor,OwnerConsent,Scope,Version};

const MAX_DIALOG_CHARS: usize=8192;

pub fn scope_review_text(scope:&Scope)->Result<String,&'static str> {
    if scope.snapshot.editor!=Editor::Video {
        return Err("A07_WRONG_EDITOR");
    }
    let Version::VideoSha256(sha)=&scope.snapshot.version else {
        return Err("A07_WRONG_VERSION");
    };
    if sha.len()!=64 ||
        !sha.bytes().all(|c|c.is_ascii_hexdigit()&& !c.is_ascii_uppercase()) ||
        scope.task_id.len()<8 || scope.task_id.len()>64 ||
        !scope.task_id.bytes().all(|c|c.is_ascii_alphanumeric() || c==b'-' || c==b'_') ||
        scope.plan_hash.len()!=64 ||
        !scope.plan_hash.bytes().all(|c|c.is_ascii_hexdigit()&&!c.is_ascii_uppercase()) ||
        scope.instruction.trim().is_empty() ||
        scope.instruction.len()>2000 ||
        scope.instruction.chars().any(char::is_control) ||
        scope.snapshot.project_id.is_empty() ||
        scope.snapshot.project_id.len()>1024 ||
        scope.snapshot.project_id.chars().any(char::is_control) ||
        scope.snapshot.session_id.len()<8 ||
        scope.snapshot.session_id.len()>128 ||
        scope.snapshot.session_id.chars().any(char::is_control) ||
        !(1..=12).contains(&scope.actions.len()) {
        return Err("A07_SCOPE_INVALID");
    }
    let mut message=format!(
        "SHUVI 2 — REAL NATIVE VIDEO EDIT APPROVAL

Only click YES if you personally requested these exact edits.
Press NO to deny. This is NOT a preview or a test edit.

Task: {}
Project: {}
Native session: {}
Native project SHA-256: {}
Plan SHA-256: {}

YOUR INSTRUCTION:
{}

EXACT EDIT ACTIONS ({}):

",
        scope.task_id,scope.snapshot.project_id,
        scope.snapshot.session_id,sha,scope.plan_hash,
        scope.instruction,scope.actions.len());
    for (index,action) in scope.actions.iter().enumerate(){
        let Action::VideoSplit{clip_id,seconds}=action else {
            return Err("A07_UNSUPPORTED_ACTION");
        };
        if *clip_id==0 || *clip_id>9_007_199_254_740_991 ||
            !seconds.is_finite() || !(0.0..=21_600.0).contains(seconds){
            return Err("A07_ACTION_INVALID");
        }
        message.push_str(&format!("{}. Split clip {} at {:.6} seconds\n",
            index+1,clip_id,seconds));
    }
    message.push_str("
YES = approve exactly this persisted task once.
NO / Close / Escape / Error = deny.

Never approve if any clip, time, project, or task is unexpected.");
    if message.chars().count()>MAX_DIALOG_CHARS {
        return Err("A07_DIALOG_TOO_LONG");
    }
    Ok(message)
}

/// Implements canonical A07's real OwnerConsent callback, not a test-fixture
/// or a model-selected `approved:true` flag. The UI owner presents the
/// persisted plan with a Windows-native YES/NO dialog. NO is the default.
pub struct WindowsNativeOwnerConsent;
impl OwnerConsent for WindowsNativeOwnerConsent {
    fn grant(&mut self,scope:&Scope)->bool{
        let Ok(message)=scope_review_text(scope) else {return false};
        #[cfg(windows)] {
            use windows_sys::Win32::UI::WindowsAndMessaging::{
                MessageBoxW,IDYES,MB_YESNO,MB_ICONWARNING,MB_DEFBUTTON2,MB_TOPMOST
            };
            let wide:Vec<u16>=message.encode_utf16().chain(std::iter::once(0)).collect();
            let title:Vec<u16>="Shuvi 2 — Confirm exact native video edits"
                .encode_utf16().chain(std::iter::once(0)).collect();
            // Windows OS owns the modal interaction. No browser, fake click,
            // or remote model callback can set its return value.
            unsafe {
                MessageBoxW(std::ptr::null_mut(),wide.as_ptr(),title.as_ptr(),
                    MB_YESNO | MB_ICONWARNING | MB_DEFBUTTON2 | MB_TOPMOST)==IDYES
            }
        }
        #[cfg(not(windows))]
        {
            let _=message;
            false
        }
    }
}
