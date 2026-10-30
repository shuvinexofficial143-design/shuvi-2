//! V-AI21: ACTUAL original FilmcraftApp + pinned canonical A07 native host.
//!
//! These entry points are Rust-only and require a trusted caller holding the
//! actual original FilmcraftApp &mut reference. They are NOT engine commands,
//! IPC routes, provider tools or renderer-accessible JSON methods.
//! No AI sidebar controls are enabled. Every operation goes through the
//! original production UI exclusive A07 owner then native `VideoOwner` and
//! SQLite `GuardedHost`; there is never a second cloned editor Session.
use std::path::Path;
use filmcraft_ui_egui::FilmcraftApp;
use serde_json::Value;
use shuvi_ai_provider::{
    guard::{NativeOwner,Snapshot},
    host::{GuardedHost,OwnerConsentRequest,TaskBinding},
    ipc::GuardedWireRequest,
    plan::ReserveWire,
    transactional::TransactionalLedger,
};
use crate::{VideoOwner,native_consent::WindowsNativeOwnerConsent};

/// Authoritative durable A07 ledger owned by a trusted original Windows GUI
/// host. Open with a host-selected path only; never pass in model-defined
/// project paths or trust a provider's "approved" property.
pub struct NativeGuiA07Runtime {
    ledger: TransactionalLedger,
}

impl NativeGuiA07Runtime {
    pub fn open_native_private_ledger(path:&Path)->Result<Self,String> {
        let ledger=TransactionalLedger::open(path).map_err(|e|e.to_string())?;
        ledger.integrity_check().map_err(|e|e.to_string())?;
        Ok(Self{ledger})
    }

    /// Closed native callback: dynamically derive authoritative project and
    /// session identity INSIDE the production FilmcraftApp exclusive owner,
    /// then pass exactly that mutable in-memory Session to the canonical host.
    fn with_host<R>(
        &mut self,
        app:&mut FilmcraftApp,
        action:impl FnOnce(&mut GuardedHost<'_,VideoOwner<'_>>)->Result<R,String>,
    )->Result<R,String> {
        app.with_shuvi_trusted_a07_context(|session,project_id,session_id|{
            let mut native=VideoOwner::new(session,project_id,session_id)?;
            let mut host=GuardedHost{
                ledger:&mut self.ledger,
                owner:&mut native,
            };
            action(&mut host)
        })
    }

    /// Independent native snapshot - not approval or cached model state.
    pub fn snapshot(&mut self,app:&mut FilmcraftApp)->Result<Snapshot,String>{
        self.with_host(app,|host|{
            host.owner.snapshot()
        })
    }

    /// Canonical SHA-bound reservation with durable, private SQLite plan.
    /// A07 validates every action/identity; no native edit is applied.
    pub fn reserve(&mut self,app:&mut FilmcraftApp,plan:&ReserveWire)
        ->Result<Value,String>{
        self.with_host(app,|host|{
            host.reserve(plan).map_err(|e|e.to_string())
        })
    }

    /// Interactive Win32 YES/NO, bound to persisted scope, invoked only by
    /// the TRUSTED native desktop host. This is deliberately not test-mocked.
    /// It is NOT registered in the Filmcraft control channel or sidebar.
    pub fn request_native_owner_consent(
        &mut self,app:&mut FilmcraftApp,request:&OwnerConsentRequest
    )->Result<Value,String>{
        self.with_host(app,|host|{
            let mut consent=WindowsNativeOwnerConsent;
            host.request_consent(request,&mut consent).map_err(|e|e.to_string())
        })
    }

    /// Real guarded native action: durable intent before editing, independent
    /// object readback + SQLite receipt afterward. If edit changes but this
    /// returns Error, FilmcraftApp itself poisons all covered manual commands.
    pub fn execute_step(
        &mut self,app:&mut FilmcraftApp,request:GuardedWireRequest
    )->Result<Value,String>{
        self.with_host(app,|host|{
            host.execute(request).map_err(|e|e.to_string())
        })
    }

    pub fn cancel(
        &mut self,app:&mut FilmcraftApp,request:&TaskBinding
    )->Result<Value,String>{
        self.with_host(app,|host|{
            host.cancel(request).map_err(|e|e.to_string())
        })
    }

    /// Read A07's persisted receipts; no automatic retry of uncertain steps.
    pub fn recover(
        &mut self,app:&mut FilmcraftApp,request:&TaskBinding
    )->Result<Value,String>{
        self.with_host(app,|host|{
            host.recover(request).map_err(|e|e.to_string())
        })
    }

    pub fn task_history(&mut self,app:&mut FilmcraftApp)->Result<Value,String>{
        self.with_host(app,|host|{
            host.task_history().map_err(|e|e.to_string())
        })
    }

    /// Trusted host may inspect why model edits are still NOT integrated.
    /// This is canonical A07's intentionally conservative capability contract.
    /// Never infer readiness from a compiled adapter or test-only consent.
    pub fn capabilities(&self)->shuvi_ai_provider::host::Capabilities {
        shuvi_ai_provider::host::unintegrated_capabilities()
    }

    /// Runtime state is always unavailable for real model mutations until
    /// the integrated UI/WinCred/modal/task flow passes live Windows E2E.
    pub const fn model_editing_enabled()->bool{false}
}
