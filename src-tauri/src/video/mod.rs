//! Shuvi Video Studio V01: real FilmCraft headless engine smoke.
//! The only executable operation is a fixed sequence-create followed by
//! save/reopen/inspect. No model text or shell command is executed.
use serde::Serialize;
use serde_json::Value;
use std::ffi::OsString;
use std::path::{Path, PathBuf};

pub mod media;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const CLI_ENV: &str = "SHUVI_FILMCRAFT_CLI_PATH";
const LIMIT: Duration = Duration::from_secs(45);
const NEW_SEQUENCE: &str = r#"{"name":"Shuvi V01 Engine Probe","width":16,"height":16,"fps":24}"#;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoProbe {
    pub engine: &'static str,
    pub command: &'static str,
    pub saved_project_bytes: u64,
    pub create_result: Value,
    pub sequence_readback: Value,
}

struct Scratch(PathBuf);

impl Scratch {
    fn create() -> Result<Self, String> {
        for attempt in 0..8 {
            let tick = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|e| format!("System clock error: {e}"))?
                .as_nanos();
            let dir = std::env::temp_dir().join(format!(
                "shuvi-filmcraft-v01-{}-{tick}-{attempt}",
                std::process::id()
            ));
            match std::fs::create_dir(&dir) {
                Ok(()) => return Ok(Self(dir)),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(format!("Cannot create isolated smoke directory: {e}")),
            }
        }
        Err("Cannot reserve isolated smoke directory".into())
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn executable_path(value: OsString) -> Result<PathBuf, String> {
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err(format!("{CLI_ENV} must be an absolute path to a trusted binary"));
    }
    let path = path.canonicalize().map_err(|e| format!("FilmCraft CLI missing: {e}"))?;
    if !path.is_file() {
        return Err("FilmCraft CLI path is not a file".into());
    }
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
    if !matches!(name, "filmcraft-cli" | "filmcraft-cli.exe" | "filmcraft-cli-x86_64-pc-windows-msvc.exe") {
        return Err("FilmCraft CLI must be named filmcraft-cli[.exe] or the pinned Windows Tauri sidecar name".into());
    }
    Ok(path)
}

/// The explicit trusted absolute path wins for tests/development. The Windows
/// video build packages a sidecar next to the Shuvi executable; no PATH search.
fn configured_cli_path() -> Result<PathBuf, String> {
    if let Some(configured) = std::env::var_os(CLI_ENV) {
        return executable_path(configured);
    }
    let app_exe = std::env::current_exe()
        .map_err(|e| format!("Cannot locate Shuvi executable: {e}"))?;
    let app_dir = app_exe.parent()
        .ok_or("Shuvi executable has no containing directory")?;
    let name = if cfg!(windows) { "filmcraft-cli.exe" } else { "filmcraft-cli" };
    let sidecar = app_dir.join(name);
    executable_path(sidecar.into_os_string()).map_err(|_| {
        format!("FilmCraft CLI is unavailable; build the video-enabled Shuvi package or set {CLI_ENV}")
    })
}

fn run_json(cli: &Path, args: &[&str]) -> Result<Value, String> {
    run_json_bounded(cli, args, LIMIT)
}

fn run_json_bounded(cli: &Path, args: &[&str], timeout: Duration) -> Result<Value, String> {
    let mut child = Command::new(cli)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Cannot start FilmCraft headless engine: {e}"))?;
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if start.elapsed() < timeout => thread::sleep(Duration::from_millis(25)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("FilmCraft headless engine timed out".into());
            }
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("Cannot check FilmCraft engine process: {e}"));
            }
        }
    }
    let output = child.wait_with_output().map_err(|e| format!("FilmCraft output read failed: {e}"))?;
    if !output.status.success() {
        return Err(format!("FilmCraft command failed with exit status {}", output.status));
    }
    let output_text = std::str::from_utf8(&output.stdout)
        .map_err(|_| "FilmCraft response is not UTF-8".to_string())?;
    serde_json::from_str(output_text.trim())
        .map_err(|e| format!("FilmCraft response is not valid JSON: {e}"))
}

/// Real engine call + project round-trip, not a mocked command.
pub fn smoke_probe() -> Result<VideoProbe, String> {
    let cli = configured_cli_path()?;
    let scratch = Scratch::create()?;
    let project = scratch.0.join("sequence.fcproj");
    let project_string = project.to_str().ok_or("Project temp path is not UTF-8")?;
    let created = run_json(
        &cli,
        &["--compact", "--save-as", project_string, "exec", "file.newSequence", NEW_SEQUENCE],
    )?;
    let saved_bytes = std::fs::metadata(&project)
        .map_err(|e| format!("FilmCraft did not save a real project: {e}"))?
        .len();
    if saved_bytes == 0 {
        return Err("FilmCraft saved an empty project".into());
    }
    let sequence = run_json(&cli, &["--compact", "--project", project_string, "inspect", "sequence"])?;
    if !sequence.as_object().is_some_and(|v| !v.is_empty()) {
        return Err("FilmCraft sequence.inspect returned no usable sequence".into());
    }
    Ok(VideoProbe {
        engine: "filmcraft-cli",
        command: "file.newSequence -> file.saveAs -> sequence.inspect",
        saved_project_bytes: saved_bytes,
        create_result: created,
        sequence_readback: sequence,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_relative_or_misnamed_executable() {
        assert!(executable_path(OsString::from("filmcraft-cli.exe")).is_err());
        let path = std::env::current_exe().expect("current test binary");
        assert!(executable_path(path.into_os_string()).is_err());
    }

    #[test]
    fn sidecar_filename_and_absolute_location_are_validated() {
        let scratch = Scratch::create().expect("scratch");
        let missing = scratch.0.join("filmcraft-cli.exe");
        assert!(executable_path(missing.into_os_string()).is_err());
        // Never resolve via current directory or PATH: path must be absolute.
        assert!(executable_path(OsString::from("bin/filmcraft-cli.exe")).is_err());
        let staged = scratch.0.join("filmcraft-cli-x86_64-pc-windows-msvc.exe");
        std::fs::write(&staged, b"test-only placeholder").expect("fixture file");
        // Validation accepts the expected Tauri staged filename, never PATH lookup.
        assert_eq!(executable_path(staged.as_os_str().to_os_string()).unwrap(), staged.canonicalize().unwrap());
    }

    #[test]
    #[ignore = "requires pinned FilmCraft CLI executable in SHUVI_FILMCRAFT_CLI_PATH"]
    fn real_filmcraft_smoke() {
        let verified = smoke_probe().expect("real FilmCraft engine/save/reload must work");
        assert!(verified.saved_project_bytes > 0);
        assert!(verified.sequence_readback.is_object());
    }
}
