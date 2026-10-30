/** Deliberate, per-Video-session consent before any external AI request. */
export function canSubmitVideoAiRequest({mode,optedIn,prompt}) {
  return mode==="openai" && optedIn===true &&
    typeof prompt==="string" && prompt.trim().length>0 && prompt.length<=700 &&
    !prompt.includes("\0");
}
