//! A07: isolated trusted native command-service boundary for AI Director.
//! This is REAL Rust business logic, not registered into shared Tauri lib.rs.
//! The reviewed Integration 2.0.5 host must use ONE owner lock for manual and
//! AI actions, provide an actual owner-operated UI, and register these exact
//! fixed command names before desktop AI edits can be enabled.
use crate::guard::{GuardError,NativeOwner,OwnerConsent};
use crate::ipc::{GuardedWireRequest,GuardedStep};
use crate::plan::ReserveWire;
use crate::transactional::{CancelOutcome,TransactionalLedger};
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};

fn valid_hash(s:&str)->bool{
    s.len()==64 && s.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b))
}
fn valid_task(s:&str)->bool{
    (8..=64).contains(&s.len())&&s.bytes()
        .all(|b|b.is_ascii_alphanumeric()||b==b'-'||b==b'_')
}
#[derive(Debug,Clone,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct TaskBinding{pub task_id:String,pub plan_hash:String}
impl TaskBinding{
    pub fn checked(&self)->Result<(),GuardError>{
        if !valid_task(&self.task_id)||!valid_hash(&self.plan_hash){
            return Err(GuardError::Invalid);
        }
        Ok(())
    }
}
/// This request deliberately does NOT contain a project, actions, an approval
/// boolean or a model. The native OwnerConsent implementation must read and
/// show the PERSISTED Scope, not trust user-tampered WebView preview fields.
#[derive(Debug,Clone,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct OwnerConsentRequest{pub task_id:String,pub plan_hash:String}
#[derive(Debug,Serialize)]
#[serde(rename_all="camelCase")]
pub struct Capabilities{
    pub version:u8,pub native_guarded:bool,pub same_owner_as_manual:bool,
    pub owner_consent:bool,pub durable_idempotency:bool,
    pub independent_object_readback:bool
}
/// Positive readiness can only be given by a reviewed implementation in the
/// integrated native app which proves EVERY required gate. The isolated AI
/// crate offers only a safe NOT READY response by default.
pub fn unintegrated_capabilities()->Capabilities{
    Capabilities{version:1,native_guarded:false,same_owner_as_manual:false,
      owner_consent:false,durable_idempotency:false,
      independent_object_readback:false}
}
/// This borrows the SAME exclusive editor owner used by manual commands. The
/// integrating Tauri host must serialize all desktop manual edits, tab/project
/// switching and AI edit requests across the entire synchronous call.
/// Merely holding a lock on this temporary adapter is NOT sufficient if a
/// second Manual UI command can bypass it.
pub struct GuardedHost<'a,O:NativeOwner>{
    pub ledger:&'a mut TransactionalLedger,
    pub owner:&'a mut O,
}
impl<'a,O:NativeOwner> GuardedHost<'a,O>{
    pub fn reserve(&mut self,request:&ReserveWire)->Result<Value,GuardError>{
        let hash=request.reserve_transactional(self.ledger,self.owner)?;
        Ok(json!({"reserved":true,"taskId":request.task_id,
            "planHash":hash,"durable":true,"nativeOwnerBound":true}))
    }
    pub fn request_consent(&mut self,request:&OwnerConsentRequest,
        trusted_owner_ui:&mut dyn OwnerConsent)->Result<Value,GuardError>{
        let bound=TaskBinding{task_id:request.task_id.clone(),plan_hash:request.plan_hash.clone()};
        bound.checked()?;
        // The persisted hash must be verified *before* opening an approval UI;
        // no prompt, key, or approval can be forged by renderer JSON.
        self.ledger.verify_binding(&bound.task_id,&bound.plan_hash)?;
        let granted=self.ledger.approve(&bound.task_id,trusted_owner_ui)?;
        Ok(json!({"granted":granted,"taskId":bound.task_id,
          "planHash":bound.plan_hash,"nativeOwnerInteraction":true}))
    }
    pub fn execute(&mut self,request:GuardedWireRequest)->Result<Value,GuardError>{
        let step=GuardedStep::parse(request)?;
        step.execute_transactional(self.ledger,self.owner)
    }
    pub fn cancel(&mut self,request:&TaskBinding)->Result<Value,GuardError>{
        request.checked()?;
        self.ledger.verify_binding(&request.task_id,&request.plan_hash)?;
        let result=self.ledger.cancel_bound(&request.task_id,&request.plan_hash);
        let (cancelled,state)=match result{
            Ok(CancelOutcome::BeforeFirstEdit)=>(true,"before_first_edit"),
            Ok(CancelOutcome::BetweenVerifiedSteps)=>(true,"between_verified_steps"),
            Err(GuardError::DuplicateOrUncertain)|Err(GuardError::AlreadyExists)=>{
                let states=self.ledger.recovery_bound(&request.task_id,&request.plan_hash)?;
                if states.iter().any(|x|*x=="uncertain"){
                    (false,"intent_uncertain")
                }else if states.iter().any(|x|*x=="cancelled"){
                    (false,"already_cancelled")
                }else if states.iter().all(|x|*x=="verified"){
                    (false,"already_complete")
                }else{
                    // No durable confirmation: fail closed, not fake Stop.
                    return Err(GuardError::DuplicateOrUncertain);
                }
            },
            Err(err)=>return Err(err),
        };
        Ok(json!({"taskId":request.task_id,"planHash":request.plan_hash,
          "cancelled":cancelled,"state":state,
          "durable":true,"nativeOwnerBound":true}))
    }
    pub fn recover(&mut self,request:&TaskBinding)->Result<Value,GuardError>{
        request.checked()?;
        self.ledger.verify_binding(&request.task_id,&request.plan_hash)?;
        let steps=self.ledger.recovery_bound(&request.task_id,&request.plan_hash)?;
        Ok(json!({"taskId":request.task_id,"planHash":request.plan_hash,
            "steps":steps,"durable":true,"nativeOwnerBound":true}))
    }
}
