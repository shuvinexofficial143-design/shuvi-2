//! A02 isolated real HTTPS OpenAI adapter. Not yet registered in Tauri.
//! Credential retrieval belongs to the trusted Windows host vault, never JS.
//! No arbitrary model-selected endpoints, shell commands or editor IPC.
pub mod guard;
pub mod windows_vault;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashSet, io::Read, time::Duration};
use zeroize::Zeroizing;

const URL: &str = "https://api.openai.com/v1/chat/completions";
const MODEL: &str = "gpt-4o-mini";
const LIMIT: u64 = 32 * 1024;
const VIDEO: &[&str] = &["video.place","video.split","video.trim","video.move","video.delete"];
const MOTION: &[&str] = &["motion.createComposition","motion.addText","motion.editText",
    "motion.addShape","motion.setTransform","motion.addEffect","motion.setMaskProperty"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProviderError { pub code: &'static str }
impl std::fmt::Display for ProviderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "AI_PROVIDER_{}", self.code)
    }
}
impl std::error::Error for ProviderError {}
fn error(code: &'static str) -> ProviderError { ProviderError { code } }

/// Owner-controlled OS credential store. Integration must implement this using
/// a protected Windows credential/keyring backend; NEVER from a WebView payload.
pub trait CredentialVault {
    fn openai_key(&self) -> Result<Zeroizing<String>, ProviderError>;
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all="camelCase", deny_unknown_fields)]
pub struct NativeModelRequest {
    pub model: String,
    pub instruction: String,
    pub engine: String,
    pub inventory: Value,
    pub allowed_actions: Vec<String>,
}
fn allowed(engine: &str) -> Result<&'static [&'static str], ProviderError> {
    match engine { "video" => Ok(VIDEO), "motion" => Ok(MOTION),
        _ => Err(error("ENGINE_UNSUPPORTED")) }
}
fn inspect_inventory(input: &NativeModelRequest) -> Result<(), ProviderError> {
    let collection_names: &[&str] = match input.engine.as_str() {
        "video" => &["clipIds","mediaIds"],
        "motion" => &["compIds","layerIds","maskIds","effectIds"],
        _ => return Err(error("ENGINE_UNSUPPORTED"))
    };
    let map = input.inventory.as_object().ok_or_else(||error("CONTEXT_INVALID"))?;
    if map.len()!=collection_names.len() ||
       map.keys().any(|key| !collection_names.contains(&key.as_str())) {
        return Err(error("CONTEXT_INVALID"));
    }
    for name in collection_names {
        let ids = map.get(*name).and_then(Value::as_array)
            .ok_or_else(||error("CONTEXT_INVALID"))?;
        if ids.len()>128 { return Err(error("CONTEXT_INVALID")); }
        let mut seen=HashSet::new();
        for value in ids {
            let id = value.as_u64().ok_or_else(||error("CONTEXT_INVALID"))?;
            if id==0 || id>9_007_199_254_740_991 || !seen.insert(id) {
                return Err(error("CONTEXT_INVALID"));
            }
        }
    }
    Ok(())
}
pub fn build_request(input: &NativeModelRequest) -> Result<Value, ProviderError> {
    if input.model!=MODEL || input.instruction.trim().is_empty() ||
       input.instruction.len()>2000 ||
       input.instruction.chars().any(|c| c.is_control() && c!='\n') {
        return Err(error("REQUEST_INVALID"));
    }
    let actions=allowed(&input.engine)?;
    if input.allowed_actions.len()!=actions.len() ||
       input.allowed_actions.iter().map(String::as_str).collect::<Vec<_>>().as_slice()!=actions {
        return Err(error("ALLOWLIST_MISMATCH"));
    }
    inspect_inventory(input)?;
    // Only verified numeric IDs are sent. Absolutely no paths/media/credentials.
    // Model output remains UNTRUSTED until strict JavaScript action validation.
    let system = format!(
        "You are Shuvi's creative edit PLAN generator, not an editing executor. \
         Respond with ONE JSON object with exactly reason (string) and actions (array). \
         Choose only these action types: {}. Each action must match its typed editor \
         schema, contain every required field, and use only IDs present in the \
         trusted inventory. Never invent IDs for items created by previous steps. \
         Maximum 12 steps. Never propose shell, filesystem, IPC, keys, paths, \
         network access or unapproved commands. If user intent is unsupported, \
         give actions [] (caller will safely reject it). \
         Editing happens only after owner approval and native revision checks.",
         actions.join(", ")
    );
    Ok(json!({
        "model": MODEL,
        "messages": [
            {"role":"system","content":system},
            {"role":"user","content":format!("ENGINE: {}\nNATIVE IDS: {}\nUSER INSTRUCTION: {}",
                input.engine,input.inventory,input.instruction)}
        ],
        "response_format":{"type":"json_object"},
        "max_tokens":1200
    }))
}
pub struct OpenAiProvider { client: Client }
impl OpenAiProvider {
    pub fn new() -> Result<Self, ProviderError> {
        let client=Client::builder()
            .timeout(Duration::from_secs(45))
            .redirect(reqwest::redirect::Policy::none())
            .build().map_err(|_|error("CLIENT_UNAVAILABLE"))?;
        Ok(Self{client})
    }
    /// Performs actual HTTPS, never a simulated reply. No automatic retries.
    /// The key remains in native memory and is zeroized on drop.
    pub fn propose(&self, request: &NativeModelRequest, vault: &dyn CredentialVault)
        -> Result<String, ProviderError> {
        let payload=build_request(request)?;
        let key=vault.openai_key()?;
        if key.len()<12 || key.len()>512 || !key.is_ascii() ||
           key.chars().any(char::is_whitespace) {
            return Err(error("CREDENTIAL_INVALID"));
        }
        let response=self.client.post(URL).bearer_auth(key.as_str()).json(&payload).send()
            .map_err(|_|error("NETWORK_OR_TIMEOUT"))?;
        if !response.status().is_success() {
            return Err(match response.status().as_u16() {
                401 | 403 => error("AUTH_REQUIRED"),
                429 => error("RATE_LIMITED"),
                _ => error("HTTP_FAILURE")
            });
        }
        let mut bytes=Vec::new();
        response.take(LIMIT+1).read_to_end(&mut bytes)
            .map_err(|_|error("RESPONSE_READ_FAILED"))?;
        if bytes.len() as u64 > LIMIT { return Err(error("RESPONSE_TOO_LARGE")); }
        let reply: Value=serde_json::from_slice(&bytes)
            .map_err(|_|error("RESPONSE_INVALID"))?;
        if reply.pointer("/choices/0/finish_reason").and_then(Value::as_str) != Some("stop") {
            return Err(error("RESPONSE_INCOMPLETE"));
        }
        let content=reply.pointer("/choices/0/message/content").and_then(Value::as_str)
            .ok_or_else(||error("RESPONSE_INVALID"))?;
        if content.len()>24000 { return Err(error("RESPONSE_TOO_LARGE")); }
        let parsed: Value=serde_json::from_str(content)
            .map_err(|_|error("RESPONSE_INVALID"))?;
        if !parsed.is_object() { return Err(error("RESPONSE_INVALID")); }
        Ok(content.to_owned()) // Still NOT approved or safe to execute.
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn req() -> NativeModelRequest {
        NativeModelRequest{model:MODEL.into(),instruction:"एक rectangle बनाओ".into(),
            engine:"motion".into(),
            inventory:json!({"compIds":[8],"layerIds":[13],"maskIds":[],"effectIds":[]}),
            allowed_actions:MOTION.iter().map(|v|v.to_string()).collect()}
    }
    #[test]
    fn real_provider_request_has_fixed_endpoint_contract_and_no_secret() {
        let body=build_request(&req()).unwrap().to_string();
        assert!(body.contains("gpt-4o-mini"));
        assert!(body.contains("rectangle"));
        assert!(!body.contains("Authorization"));
        assert!(!body.contains("apiKey"));
        assert_eq!(body.matches("role").count(),2);
    }
    #[test]
    fn unknown_model_and_extra_inventory_are_rejected_before_network() {
        let mut r=req();r.model="my-custom-endpoint".into();
        assert_eq!(build_request(&r).unwrap_err().code,"REQUEST_INVALID");
        let mut r=req();r.inventory["projectPath"]=json!("C:\\secret");
        assert_eq!(build_request(&r).unwrap_err().code,"CONTEXT_INVALID");
    }
    #[test]
    fn native_inventory_prevents_duplicates_and_zero_ids() {
        let mut r=req();r.inventory["compIds"]=json!([8,8]);
        assert_eq!(build_request(&r).unwrap_err().code,"CONTEXT_INVALID");
        let mut r=req();r.inventory["compIds"]=json!([0]);
        assert_eq!(build_request(&r).unwrap_err().code,"CONTEXT_INVALID");
    }
    #[test]
    fn no_model_supplied_unapproved_actions_or_editor_switch() {
        let mut r=req();r.allowed_actions.push("shell".into());
        assert_eq!(build_request(&r).unwrap_err().code,"ALLOWLIST_MISMATCH");
        let mut r=req();r.engine="video".into();
        assert_eq!(build_request(&r).unwrap_err().code,"ALLOWLIST_MISMATCH");
    }
}
