/**
 * Read-only AI preparation diagnostics. This is NOT an approval or execution
 * gateway; no LLM text can mint owner consent or guarded edit proof.
 */
const sha=value=>typeof value==="string"&&/^[a-f0-9]{64}$/i.test(value);
export function describeApprovalState({studio,video,motion,pendingApproval,needsReload,recoveryStudio,busy}){
  const blocked=busy?"Native operation running":
    needsReload&&recoveryStudio===studio?"Native recovery required":null;
  if(studio==="motion")
    return {eligible:false,reason:blocked??"Motion AI guarded execution is not connected; manual editing only",nativeGuarded:false};
  if(!video?.snapshot||!sha(video.snapshot.projectSha256))
    return {eligible:false,reason:blocked??"Open and verify a real FilmCraft project",nativeGuarded:false};
  if(pendingApproval){
    const current=pendingApproval.expectedSha===video.snapshot.projectSha256 &&
      pendingApproval.projectPath===video.projectPath;
    return {eligible:!blocked&&current,reason:blocked??(current?"Owner review required for staged Video task":"Proposed Video task is stale"),
      nativeGuarded:false,taskId:pendingApproval.id,actionCount:pendingApproval.actions?.length??0};
  }
  return {eligible:false,reason:blocked??"AI Director is not connected; no task is authorized",nativeGuarded:false};
}
