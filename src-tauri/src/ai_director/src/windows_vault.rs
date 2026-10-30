//! A04 Windows Credential Manager backed vault; never receives keys from JS.
//! The owner provisions a GENERIC Windows Credential under the fixed target
//! Shuvi2/OpenAI. This module reads it; it never logs, exports or echoes it.
use crate::{CredentialVault,ProviderError};
use zeroize::Zeroizing;
#[cfg(windows)]
use windows_sys::Win32::Security::Credentials::{
    CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC
};

pub struct WindowsCredentialVault;

impl CredentialVault for WindowsCredentialVault {
    fn openai_key(&self)->Result<Zeroizing<String>,ProviderError>{
        #[cfg(not(windows))]
        {Err(ProviderError{code:"WINDOWS_VAULT_REQUIRED"})}
        #[cfg(windows)]
        {
            const TARGET:&str="Shuvi2/OpenAI";
            let name:Vec<u16>=TARGET.encode_utf16().chain(std::iter::once(0)).collect();
            let mut credential:*mut CREDENTIALW=std::ptr::null_mut();
            // Strict fixed credential target: no model-generated secret lookup.
            let found=unsafe {CredReadW(name.as_ptr(),CRED_TYPE_GENERIC,0,&mut credential)};
            if found==0 || credential.is_null(){
                return Err(ProviderError{code:"CREDENTIAL_NOT_FOUND"});
            }
            struct Owned(*mut CREDENTIALW);
            impl Drop for Owned {fn drop(&mut self){unsafe{CredFree(self.0.cast());}}}
            let managed=Owned(credential);
            let secret=unsafe{
                let c=&*managed.0;
                let len=c.CredentialBlobSize as usize;
                if c.CredentialBlob.is_null()||len<12||len>512{
                    return Err(ProviderError{code:"CREDENTIAL_INVALID"});
                }
                let buf=std::slice::from_raw_parts(c.CredentialBlob,len);
                Zeroizing::new(buf.to_vec())
            };
            // Credential Manager's generic bytes must be stored as UTF-8.
            // Short-lived cloned bytes are overwritten by Zeroizing on drop.
            let value=String::from_utf8(secret.to_vec())
                .map_err(|_|ProviderError{code:"CREDENTIAL_INVALID"})?;
            if !value.is_ascii() || value.chars().any(char::is_whitespace){
                return Err(ProviderError{code:"CREDENTIAL_INVALID"});
            }
            Ok(Zeroizing::new(value))
        }
    }
}
#[cfg(test)]
mod tests{
    #[test]
    fn vault_target_is_fixed_and_never_supplied_by_a_model(){
        let whole_source=include_str!("windows_vault.rs");
        let source=whole_source.split("#[cfg(test)]").next().unwrap();
        assert!(source.contains("Shuvi2/OpenAI"));
        assert!(!source.contains("std::env::var"));
        assert!(!source.contains("println!"));
        assert!(!source.contains("CredWriteW"));
    }
}
