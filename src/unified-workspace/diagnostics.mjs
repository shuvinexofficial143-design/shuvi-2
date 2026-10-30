/** U05 diagnostics are computed from native controller receipts, never guessed.
 * No local paths, chat prompts, media bytes or AI approval secrets are exported.
 */
export function nativeDiagnosticReport(state){
  if(!state||typeof state!=="object")throw Error("Workspace state required");
  const v=state.video,m=state.motion;
  const quarantined=state.needsReload?state.recoveryStudio:null;
  const validSha=s=>typeof s==="string"&&/^[0-9a-f]{64}$/i.test(s);
  const videoStatus=quarantined==="video"?"recovery-required":
    v&&validSha(v.snapshot?.projectSha256)?"snapshot-verified":"not-open";
  const motionStatus=quarantined==="motion"?"recovery-required":
    m?.ready===true&&Number.isSafeInteger(m.revision)?"worker-verified":"not-ready";
  const events=Array.isArray(state.verificationHistory)?
    state.verificationHistory.slice(-25).map(e=>({
      id:e.id,studio:e.studio,label:e.label,outcome:e.outcome,code:e.code??null
    })):[];
  return {
    schemaVersion:1,
    source:"shuvi-unified-native-receipts",
    installationVerified:false,
    aiNativeTaskGuardVerified:false,
    studio:state.studio,
    nativeOperationBusy:!!state.busy,
    recoveryStudio:quarantined,
    video:{
      status:videoStatus,
      projectSha256:videoStatus==="snapshot-verified"?v.snapshot.projectSha256:null,
      sessionRevision:videoStatus==="snapshot-verified"?v.snapshot.sessionRevision:null,
      clipCount:videoStatus==="snapshot-verified"&&Array.isArray(v.clips)?v.clips.length:null,
      frameReceiptPresent:videoStatus==="snapshot-verified"&&!!state.videoFrame,
      exportReceiptPresent:videoStatus==="snapshot-verified"&&!!state.exportReceipt
    },
    motion:{
      status:motionStatus,
      projectRevision:motionStatus==="worker-verified"?m.revision:null,
      compositionId:motionStatus==="worker-verified"?m.composition?.id??null:null,
      layerCount:motionStatus==="worker-verified"&&Array.isArray(m.layers)?m.layers.length:null,
      dirty:motionStatus==="worker-verified"?!!m.dirty:null,
      frameReceiptPresent:motionStatus==="worker-verified"&&!!m.frame
    },
    recentEvents:events
  };
}
export function nativeDiagnosticText(state){
  return JSON.stringify(nativeDiagnosticReport(state),null,2);
}
