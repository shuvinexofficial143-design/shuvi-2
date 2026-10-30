//! A03 isolated native-owner task ledger. No Tauri command registration.
//! A real FilmCraft/EffectCraft adapter must hold the same exclusive owner lock
//! for user edits and AI edits before desktop execution is enabled.
use serde::{Deserialize,Serialize};
use sha2::{Digest,Sha256};
use std::{fs::{self,OpenOptions},io::Write,path::{Path,PathBuf}};

#[derive(Clone,Debug,Serialize,Deserialize,PartialEq,Eq)]
#[serde(rename_all="lowercase")]
pub enum Editor { Video, Motion }

#[derive(Clone,Debug,Serialize,Deserialize,PartialEq,Eq)]
#[serde(tag="kind",content="value",rename_all="camelCase")]
pub enum Version { VideoSha256(String), MotionRevision(u64) }
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq,Eq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Snapshot {
    pub editor:Editor,pub project_id:String,pub session_id:String,pub version:Version,
}
fn hex64(s:&str)->bool{s.len()==64 && s.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b))}
fn token(s:&str)->bool{s.len()>=8&&s.len()<=64&&s.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'||b==b'_')}
fn positive(n:u64)->bool{n>0}
fn finite(t:f64)->bool{t.is_finite()&&(0.0..=21600.0).contains(&t)}
fn name(s:&str)->bool{!s.is_empty()&&s.len()<=120&&s.trim()==s&&!s.chars().any(char::is_control)}
fn bounded_text(s:&str,max:usize)->bool {
    !s.is_empty()&&s.chars().count()<=max&&s.trim()==s&&!s.chars().any(char::is_control)
}
fn track(s:&str)->bool {
    s.len()>=2&&s.len()<=3&&(s.starts_with('V')||s.starts_with('A'))&&
    s[1..].bytes().all(|b|b.is_ascii_digit())&&
    !s[1..].starts_with('0')&&s[1..].parse::<u8>().is_ok_and(|n|(1..=16).contains(&n))
}
impl Snapshot {
    pub(crate) fn is_valid(&self)->bool {self.valid()}
    fn valid(&self)->bool {
        !self.project_id.is_empty()&&self.project_id.len()<=1024&&
        !self.session_id.is_empty()&&self.session_id.len()<=128&&
        !self.project_id.chars().any(char::is_control)&&
        !self.session_id.chars().any(char::is_control)&&
        match (&self.editor,&self.version) {
            (Editor::Video,Version::VideoSha256(sha))=>hex64(sha),
            (Editor::Motion,Version::MotionRevision(_))=>true,
            _=>false
        }
    }
}
#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(tag="type",rename_all="camelCase",rename_all_fields="camelCase",deny_unknown_fields)]
pub enum Action {
    VideoSplit {clip_id:u64,seconds:f64},
    VideoPlace {item_id:u64,track:String,seconds:f64,video:bool,audio:bool},
    VideoTrim {clip_id:u64,edge:String,ripple:bool,delta_frames:i64},
    VideoMove {clip_id:u64,track:String,seconds:f64,insert:bool},
    VideoDelete {clip_id:u64,ripple:bool},
    MotionCreateComposition {name:String,width:u32,height:u32,fps:f64,duration_seconds:f64},
    MotionAddText {comp_id:u64,name:String,text:String,x:f64,y:f64,size:f64},
    MotionEditText {comp_id:u64,layer_id:u64,text:String},
    MotionAddShape {comp_id:u64,name:String,kind:String,x:f64,y:f64,width:f64,height:f64,fill:String},
    MotionSetTransform {comp_id:u64,layer_id:u64,kind:String,x:Option<f64>,y:Option<f64>,value:Option<f64>},
    MotionAddEffect {comp_id:u64,layer_id:u64,effect:String},
    MotionSetMaskProperty {comp_id:u64,layer_id:u64,uid:u64,property:String,value:f64},
}
impl Action {
    pub(crate) fn is_valid(&self,editor:&Editor)->bool {self.valid(editor)}
    fn valid(&self,editor:&Editor)->bool {
        use Action::*;
        match self {
            VideoSplit{clip_id,seconds}=>*editor==Editor::Video&&positive(*clip_id)&&finite(*seconds),
            VideoPlace{item_id,track:tr,seconds,video,audio}=>*editor==Editor::Video&&positive(*item_id)&&track(tr)&&finite(*seconds)&&
                ((*video&&tr.starts_with('V'))||(*audio&&tr.starts_with('A'))),
            VideoTrim{clip_id,edge,delta_frames,..}=>*editor==Editor::Video&&positive(*clip_id)&&
                matches!(edge.as_str(),"in"|"out")&&*delta_frames!=0&&(-100000..=100000).contains(delta_frames),
            VideoMove{clip_id,track:tr,seconds,..}=>*editor==Editor::Video&&positive(*clip_id)&&track(tr)&&finite(*seconds),
            VideoDelete{clip_id,..}=>*editor==Editor::Video&&positive(*clip_id),
            MotionCreateComposition{name:n,width,height,fps,duration_seconds}=>*editor==Editor::Motion&&name(n)&&
                (1..=8192).contains(width)&&(1..=8192).contains(height)&&fps.is_finite()&&
                (1.0..=120.0).contains(fps)&&duration_seconds.is_finite()&&
                *duration_seconds>=1.0/fps&&*duration_seconds<=600.0,
            MotionAddText{comp_id,name:n,text,x,y,size}=>*editor==Editor::Motion&&positive(*comp_id)&&name(n)&&
                bounded_text(text,2000)&&finite_signed(*x)&&finite_signed(*y)&&
                size.is_finite()&&(1.0..=1000.0).contains(size),
            MotionEditText{comp_id,layer_id,text}=>*editor==Editor::Motion&&positive(*comp_id)&&positive(*layer_id)&&
                bounded_text(text,2000),
            MotionAddShape{comp_id,name:n,kind,x,y,width,height,fill}=>*editor==Editor::Motion&&positive(*comp_id)&&name(n)&&
                matches!(kind.as_str(),"rect"|"ellipse"|"rounded"|"star"|"polygon")&&
                finite_signed(*x)&&finite_signed(*y)&&shape_dimension(*width)&&shape_dimension(*height)&&
                fill.len()==7&&fill.starts_with('#')&&fill[1..].bytes().all(|c|c.is_ascii_hexdigit()),
            MotionSetTransform{comp_id,layer_id,kind,x,y,value}=>*editor==Editor::Motion&&positive(*comp_id)&&positive(*layer_id)&&
                match kind.as_str() {
                    "position"|"scale"=>value.is_none()&&x.is_some_and(finite_signed)&&y.is_some_and(finite_signed),
                    "rotation"=>x.is_none()&&y.is_none()&&value.is_some_and(finite_signed),
                    "opacity"=>x.is_none()&&y.is_none()&&value.is_some_and(|v|v.is_finite()&&(0.0..=100.0).contains(&v)),
                    _=>false,
                },
            MotionAddEffect{comp_id,layer_id,effect}=>*editor==Editor::Motion&&positive(*comp_id)&&positive(*layer_id)&&
                matches!(effect.as_str(),"gaussianBlur"|"brightnessContrast"),
            MotionSetMaskProperty{comp_id,layer_id,uid,property,value}=>*editor==Editor::Motion&&positive(*comp_id)&&
                positive(*layer_id)&&positive(*uid)&&matches!(property.as_str(),"feather"|"expansion"|"opacity")&&
                finite_signed(*value),
        }
    }
}
fn finite_signed(x:f64)->bool{x.is_finite()&&(-100000.0..=100000.0).contains(&x)}
fn shape_dimension(x:f64)->bool{x.is_finite()&&(1.0..=8192.0).contains(&x)&&x.fract()==0.0}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Scope {
    pub task_id:String,pub plan_hash:String,pub instruction:String,
    pub snapshot:Snapshot,pub actions:Vec<Action>,
}
impl Scope {
    fn valid(&self)->bool {
        token(&self.task_id)&&hex64(&self.plan_hash)&&bounded_text(&self.instruction,2000)&&self.snapshot.valid()&&
        (1..=12).contains(&self.actions.len())&&
        self.actions.iter().all(|a|a.valid(&self.snapshot.editor))
    }
}
#[derive(Clone,Debug,PartialEq,Eq)]
pub enum GuardError {
    Invalid,AlreadyExists,NotApproved,OutOfOrder,DuplicateOrUncertain,
    StaleProject,NativeOutcomeUncertain,Io,
}
impl std::fmt::Display for GuardError{
    fn fmt(&self,f:&mut std::fmt::Formatter<'_>)->std::fmt::Result{write!(f,"{self:?}")}
}
impl std::error::Error for GuardError {}
pub trait OwnerConsent {fn grant(&mut self,scope:&Scope)->bool;}
// Host must provide SAME exclusive native owner shared with manual editing.
// The mutable borrow covers native state inspection, command and readback.
pub trait NativeOwner {
    fn snapshot(&mut self)->Result<Snapshot,String>;
    // Read-only lookup of the actual native clip/layer/comp IDs, track,
    // edit capability and object state. Must NOT mutate or enqueue an edit.
    fn preflight_action(&mut self,action:&Action)->Result<bool,String>;
    fn apply(&mut self,action:&Action)->Result<(),String>;
    // SHA-256 of a canonical independently inspected affected native object.
    fn object_proof_sha256(&mut self,action:&Action)->Result<String,String>;
    // Inspect the actual affected clip/layer/comp after applying, not merely
    // a session revision. A false or missing native proof is UNCERTAIN.
    fn verify_action(&mut self,action:&Action)->Result<bool,String>;
}
#[derive(Clone,Debug,Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Receipt {
    pub task_id:String,pub index:usize,pub key:String,pub before:Snapshot,
    pub after:Snapshot,pub native_verified:bool,pub object_proof_sha256:String,
}
fn digest<T:Serialize>(value:&T)->Result<String,GuardError> {
    let data=serde_json::to_vec(value).map_err(|_|GuardError::Invalid)?;
    Ok(format!("{:x}",Sha256::digest(data)))
}
fn persist_new(path:&Path,bytes:&[u8])->Result<(),GuardError> {
    let mut f=OpenOptions::new().create_new(true).write(true).open(path)
        .map_err(|_|GuardError::Io)?;
    f.write_all(bytes).and_then(|_|f.sync_all()).map_err(|_|GuardError::Io)
}
fn load<T:for<'a> Deserialize<'a>>(path:&Path)->Result<T,GuardError>{
    let data=fs::read(path).map_err(|_|GuardError::Io)?;
    serde_json::from_slice(&data).map_err(|_|GuardError::Io)
}
fn progressed(before:&Snapshot,after:&Snapshot)->bool {
    if before.editor!=after.editor||before.project_id!=after.project_id||
       before.session_id!=after.session_id{return false;}
    match (&before.version,&after.version) {
        (Version::MotionRevision(a),Version::MotionRevision(b))=>b>a,
        (Version::VideoSha256(a),Version::VideoSha256(b))=>a!=b,
        _=>false,
    }
}
pub struct Ledger{root:PathBuf}
impl Ledger {
    /// The host, not the model, chooses a private existing journal directory.
    pub fn new(root:&Path)->Result<Self,GuardError>{
        if !root.is_dir()||root.symlink_metadata().map_err(|_|GuardError::Io)?.file_type().is_symlink(){
            return Err(GuardError::Invalid);
        }
        Ok(Self{root:root.canonicalize().map_err(|_|GuardError::Io)?})
    }
    fn dir(&self,id:&str)->Result<PathBuf,GuardError>{
        if !token(id){return Err(GuardError::Invalid);}
        Ok(self.root.join(id))
    }
    fn scope(&self,id:&str)->Result<Scope,GuardError>{
        let p:Scope=load(&self.dir(id)?.join("plan.json"))?;
        if !p.valid()||p.task_id!=id{return Err(GuardError::Invalid);}
        Ok(p)
    }
    pub fn reserve(&self,p:&Scope)->Result<(),GuardError>{
        if !p.valid(){return Err(GuardError::Invalid);}
        let dir=self.dir(&p.task_id)?;
        fs::create_dir(&dir).map_err(|e|{
            if e.kind()==std::io::ErrorKind::AlreadyExists{GuardError::AlreadyExists}
            else {GuardError::Io}
        })?;
        persist_new(&dir.join("plan.json"),
            &serde_json::to_vec(p).map_err(|_|GuardError::Invalid)?)
    }
    pub fn approve(&self,id:&str,owner:&mut dyn OwnerConsent)->Result<bool,GuardError>{
        let p=self.scope(id)?;
        let dir=self.dir(id)?;
        // Claim approval before showing consent. A denial, duplicate UI event
        // or crash can never silently request another approval for this task.
        let claim=dir.join("approval.claim");
        if claim.exists(){return Err(GuardError::AlreadyExists);}
        persist_new(&claim,digest(&p)?.as_bytes())?;
        if !owner.grant(&p){
            persist_new(&dir.join("approval.denied"),b"denied")?;
            return Ok(false);
        }
        let sha=digest(&p)?;
        persist_new(&dir.join("approved.sha256"),sha.as_bytes())?;
        Ok(true)
    }
    pub fn execute<O:NativeOwner>(&self,id:&str,index:usize,owner:&mut O)->Result<Receipt,GuardError>{
        let p=self.scope(id)?;
        let dir=self.dir(id)?;
        if index>=p.actions.len(){return Err(GuardError::OutOfOrder);}
        if fs::read_to_string(dir.join("approved.sha256")).ok()!=Some(digest(&p)?){
            return Err(GuardError::NotApproved);
        }
        for i in 0..index {
            if !dir.join(format!("step_{i:02}.verified")).exists(){return Err(GuardError::OutOfOrder);}
        }
        for i in index..p.actions.len() {
            if dir.join(format!("step_{i:02}.intent")).exists(){
                return Err(GuardError::DuplicateOrUncertain);
            }
        }
        let expected=if index==0{p.snapshot.clone()}else{
            let previous:Receipt=load(&dir.join(format!("step_{:02}.verified",index-1)))?;
            if previous.index!=index-1||previous.task_id!=id||!previous.native_verified {
                return Err(GuardError::DuplicateOrUncertain);
            }
            previous.after
        };
        let current=owner.snapshot().map_err(|_|GuardError::NativeOutcomeUncertain)?;
        if !current.valid(){return Err(GuardError::Invalid);}
        if current!=expected{return Err(GuardError::StaleProject);}
        // Native ID/track existence is NOT established by the model's inventory.
        // Owner must independently confirm it before writing an edit intent.
        if owner.preflight_action(&p.actions[index]).ok()!=Some(true){
            return Err(GuardError::Invalid);
        }
        // Preflight must be observational. Re-check owner revision to catch
        // accidental native changes before the irreversible intent is recorded.
        let checked=owner.snapshot().map_err(|_|GuardError::NativeOutcomeUncertain)?;
        if checked!=expected{return Err(GuardError::StaleProject);}
        let key=digest(&(digest(&p)?,index,&p.actions[index]))?;
        // A durable intent precedes the native call. On unknown outcome it
        // remains; reentry is rejected, never blind-replayed.
        persist_new(&dir.join(format!("step_{index:02}.intent")),key.as_bytes())?;
        owner.apply(&p.actions[index]).map_err(|_|GuardError::NativeOutcomeUncertain)?;
        let after=owner.snapshot().map_err(|_|GuardError::NativeOutcomeUncertain)?;
        if !after.valid()||!progressed(&expected,&after) {
            return Err(GuardError::NativeOutcomeUncertain);
        }
        if owner.verify_action(&p.actions[index]).ok()!=Some(true) {
            return Err(GuardError::NativeOutcomeUncertain);
        }
        let proof=owner.object_proof_sha256(&p.actions[index])
            .map_err(|_|GuardError::NativeOutcomeUncertain)?;
        if !hex64(&proof){return Err(GuardError::NativeOutcomeUncertain);}
        let receipt=Receipt{task_id:id.into(),index,key,before:expected,after,
            native_verified:true,object_proof_sha256:proof};
        persist_new(&dir.join(format!("step_{index:02}.verified")),
            &serde_json::to_vec(&receipt).map_err(|_|GuardError::Io)?)?;
        Ok(receipt)
    }
    pub fn execute_bound<O:NativeOwner>(&self,id:&str,index:usize,
        expected:&Snapshot,action:&Action,owner:&mut O)->Result<Receipt,GuardError>{
        let plan=self.scope(id)?;
        if plan.actions.get(index)!=Some(action){return Err(GuardError::Invalid);}
        let stored=if index==0{plan.snapshot.clone()}else{
            let prior:Receipt=load(&self.dir(id)?.join(format!("step_{:02}.verified",index-1)))?;
            if !prior.native_verified||prior.task_id!=id||prior.index!=index-1 {
                return Err(GuardError::DuplicateOrUncertain);
            }
            prior.after
        };
        if stored!=*expected{return Err(GuardError::StaleProject);}
        self.execute(id,index,owner)
    }
    pub fn recover(&self,id:&str)->Result<Vec<&'static str>,GuardError>{
        let p=self.scope(id)?;
        let dir=self.dir(id)?;
        Ok((0..p.actions.len()).map(|i|{
            let intent=dir.join(format!("step_{i:02}.intent")).exists();
            let verified=dir.join(format!("step_{i:02}.verified")).exists();
            match(intent,verified){
                (false,false)=>"not_started",
                (true,true)=>"verified",
                _=>"uncertain",
            }
        }).collect())
    }
}
