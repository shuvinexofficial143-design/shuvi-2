//! Actual EffectCraft compositor RGBA preview, optionally with alpha channel.
use effectcraft_engine::{project::ItemId,time::Tick};
use crate::MotionBridge;
use crate::layers::bounded;

#[derive(Debug,Clone)]
pub struct Frame{
    pub width:u32,pub height:u32,pub rgba:Vec<u8>,
    pub transparent:bool,pub project_revision:u64
}
impl Frame{
    pub fn visible_pixels(&self)->usize{
        self.rgba.chunks_exact(4).filter(|p|p[3]>0).count()
    }
    pub fn checksum(&self)->u64{
        self.rgba.iter().fold(0xcbf29ce484222325_u64,
            |h,b|(h^u64::from(*b)).wrapping_mul(0x100000001b3))
    }
    pub fn png(&self)->Result<Vec<u8>,String>{
        use image::ImageEncoder;
        let mut result=Vec::new();
        image::codecs::png::PngEncoder::new(&mut result)
            .write_image(&self.rgba,self.width,self.height,image::ExtendedColorType::Rgba8)
            .map_err(|e|format!("RGBA PNG encoding failed: {e}"))?;
        Ok(result)
    }
}
impl MotionBridge{
    /// Private native render; no external EffectCraft process or mock canvas.
    /// Keep previews <= 1024px for modest owner machines.
    pub fn render_preview(&self,comp:u64,time:f64,max_side:u32,transparent:bool)
        ->Result<Frame,String>{
        bounded(time,"frame time",600.0)?;
        let c=self.session.project.comp(ItemId(comp)).ok_or("composition missing")?;
        if time<0.0||time>=c.duration.seconds(){return Err("frame outside composition".into());}
        if max_side==0||max_side>1024{return Err("max_side must be 1..1024".into());}
        let (width,height,rgba)=self.session.render_rgba8_alpha(
            ItemId(comp),Tick::from_seconds_f64(time),max_side,transparent)
            .map_err(|e|format!("EffectCraft compositor render failed: {e}"))?;
        let expected=(width as usize).checked_mul(height as usize)
            .and_then(|n|n.checked_mul(4)).ok_or("frame dimensions overflow")?;
        if width==0||height==0||rgba.len()!=expected{
            return Err("native renderer returned invalid frame size".into());
        }
        Ok(Frame{width,height,rgba,transparent,project_revision:self.session.revision})
    }
}
