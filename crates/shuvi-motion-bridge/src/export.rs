//! M08 actual EffectCraft PNG frame export to an owner-selected workspace.
//! No overwrite, no arbitrary path expression and disk readback validation.
use std::{fs,io::Write,path::{Path,PathBuf}};
use crate::MotionBridge;

#[derive(Debug,Clone)]
pub struct PngExportReceipt {
    pub path:PathBuf,pub width:u32,pub height:u32,pub bytes:u64,
    pub transparent:bool,pub verified_from_disk:bool,
}
fn destination(root:&Path,name:&str)->Result<PathBuf,String>{
    let stem=name.strip_suffix(".png").ok_or("filename must end in .png")?;
    if stem.is_empty()||stem.len()>80||
        !stem.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'||b==b'_'){
        return Err("PNG basename allows only 1..80 ASCII alphanumerics, _ and -".into());
    }
    let dir=root.canonicalize().map_err(|e|format!("workspace is not accessible: {e}"))?;
    if !dir.is_dir(){return Err("workspace is not a directory".into());}
    Ok(dir.join(name))
}
impl MotionBridge {
    /// Render in the actual engine, PNG encode, create the new file exclusively,
    /// and read it back to ensure the owner gets the same RGBA values.
    pub fn export_png_frame(&self,workspace:&Path,name:&str,comp:u64,
        time:f64,max_side:u32,transparent:bool)->Result<PngExportReceipt,String>{
        let path=destination(workspace,name)?;
        let frame=self.render_preview(comp,time,max_side,transparent)?;
        let png=frame.png()?;
        // No clobber even if another process created the destination meanwhile.
        let mut file=fs::OpenOptions::new().create_new(true).write(true)
            .open(&path).map_err(|e|format!("cannot create new PNG without overwriting: {e}"))?;
        let write_result=(||->Result<(),String>{
            file.write_all(&png).map_err(|e|e.to_string())?;
            file.sync_all().map_err(|e|e.to_string())?;
            let disk=fs::read(&path).map_err(|e|e.to_string())?;
            if disk!=png{return Err("PNG disk bytes differ from native rendering".into());}
            let decoded=image::load_from_memory(&disk).map_err(|e|e.to_string())?.to_rgba8();
            if decoded.dimensions()!=(frame.width,frame.height)||decoded.into_raw()!=frame.rgba{
                return Err("saved PNG pixels differ from native EffectCraft frame".into());
            }
            Ok(())
        })();
        if let Err(e)=write_result{
            drop(file);
            let _=fs::remove_file(&path);
            return Err(e);
        }
        Ok(PngExportReceipt{path,width:frame.width,height:frame.height,
            bytes:png.len() as u64,transparent,verified_from_disk:true})
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refuses_unsafe_png_paths(){
        let root=std::env::temp_dir();
        for name in ["../bad.png","nested/bad.png","bad\\name.png",".png","bad.gif","bad name.png"]{
            assert!(destination(&root,name).is_err(),"{name}");
        }
    }
}
