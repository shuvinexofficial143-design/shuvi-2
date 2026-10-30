//! A06: isolated SQLite WAL FULL synchronous authoritative task ledger.
//! Not registered in Tauri. Integrator must lock the SAME native editor owner
//! for both AI and manual editing across the entire admission/apply/readback.
//! The SQLite file/path is host-owned and MUST live in an OS-private directory.
use crate::guard::{Action,GuardError,NativeOwner,OwnerConsent,Receipt,Scope,Snapshot,Version};
use rusqlite::{params,Connection,OptionalExtension,TransactionBehavior};
use sha2::{Digest,Sha256};
use std::{fs,path::Path,time::Duration};

fn sql_error(_:rusqlite::Error)->GuardError{GuardError::Io}
fn digest<T:serde::Serialize>(data:&T)->Result<String,GuardError>{
    let bytes=serde_json::to_vec(data).map_err(|_|GuardError::Invalid)?;
    Ok(format!("{:x}",Sha256::digest(bytes)))
}
fn valid_sha(s:&str)->bool{
    s.len()==64 && s.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b))
}
fn id(s:&str)->bool{
    s.len()>=8&&s.len()<=64&&
    s.bytes().all(|x|x.is_ascii_alphanumeric()||x==b'-'||x==b'_')
}
fn changed(before:&Snapshot,after:&Snapshot)->bool {
    if before.editor!=after.editor||before.project_id!=after.project_id||
        before.session_id!=after.session_id{return false;}
    match (&before.version,&after.version){
        (Version::VideoSha256(a),Version::VideoSha256(b))=>a!=b,
        (Version::MotionRevision(a),Version::MotionRevision(b))=>b>a,
        _=>false
    }
}

/// A08: re-derive every persisted step key from the approved stored action,
/// then check a contiguous, fully linked verified receipt chain. A partial
/// native intent is *uncertain* and must be the last present step. This detects
/// accidental corruption/inconsistent journal state; it is NOT a MAC against
/// an attacker who can rewrite a user-writable database.
fn checked_steps(conn:&Connection,id:&str,scope:&Scope)
    ->Result<Vec<&'static str>,GuardError>{
    let mut states=vec!["not_started";scope.actions.len()];
    let mut cursor=conn.prepare(
        "SELECT step_index,state,step_key,receipt_json FROM ai_steps
         WHERE task_id=?1 ORDER BY step_index"
    ).map_err(sql_error)?;
    let rows=cursor.query_map(params![id],|r|Ok((
        r.get::<_,usize>(0)?,r.get::<_,String>(1)?,
        r.get::<_,String>(2)?,r.get::<_,Option<String>>(3)?
    ))).map_err(sql_error)?;
    let mut previous=scope.snapshot.clone();
    let mut next=0usize;
    let mut unresolved=false;
    for row in rows {
        let (index,status,key,receipt_json)=row.map_err(sql_error)?;
        if unresolved || index!=next || index>=scope.actions.len(){
            return Err(GuardError::DuplicateOrUncertain);
        }
        let expected_key=digest(&(scope.plan_hash.as_str(),index,&scope.actions[index]))?;
        if key!=expected_key || !valid_sha(&key){
            return Err(GuardError::DuplicateOrUncertain);
        }
        match status.as_str(){
            "intent"=>{
                if receipt_json.is_some(){return Err(GuardError::DuplicateOrUncertain);}
                states[index]="uncertain";
                unresolved=true;
            },
            "verified"=>{
                let data=receipt_json.ok_or(GuardError::DuplicateOrUncertain)?;
                let proof:Receipt=serde_json::from_str(&data)
                    .map_err(|_|GuardError::DuplicateOrUncertain)?;
                if proof.task_id!=id || proof.index!=index ||
                   proof.key!=expected_key || !proof.native_verified ||
                   proof.before!=previous || !changed(&proof.before,&proof.after) ||
                   !valid_sha(&proof.object_proof_sha256){
                    return Err(GuardError::DuplicateOrUncertain);
                }
                previous=proof.after;
                states[index]="verified";
            },
            _=>return Err(GuardError::DuplicateOrUncertain)
        }
        next+=1;
    }
    Ok(states)
}

#[derive(Debug,PartialEq,Eq,Clone,Copy)]
pub enum CancelOutcome { BeforeFirstEdit, BetweenVerifiedSteps }

