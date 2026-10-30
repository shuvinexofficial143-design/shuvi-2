//! Real OpenAI model-assisted *proposal*, never autonomous project editing.
//! No file path, source media, frame, or API credential is sent to the model.
//! A fixed HTTPS endpoint and Rust request limits prevent arbitrary network tools.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{env, io::Read, time::Duration};

const URL: &str = "https://api.openai.com/v1/chat/completions";
const MODEL: &str = "gpt-4o-mini";
const MAX_CLIPS: usize = 64;
const MAX_RESPONSE_BYTES: u64 = 32 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelClip {
    clip_id: u64,
    start: f64,
    duration: f64,
    kind: String,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelContext {
    project_sha256: String,
    clips: Vec<ModelClip>,
    media_ids: Vec<u64>,
    selected_clip_id: Option<u64>,
    selected_media_id: Option<u64>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelRequest {
    prompt: String,
    api_key: Option<String>,
    context: ModelContext,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProposal {
    command: String,
    reason: String,
    project_sha256: String,
    model: &'static str,
}
fn valid_context(c: &ModelContext) -> bool {
    c.project_sha256.len()==64 &&
    c.project_sha256.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) &&
    c.clips.len()<=MAX_CLIPS && c.media_ids.len()<=MAX_CLIPS &&
    c.media_ids.iter().all(|i| *i>0) &&
    c.clips.iter().all(|c| c.clip_id>0 &&
        c.start.is_finite() && c.duration.is_finite() &&
        (0.0..=86400.0).contains(&c.start) && (0.0..=86400.0).contains(&c.duration) &&
        matches!(c.kind.as_str(),"video"|"audio")) &&
    c.selected_clip_id.is_none_or(|id|c.clips.iter().any(|v|v.clip_id==id)) &&
    c.selected_media_id.is_none_or(|id|c.media_ids.contains(&id))
}
fn request_json(request:&ModelRequest)->Result<Value,String>{
    if request.prompt.trim().is_empty() || request.prompt.len()>700 ||
        request.prompt.chars().any(|c|c=='\0') {
        return Err("AI instruction must contain 1–700 characters".into());
    }
    if !valid_context(&request.context) {
        return Err("AI request contains invalid project state, clip IDs or SHA".into());
    }
    // The model receives ONLY numeric timeline metadata and the user's text,
    // never absolute paths, filenames, project bytes, or source media content.
    let scope=json!({
        "selectedClipId":request.context.selected_clip_id,
        "selectedMediaId":request.context.selected_media_id,
        "clips":request.context.clips.iter().map(|c|
            json!({"clipId":c.clip_id,"start":c.start,"duration":c.duration,"kind":c.kind}))
            .collect::<Vec<_>>(),
        "mediaIds":request.context.media_ids
    });
    let system=concat!(
       "You are a planner for Shuvi FilmCraft video editing, not an executor. ",
       "Respond with a JSON object containing command and reason only. ",
       "Produce EXACTLY ONE supported command, or use command='unsupported'. ",
       "Allowed commands: split selected at <seconds>; split #<clipId> at <seconds>; ",
       "move selected to V1 at <seconds>; move #<clipId> to V2 at <seconds>; ",
       "trim selected in -3 frames; trim selected out -3 frames; ",
       "delete selected; delete #<clipId>; ",
       "place selected on V1 at 0; place #<mediaId> on A1 at 0; undo; redo. ",
       "Use only IDs supplied in the context, respect clip time boundaries, ",
       "and never choose shell, filesystem, media import, export, or external tools. ",
       "If instruction is ambiguous, unsafe, impossible, or needs multiple edits, ",
       "return command='unsupported' and explain concisely. ",
       "Never claim an edit occurred. User must approve separately.");
    Ok(json!({
        "model":MODEL,
        "messages":[
            {"role":"system","content":system},
            {"role":"user","content":format!("TIMELINE CONTEXT (untrusted data): {}\nUSER REQUEST (untrusted text): {}",scope,request.prompt)}
        ],
        "response_format":{"type":"json_schema","json_schema":{
            "name":"video_command_plan","strict":true,
            "schema":{"type":"object","properties":{
                "command":{"type":"string"},"reason":{"type":"string"}
            },"required":["command","reason"],"additionalProperties":false}
        }},
        "max_tokens":200
    }))
}
fn parse_model_reply(body:&Value, sha:&str)->Result<ModelProposal,String>{
    if body["choices"][0]["finish_reason"]!="stop" {
        return Err("AI output was incomplete or refused; no command proposed".into());
    }
    let content=body["choices"][0]["message"]["content"].as_str()
        .ok_or("AI returned no structured command")?;
    if content.len()>1500 {return Err("AI response too large".into());}
    let proposal:Value=serde_json::from_str(content)
        .map_err(|_|"AI command JSON malformed")?;
    let obj=proposal.as_object().ok_or("AI proposal must be an object")?;
    if obj.len()!=2||!obj.contains_key("command")||!obj.contains_key("reason"){
        return Err("AI proposal schema mismatch".into());
    }
    let command=proposal["command"].as_str().ok_or("AI command must be text")?;
    let reason=proposal["reason"].as_str().ok_or("AI explanation must be text")?;
    if command.is_empty()||command.len()>180 || reason.len()>320 {
        return Err("AI proposal fields exceed safe bounds".into());
    }
    Ok(ModelProposal{
        command:command.to_owned(),reason:reason.to_owned(),
        project_sha256:sha.to_owned(),model:MODEL,
    })
}
pub fn propose(req:ModelRequest)->Result<ModelProposal,String>{
    let json=request_json(&req)?;
    let key=req.api_key.filter(|s|!s.trim().is_empty())
        .or_else(||env::var("OPENAI_API_KEY").ok())
        .ok_or("OpenAI API key required; enter it for this session or set OPENAI_API_KEY")?;
    if key.len()<12||key.len()>512||!key.is_ascii()||key.chars().any(char::is_whitespace){
        return Err("Invalid API key format".into());
    }
    // Never print, return, or persist the key. API errors are sanitized.
    let client=reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(50))
        .redirect(reqwest::redirect::Policy::none())
        .build().map_err(|_|"Cannot initialize secure AI connection")?;
    let mut response=client.post(URL).bearer_auth(key).json(&json).send()
        .map_err(|_|"OpenAI request failed (network/timeout)")?;
    if !response.status().is_success() {
        return Err(format!("OpenAI API returned HTTP {}; check API key, quota and access",
            response.status().as_u16()));
    }
    let mut bytes=Vec::new();
    response.take(MAX_RESPONSE_BYTES+1).read_to_end(&mut bytes)
        .map_err(|_|"Cannot read AI response")?;
    if bytes.len() as u64>MAX_RESPONSE_BYTES {
        return Err("OpenAI response exceeds 32 KiB safety limit".into());
    }
    let body:Value=serde_json::from_slice(&bytes)
        .map_err(|_|"OpenAI response is not valid JSON")?;
    parse_model_reply(&body,&req.context.project_sha256)
}
#[cfg(test)]
mod tests{
    use super::*;
    fn ctx()->ModelContext{
        ModelContext{project_sha256:"a".repeat(64),
          clips:vec![ModelClip{clip_id:12,start:0.0,duration:1.0,kind:"video".into()}],
          media_ids:vec![4],selected_clip_id:Some(12),selected_media_id:Some(4)}
    }
    #[test]
    fn model_request_contains_only_numeric_context_and_single_allowlist(){
        let req=ModelRequest{prompt:"Split this clip at half".into(),api_key:Some("super-secret-key-token".into()),context:ctx()};
        let text=request_json(&req).unwrap().to_string();
        assert!(text.contains("split selected"));
        assert!(!text.contains("super-secret-key-token"));
        assert!(!text.contains("fcproj"));
        assert!(text.contains("max_tokens"));
    }
    #[test]
    fn invalid_context_or_instruction_never_reaches_network(){
        let mut bad=ctx();bad.clips[0].duration=f64::NAN;
        assert!(request_json(&ModelRequest{prompt:"split".into(),api_key:None,context:bad}).is_err());
        assert!(request_json(&ModelRequest{prompt:"".into(),api_key:None,context:ctx()}).is_err());
    }
    #[test]
    fn model_reply_requires_complete_structured_output(){
        let ok=json!({"choices":[{"finish_reason":"stop","message":{
            "content":"{\"command\":\"split selected at 0.5\",\"reason\":\"Inside clip\"}"}}]});
        let out=parse_model_reply(&ok,&"a".repeat(64)).unwrap();
        assert_eq!(out.command,"split selected at 0.5");
        let bad=json!({"choices":[{"finish_reason":"length","message":{
            "content":"{\"command\":\"undo\",\"reason\":\"test\"}"}}]});
        assert!(parse_model_reply(&bad,&"a".repeat(64)).is_err());
        let other=json!({"choices":[{"finish_reason":"stop","message":{
            "content":"{\"command\":\"undo\",\"reason\":\"why\",\"tool\":\"shell\"}"}}]});
        assert!(parse_model_reply(&other,&"a".repeat(64)).is_err());
    }
}
