/** Narrow focus-safe keyboard shortcuts. No OS shell or simulated success. */
export function workspaceKeyCommand({key,ctrlKey=false,metaKey=false,altKey=false,shiftKey=false,editable=false,studio="video",selectedClip=false}){
  if(editable||altKey||studio!=="video")return null;
  const k=String(key).toLowerCase();
  if(ctrlKey||metaKey){
    if(k==="z")return shiftKey?"redo":"undo";
    if(k==="y"&&!shiftKey)return "redo";
    return null;
  }
  if(shiftKey)return null;
  if(k==="delete"&&selectedClip)return "delete";
  if(k==="s"&&selectedClip)return "split";
  if(k==="arrowleft")return "frame-back";
  if(k==="arrowright")return "frame-forward";
  return null;
}