pub struct TransactionalLedger { conn:Connection }
impl TransactionalLedger {
    /// Caller selects an absolute .sqlite3 path inside an existing private folder.
    /// Never forward a model/WebView-supplied path. Directory and file symlinks
    /// are rejected; owner is still responsible for private Windows ACLs.
    pub fn open(path:&Path)->Result<Self,GuardError>{
        if !path.is_absolute()||path.extension().and_then(|x|x.to_str())!=Some("sqlite3"){
            return Err(GuardError::Invalid);
        }
        let parent=path.parent().ok_or(GuardError::Invalid)?;
        let meta=fs::symlink_metadata(parent).map_err(|_|GuardError::Invalid)?;
        if !meta.is_dir()||meta.file_type().is_symlink(){return Err(GuardError::Invalid);}
        let canonical=parent.canonicalize().map_err(|_|GuardError::Invalid)?;
        if !canonical.is_dir(){return Err(GuardError::Invalid);}
        if let Ok(m)=fs::symlink_metadata(path){
            if m.file_type().is_symlink()||!m.is_file(){return Err(GuardError::Invalid);}
        }
        let full=canonical.join(path.file_name().ok_or(GuardError::Invalid)?);
        let conn=Connection::open(full).map_err(sql_error)?;
        conn.busy_timeout(Duration::from_secs(5)).map_err(sql_error)?;
        conn.execute_batch("PRAGMA journal_mode=WAL;
            PRAGMA synchronous=FULL;
            PRAGMA foreign_keys=ON;
            PRAGMA trusted_schema=OFF;").map_err(sql_error)?;
        conn.execute_batch("
            CREATE TABLE IF NOT EXISTS ai_tasks (
              task_id TEXT PRIMARY KEY NOT NULL,
              plan_hash TEXT NOT NULL,
              scope_json TEXT NOT NULL,
              approval TEXT NOT NULL DEFAULT 'pending'
                CHECK(approval IN ('pending','requested','approved','denied')),
              cancelled INTEGER NOT NULL DEFAULT 0 CHECK(cancelled IN (0,1))
            );
            CREATE TABLE IF NOT EXISTS ai_steps (
              task_id TEXT NOT NULL REFERENCES ai_tasks(task_id),
              step_index INTEGER NOT NULL CHECK(step_index>=0 AND step_index<12),
              state TEXT NOT NULL CHECK(state IN ('intent','verified')),
              step_key TEXT NOT NULL,
              receipt_json TEXT,
              PRIMARY KEY(task_id,step_index)
            );
        ").map_err(sql_error)?;
        Ok(Self{conn})
    }
    /// The caller MUST have independently checked the complete typed JS plan
    /// hash using A05 ReserveWire. Native owner binding is re-checked here.
    pub fn reserve(&mut self,scope:&Scope,owner:&mut dyn NativeOwner)
      ->Result<(),GuardError>{
        if !scope.is_valid(){return Err(GuardError::Invalid);}
        let current=owner.snapshot().map_err(|_|GuardError::NativeOutcomeUncertain)?;
        if current!=scope.snapshot{return Err(GuardError::StaleProject);}
        let bytes=serde_json::to_string(scope).map_err(|_|GuardError::Invalid)?;
        let tx=self.conn.transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql_error)?;
        // INSERT OR IGNORE means duplicate tasks are rejected without
        // overwriting prior approval/receipt state.
        let count=tx.execute("INSERT OR IGNORE INTO ai_tasks(task_id,plan_hash,scope_json)
                              VALUES (?1,?2,?3)",
                         params![scope.task_id,scope.plan_hash,bytes]).map_err(sql_error)?;
        if count!=1{return Err(GuardError::AlreadyExists);}
        tx.commit().map_err(sql_error)?;
        Ok(())
    }
    fn load(&self,task_id:&str)->Result<(Scope,String,bool),GuardError>{
        if !id(task_id){return Err(GuardError::Invalid);}
        let record:(String,String,i64,String)=self.conn.query_row(
            "SELECT scope_json,approval,cancelled,plan_hash FROM ai_tasks WHERE task_id=?1",
            params![task_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?)))
                .optional().map_err(sql_error)?.ok_or(GuardError::Invalid)?;
        let scope:Scope=serde_json::from_str(&record.0).map_err(|_|GuardError::Io)?;
        if !scope.is_valid()||scope.task_id!=task_id||scope.plan_hash!=record.3{
            return Err(GuardError::DuplicateOrUncertain);
        }
        Ok((scope,record.1,record.2!=0))
    }
    pub fn approve(&mut self,id:&str,consent:&mut dyn OwnerConsent)
      ->Result<bool,GuardError>{
        let (scope,approval,cancelled)=self.load(id)?;
        if cancelled{return Err(GuardError::DuplicateOrUncertain);}
        if approval!="pending"{return Err(GuardError::AlreadyExists);}
        // Commit a durable one-shot consent claim BEFORE any UI interaction.
        // A process crash, timeout or rejected click must never re-prompt.
        let tx=self.conn.transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql_error)?;
        let count=tx.execute(
            "UPDATE ai_tasks SET approval='requested'
             WHERE task_id=?1 AND approval='pending' AND cancelled=0",
            params![id]).map_err(sql_error)?;
        if count!=1{return Err(GuardError::AlreadyExists);}
        tx.commit().map_err(sql_error)?;
        let accepted=consent.grant(&scope);
        let tx=self.conn.transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql_error)?;
        let count=tx.execute(
            "UPDATE ai_tasks SET approval=?2
             WHERE task_id=?1 AND approval='requested' AND cancelled=0",
            params![id,if accepted {"approved"}else{"denied"}]).map_err(sql_error)?;
        // Cancellation in another connection during a UI prompt is final.
        if count!=1{return Err(GuardError::DuplicateOrUncertain);}
        tx.commit().map_err(sql_error)?;
        Ok(accepted)
    }
    /// Used by the native owner consent UI before displaying the stored plan.
    /// Rejects a WebView-supplied hash without opening a second approval prompt.
    pub fn verify_binding(&self,task_id:&str,plan_hash:&str)
      ->Result<(),GuardError>{
        self.approved_plan_snapshot(task_id,plan_hash).map(|_|())
    }
    /// Read only the original immutable project/session/version from SQLite.
    /// This is NOT owner authorization; actual owner state must match it.
    pub fn approved_plan_snapshot(&self,task_id:&str,plan_hash:&str)
      ->Result<Snapshot,GuardError>{
        if !valid_sha(plan_hash){return Err(GuardError::Invalid);}
        let (scope,_,_)=self.load(task_id)?;
        if scope.plan_hash!=plan_hash{return Err(GuardError::Invalid);}
        Ok(scope.snapshot)
    }
    /// The actual Tauri Stop/Recovery IPC must bind both the task ID and
    /// native persisted plan digest; never trust a bare frontend task ID.
    pub fn cancel_bound(&mut self,id:&str,plan_hash:&str)
        ->Result<CancelOutcome,GuardError>{
        if !valid_sha(plan_hash){return Err(GuardError::Invalid);}
        let (scope,_,_)=self.load(id)?;
        if scope.plan_hash!=plan_hash{return Err(GuardError::Invalid);}
        self.cancel(id)
    }
    pub fn recovery_bound(&self,id:&str,plan_hash:&str)
        ->Result<Vec<&'static str>,GuardError>{
        if !valid_sha(plan_hash){return Err(GuardError::Invalid);}
        let (scope,_,_)=self.load(id)?;
        if scope.plan_hash!=plan_hash{return Err(GuardError::Invalid);}
        self.recovery(id)
    }
    /// Atomic boundary with intent admission, suitable for Stop requests.
    /// If any native intent is outstanding, cancellation refuses because an
    /// external engine action may already be mutating the project.
    pub fn cancel(&mut self,id:&str)->Result<CancelOutcome,GuardError>{
        let (scope,_,_)=self.load(id)?;
        let tx=self.conn.transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql_error)?;
        let states=checked_steps(&tx,id,&scope)?;
        let verified=states.iter().take_while(|v|**v=="verified").count();
        if states.iter().any(|v|*v=="uncertain") || verified==scope.actions.len(){
            return Err(GuardError::DuplicateOrUncertain);
        }
        let updated=tx.execute(
            "UPDATE ai_tasks SET cancelled=1 WHERE task_id=?1 AND cancelled=0",
            params![id]).map_err(sql_error)?;
        if updated!=1{return Err(GuardError::AlreadyExists);}
        tx.commit().map_err(sql_error)?;
        Ok(if verified==0 {CancelOutcome::BeforeFirstEdit}
           else {CancelOutcome::BetweenVerifiedSteps})
    }
    /// Each native step is independently admitted in one SQLite IMMEDIATE
    /// transaction before native mutation. The host MUST serialize all manual
    /// and AI edits under the same actual owner lock.
    pub fn execute_bound<O:NativeOwner>(
        &mut self,id:&str,index:usize,expected:&Snapshot,action:&Action,owner:&mut O
    )->Result<Receipt,GuardError>{
        let (scope,approval,cancelled)=self.load(id)?;
        if cancelled{return Err(GuardError::DuplicateOrUncertain);}
        if approval!="approved"{return Err(GuardError::NotApproved);}
        if index>=scope.actions.len(){return Err(GuardError::OutOfOrder);}
        if scope.actions.get(index)!=Some(action){return Err(GuardError::Invalid);}
        let tx=self.conn.transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql_error)?;
        // Cancellation and admission MUST be compared inside the same IMMEDIATE
        // transaction. A read before the transaction is not sufficient.
        let gates:(String,i64)=tx.query_row(
            "SELECT approval,cancelled FROM ai_tasks WHERE task_id=?1",
            params![id],|r|Ok((r.get(0)?,r.get(1)?))).map_err(sql_error)?;
        if gates.1!=0{return Err(GuardError::DuplicateOrUncertain);}
        if gates.0!="approved"{return Err(GuardError::NotApproved);}
        let history=checked_steps(&tx,id,&scope)?;
        if history.iter().any(|v|*v=="uncertain"){
            return Err(GuardError::DuplicateOrUncertain);
        }
        let verified=history.iter().take_while(|v|**v=="verified").count();
        if index!=verified{return Err(GuardError::OutOfOrder);}
        let last=if index==0{scope.snapshot.clone()}else{
            let data:String=tx.query_row(
                "SELECT receipt_json FROM ai_steps
                 WHERE task_id=?1 AND step_index=?2 AND state='verified'",
                params![id,index-1],|r|r.get(0)).map_err(sql_error)?;
            let receipt:Receipt=serde_json::from_str(&data)
                .map_err(|_|GuardError::DuplicateOrUncertain)?;
            receipt.after
        };
        if *expected!=last{return Err(GuardError::StaleProject);}
        // Native owner is locked by integration from this point until receipt.
        let before=owner.snapshot().map_err(|_|GuardError::NativeOutcomeUncertain)?;
        if before!=last{return Err(GuardError::StaleProject);}
        if owner.preflight_action(action).ok()!=Some(true){return Err(GuardError::Invalid);}
        if owner.snapshot().map_err(|_|GuardError::NativeOutcomeUncertain)?!=before{
            return Err(GuardError::StaleProject);
        }
        let key=digest(&(scope.plan_hash.as_str(),index,action))?;
        tx.execute(
            "INSERT INTO ai_steps(task_id,step_index,state,step_key)
             VALUES (?1,?2,'intent',?3)",params![id,index,key]).map_err(sql_error)?;
        tx.commit().map_err(sql_error)?;
        // Any failure below is UNCERTAIN and cannot be replayed automatically.
        owner.apply(action).map_err(|_|GuardError::NativeOutcomeUncertain)?;
        let after=owner.snapshot().map_err(|_|GuardError::NativeOutcomeUncertain)?;
        if !changed(&before,&after){return Err(GuardError::NativeOutcomeUncertain);}
        if owner.verify_action(action).ok()!=Some(true){
            return Err(GuardError::NativeOutcomeUncertain);
        }
        let proof=owner.object_proof_sha256(action)
            .map_err(|_|GuardError::NativeOutcomeUncertain)?;
        if !valid_sha(&proof){return Err(GuardError::NativeOutcomeUncertain);}
        let receipt=Receipt{task_id:id.to_owned(),index,key,before,after,
            native_verified:true,object_proof_sha256:proof};
        let payload=serde_json::to_string(&receipt).map_err(|_|GuardError::Io)?;
        let tx=self.conn.transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(sql_error)?;
        let changed=tx.execute(
            "UPDATE ai_steps SET state='verified',receipt_json=?3
             WHERE task_id=?1 AND step_index=?2 AND state='intent'",
            params![id,index,payload]).map_err(sql_error)?;
        if changed!=1{return Err(GuardError::DuplicateOrUncertain);}
        tx.commit().map_err(sql_error)?;
        Ok(receipt)
    }
    pub fn recovery(&self,id:&str)->Result<Vec<&'static str>,GuardError>{
        let (scope,_,cancelled)=self.load(id)?;
        let mut result=checked_steps(&self.conn,id,&scope)?;
        if cancelled {
            for state in &mut result{
                if *state=="not_started"{*state="cancelled";}
            }
        }
        Ok(result)
    }
    pub fn integrity_check(&self)->Result<(),GuardError>{
        let response:String=self.conn.query_row("PRAGMA quick_check",
            [],|row|row.get(0)).map_err(sql_error)?;
        if response=="ok"{Ok(())}else{Err(GuardError::Io)}
    }
}
