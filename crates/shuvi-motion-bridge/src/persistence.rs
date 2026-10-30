//! M03: real EffectCraft file.saveAs / file.open with a scoped filesystem boundary.
//! Only a caller-trusted workspace folder and a single validated .ecproj basename may be used.

use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use effectcraft_engine::{Session, project::ItemKind};
use serde_json::{Value, json};

use crate::{CompositionSnapshot, MotionBridge};

const MAX_PROJECT_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct ProjectReceipt {
    pub path: PathBuf,
    pub bytes: u64,
    pub compositions: Vec<CompositionSnapshot>,
    /// The fresh session model read back from disk, not a JSON-only confirmation.
    pub verified_from_disk: bool,
}

fn file_in_workspace(workspace: &Path, basename: &str) -> Result<PathBuf, String> {
    if !basename.ends_with(".ecproj") {
        return Err("project file must end in .ecproj".into());
    }
    let stem = basename
        .strip_suffix(".ecproj")
        .ok_or_else(|| "missing .ecproj extension".to_string())?;
    if stem.is_empty()
        || stem.len() > 80
        || !stem.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err("project basename may contain only ASCII letters, digits, _ or - (1-80 chars)".into());
    }

    // Resolve the explicitly supplied workspace, never an AI-invented path.
    let root = workspace
        .canonicalize()
        .map_err(|e| format!("workspace folder not accessible: {e}"))?;
    if !root.is_dir() {
        return Err("workspace must be an existing directory".into());
    }
    let path = root.join(basename);
    // Do not follow a final-component symlink even if its target is inside the workspace.
    match fs::symlink_metadata(&path) {
        Ok(meta) if meta.file_type().is_symlink() => {
            Err("symlink project targets are not permitted".into())
        }
        Ok(meta) if !meta.is_file() => {
            Err("project target exists but is not a regular file".into())
        }
        Ok(_) => Ok(path),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(path),
        Err(e) => Err(format!("cannot inspect project target: {e}")),
    }
}

fn native_path(path: &Path) -> Result<&str, String> {
    path.to_str()
        .ok_or_else(|| "project path is not UTF-8; native command cannot use it".into())
}

fn open_verified(path: &Path) -> Result<Session, String> {
    let meta = fs::metadata(path).map_err(|e| format!("project does not exist: {e}"))?;
    if !meta.is_file() || meta.len() == 0 || meta.len() > MAX_PROJECT_BYTES {
        return Err("project file must be a nonempty regular file no larger than 64 MiB".into());
    }
    let mut loaded = Session::default();
    // Execute the real native parser and project replacement on a TEMPORARY
    // session: a failed open must never destroy unsaved owner work.
    let reply = loaded
        .execute_checked("file.open", json!({"path": native_path(path)?}))
        .map_err(|e| format!("EffectCraft file.open failed: {e}"))?;
    if reply.get("repaired").and_then(Value::as_array).is_some_and(|v| !v.is_empty()) {
        return Err("EffectCraft repaired invalid project values; refusing silent changes".into());
    }
    if loaded.path.as_deref() != Some(native_path(path)?) {
        return Err("EffectCraft reported a different opened project path".into());
    }
    if loaded.is_dirty() {
        return Err("reopened project unexpectedly marked dirty".into());
    }
    Ok(loaded)
}

fn snapshots(session: &Session) -> Vec<CompositionSnapshot> {
    session
        .project
        .items
        .values()
        .filter_map(|item| {
            let ItemKind::Comp(ref comp) = item.kind else { return None };
            Some(CompositionSnapshot {
                id: item.id.0,
                name: item.name.clone(),
                width: comp.width,
                height: comp.height,
                fps: comp.frame_rate.as_f64(),
                duration_seconds: comp.duration.seconds(),
                project_revision: session.revision,
            })
        })
        .collect()
}

impl MotionBridge {
    pub fn is_dirty(&self) -> bool {
        self.session.is_dirty()
    }

    /// Save actual EffectCraft document data and immediately parse it with a second
    /// real EffectCraft Session, comparing the WHOLE Project model, including IDs,
    /// next-id allocator, compositions, properties, future layers, and metadata.
    ///
    /// This does not allow overwriting unrelated existing files. Only the exact
    /// project path previously saved/opened in THIS session may be updated.
    pub fn save_project(
        &mut self,
        workspace: &Path,
        basename: &str,
    ) -> Result<ProjectReceipt, String> {
        let path = file_in_workspace(workspace, basename)?;
        if path.exists() {
            let same = self
                .session
                .path
                .as_deref()
                .map(Path::new)
                .is_some_and(|current| current == path);
            if !same {
                return Err("refusing to overwrite an unrelated existing project file".into());
            }
        }

        let reply = self
            .session
            .execute_checked("file.saveAs", json!({"path": native_path(&path)?}))
            .map_err(|e| format!("EffectCraft file.saveAs failed: {e}"))?;
        if reply.get("path").and_then(Value::as_str) != Some(native_path(&path)?) {
            return Err("EffectCraft save command did not confirm the requested path".into());
        }

        let loaded = open_verified(&path)?;
        if self.session.project.as_ref() != loaded.project.as_ref() {
            return Err("saved project differs from native file.open readback".into());
        }
        if self.session.is_dirty() {
            return Err("EffectCraft save returned but session remains dirty".into());
        }
        let bytes = fs::metadata(&path)
            .map_err(|e| format!("cannot inspect saved file: {e}"))?
            .len();
        Ok(ProjectReceipt {
            path,
            bytes,
            compositions: snapshots(&loaded),
            verified_from_disk: true,
        })
    }

    /// Open in a new native Session first. Only replace the owner's current
    /// Session after complete disk readback succeeds. Reject replacing dirty work.
    pub fn open_project(
        &mut self,
        workspace: &Path,
        basename: &str,
    ) -> Result<ProjectReceipt, String> {
        if self.session.is_dirty() {
            return Err("unsaved changes exist; save them before opening another project".into());
        }
        let path = file_in_workspace(workspace, basename)?;
        let loaded = open_verified(&path)?;
        let bytes = fs::metadata(&path)
            .map_err(|e| format!("cannot inspect opened file: {e}"))?
            .len();
        let receipt = ProjectReceipt {
            path,
            bytes,
            compositions: snapshots(&loaded),
            verified_from_disk: true,
        };
        self.session = loaded;
        Ok(receipt)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_path_traversal_and_incorrect_extension() {
        let dir = std::env::temp_dir();
        for name in ["../outside.ecproj", "x\\outside.ecproj", "a/b.ecproj", "a.txt", ".ecproj", "bad name.ecproj"] {
            assert!(file_in_workspace(&dir, name).is_err(), "accepted {name}");
        }
    }
}
