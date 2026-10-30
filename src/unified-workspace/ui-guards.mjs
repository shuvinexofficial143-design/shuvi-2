/**
 * U07 UI capability matrix from current native-owned state.
 * This is a PRESENTATION guard only. The Rust/IPC owner remains authoritative.
 */
export const studioRecovery=(state,studio)=>{
  if(state?.recoveryByStudio && typeof state.recoveryByStudio[studio]==="boolean")
    return state.recoveryByStudio[studio];
  return !!state?.needsReload&&state?.recoveryStudio===studio;
};
const selection=(items,id)=>Number.isSafeInteger(id)&&id>0&&Array.isArray(items)&&items.some(x=>x.id===id);
export function workspaceActionAvailable(state,action,{clipId=null,layerId=null,effectUid=null,maskUid=null}={}){
  if(!state||typeof action!=="string")return false;
  if(action==="stop")return !!state.busy;
  if(action==="reject")return !state.busy&&!!state.pendingApproval;
  if(action==="diagnostic-copy")return !state.busy;
  if(action==="bookmark-forget")return !state.busy;
  if(state.busy)return false;
  const studio=action.startsWith("video-")?"video":
    action.startsWith("motion-")?"motion":state.studio;
  if(studioRecovery(state,studio)){
    return studio==="video"?action==="video-open":
      ["motion-status","motion-open"].includes(action);
  }
  if(action==="video-open"||action==="motion-open"||action==="motion-status"||
    action==="bookmark-restore")return true;
  if(action==="bookmark-remember"){
    return state.studio==="video"?!!state.video:state.motion?.ready===true;
  }
  if(action==="approve")return !!state.pendingApproval&&state.studio==="video"&&
    state.pendingApproval.expectedSha===state.video?.snapshot?.projectSha256;
  if(studio==="video"){
    const video=state.video;
    if(!video)return false;
    if(action==="video-verify"||action==="video-new"||action==="video-import"||
       action==="video-place"||action==="video-preview"||action==="video-export"||
       action==="video-undo"||action==="video-redo")return true;
    if(["video-split","video-move","video-trim","video-delete"].includes(action)){
      const clip=video.clips?.find(c=>c.clipId===clipId);
      if(!clip)return false;
      const kind=clip.kind==="audio"?"audio":"video";
      const lane=video.snapshot?.sequence?.[kind]?.[Number(clip.track.slice(1))-1];
      return lane?.locked!==true;
    }
    return false;
  }
  if(studio==="motion"){
    const m=state.motion;
    if(!m?.ready)return false;
    if(action==="motion-create")return true;
    if(action==="motion-save")return true;
    if(!m.composition)return false;
    if(["motion-text","motion-shape","motion-render","motion-export",
      "motion-verify"].includes(action))return true;
    const hasLayer=selection(m.layers,layerId);
    if(action==="motion-inspect")return hasLayer;
    const inspector=m.inspector;
    if(!hasLayer||!inspector||inspector.layer?.id!==layerId||
      inspector.revision!==m.revision)return false;
    if(["motion-transform","motion-key","motion-add-effect","motion-ease",
      "motion-add-mask"].includes(action))return true;
    if(action==="motion-edit")return String(inspector.layer.kind).toLowerCase()==="text";
    if(["motion-set-effect","motion-toggle-effect","motion-remove-effect"].includes(action))
      return Number.isSafeInteger(effectUid)&&inspector.effects?.some(x=>x.uid===effectUid)===true;
    if(action==="motion-remove-mask")
      return Number.isSafeInteger(maskUid)&&inspector.masks?.some(x=>x.uid===maskUid)===true;
  }
  return false;
}
