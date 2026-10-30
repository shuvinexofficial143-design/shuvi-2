//! M15: bounded, real native EffectCraft PNG image sequence; never overwrite owner files.
//! This is NOT MP4, animation playback or a browser-painted fake frame.
use std::{fs, io::Write, path::{Path,PathBuf}};
use serde_json::json;
use crate::MotionBridge;

const MAX_FRAMES:u32=120;
const MAX_SIDE:u32=640;

#[derive(Debug,Clone)]
pub struct SequenceReceipt{
    pub directory:PathBuf,pub frame_count:u32,pub first_time:f64,pub fps:f64,
    pub total_png_bytes:u64,pub first_checksum:u64,pub last_checksum:u64,
    pub verified_from_disk:bool,pub project_revision:u64,
}
fn destination(root:&Path,basename:&str)->Result<PathBuf,String>{
    if basename.is_empty()||basename.len()>64
        ||!basename.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'||b==b'_'){
        return Err("sequence folder must be 1..64 ASCII letters/digits/_/- without path separators".into());
    }
    let root=root.canonicalize().map_err(|e|format!("owner workspace is not accessible: {e}"))?;
    if !root.is_dir(){return Err("workspace must be an existing directory".into())}
    Ok(root.join(basename))
}
impl MotionBridge{
    pub fn export_png_sequence(&self,workspace:&Path,basename:&str,comp:u64,
        start:f64,frames:u32,fps:f64,max_side:u32,transparent:bool)
        ->Result<SequenceReceipt,String>{
        if !start.is_finite()||start<0.0{return Err("start must be finite and >=0".into());}
        if frames==0||frames>MAX_FRAMES{return Err("frame count must be 1..120".into());}
        if max_side==0||max_side>MAX_SIDE{return Err("PNG image sequence max side must be 1..640".into());}
        let actual=self.inspect_composition(comp)?;
        if !fps.is_finite()||(fps-actual.fps).abs()>0.0001{
            return Err("sequence fps must equal exact native composition fps".into());
        }
        let last_time=start+(f64::from(frames-1)/fps);
        if !last_time.is_finite()||last_time>=actual.duration_seconds-0.0000001{
            return Err("requested native frames exceed the composition duration".into());
        }
        // The entire directory name is owner-selected and validated, and create_dir
        // is atomic/exclusive. No existing folder, file or symlink may be replaced.
        let directory=destination(workspace,basename)?;
        fs::create_dir(&directory).map_err(|e|format!("cannot create new sequence folder without overwriting: {e}"))?;
        let mut written:Vec<PathBuf>=Vec::new();
        let outcome=(||->Result<SequenceReceipt,String>{
            let mut first_checksum=0_u64;
            let mut last_checksum=0_u64;
            let mut bytes=0_u64;
            for i in 0..frames{
                let t=start+(f64::from(i)/fps);
                let frame=self.render_preview(comp,t,max_side,transparent)?;
                let png=frame.png()?;
                let path=directory.join(format!("frame_{i:04}.png"));
                let mut file=fs::OpenOptions::new().write(true).create_new(true)
                    .open(&path).map_err(|e|format!("cannot exclusively create native frame {i}: {e}"))?;
                written.push(path.clone());
                file.write_all(&png).map_err(|e|format!("native PNG write {i} failed: {e}"))?;
                file.sync_all().map_err(|e|format!("native PNG sync {i} failed: {e}"))?;
                let saved=fs::read(&path).map_err(|e|format!("native frame disk-read {i} failed: {e}"))?;
                if saved!=png{return Err(format!("native frame {i} differs from disk data")); }
                bytes=bytes.checked_add(saved.len() as u64).ok_or("sequence byte count overflow")?;
                if i==0{first_checksum=frame.checksum();}
                last_checksum=frame.checksum();
            }
            // Final manifest is written only after every real renderer frame and
            // readback succeeds. Incomplete sequences never receive an OK manifest.
            let manifest=directory.join("sequence.json");
            let record=json!({
                "ok":true,"source":"native-effectcraft","fps":fps,
                "firstTime":start,"frames":frames,"maxSide":max_side,
                "transparent":transparent,"projectRevision":actual.project_revision,
                "firstChecksum":first_checksum.to_string(),
                "lastChecksum":last_checksum.to_string(),"pngBytes":bytes,
            });
            let encoded=serde_json::to_vec_pretty(&record).map_err(|e|e.to_string())?;
            let mut manifest_file=fs::OpenOptions::new().create_new(true).write(true)
                .open(&manifest).map_err(|e|format!("cannot exclusively write sequence receipt: {e}"))?;
            written.push(manifest);
            manifest_file.write_all(&encoded).map_err(|e|e.to_string())?;
            manifest_file.sync_all().map_err(|e|e.to_string())?;
            let readback=fs::read(directory.join("sequence.json")).map_err(|e|e.to_string())?;
            if readback!=encoded{return Err("sequence JSON receipt disk mismatch".into());}
            Ok(SequenceReceipt{
                directory:directory.clone(),frame_count:frames,first_time:start,fps,
                total_png_bytes:bytes,first_checksum,last_checksum,
                verified_from_disk:true,project_revision:actual.project_revision,
            })
        })();
        if outcome.is_err(){
            // Remove ONLY files this operation itself created. If another process
            // placed files into the directory, leave them untouched.
            for path in written.iter().rev(){let _=fs::remove_file(path);}
            let _=fs::remove_dir(&directory);
        }
        outcome
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bad_directory_names_cannot_escape_owner_workspace(){
        let root=std::env::temp_dir();
        for bad in ["","../bad","nested/file","bad name","a\\b",".hidden","a.png"]{
            assert!(destination(&root,bad).is_err(),"{bad}");
        }
    }
}
