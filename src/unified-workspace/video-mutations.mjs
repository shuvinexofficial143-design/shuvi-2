/**
 * FilmCraft edit preflight and independently saved native timeline verification.
 * The Rust command handler remains the authority for geometry and authorization.
 */
import {nativeClipInspector} from "./video-inspector.mjs";
const numeric=v=>typeof v==="number"&&Number.isFinite(v);
export function trimPreflight(state,clipId,edge,deltaFrames,ripple=false){
  const before=nativeClipInspector(state,clipId);
  if(!before)return {ok:false,reason:"Selected clip is absent from the native sequence"};
  if(before.locked)return {ok:false,reason:"Native FilmCraft track is locked"};
  if(edge!=="in"&&edge!=="out")return {ok:false,reason:"Trim edge must be In or Out"};
  if(typeof ripple!=="boolean")return {ok:false,reason:"Ripple flag must be boolean"};
  if(!Number.isSafeInteger(deltaFrames)||deltaFrames===0||Math.abs(deltaFrames)>144000)
    return {ok:false,reason:"Trim frame delta must be a nonzero native integer"};
  if(!numeric(before.fps)||before.fps<1)
    return {ok:false,reason:"Native FilmCraft FPS is unavailable"};
  if(before.duration*before.fps<1-1e-7)
    return {ok:false,reason:"Clip is too short for frame-accurate trimming"};
  // FilmCraft controls sign and ripple semantics; never guess target duration.
  return {ok:true,before,action:{type:"trim",clipId,edge,deltaFrames,ripple}};
}
export function deletePreflight(state,clipId,ripple=false){
  const before=nativeClipInspector(state,clipId);
  if(!before)return {ok:false,reason:"Selected clip is absent from native timeline"};
  if(before.locked)return {ok:false,reason:"Native FilmCraft track is locked"};
  if(typeof ripple!=="boolean")return {ok:false,reason:"Ripple flag must be boolean"};
  return {ok:true,before,action:{type:"delete",clipId,ripple}};
}
export function verifyNativeTrim(before,afterClips,edge){
  if(!before||!Array.isArray(afterClips)||!numeric(before.fps)||before.fps<=0)return false;
  const fresh=afterClips.find(c=>c.clipId===before.clipId);
  if(!fresh||fresh.itemId!==before.itemId||fresh.track!==before.track||
    !numeric(fresh.start)||!numeric(fresh.duration)||fresh.duration<=0)return false;
  const tol=0.51/before.fps;
  const end=fresh.start+fresh.duration;
  if(edge==="out"){
    return Math.abs(fresh.start-before.start)<=tol&&Math.abs(end-before.end)>tol;
  }
  if(edge==="in"){
    return Math.abs(end-before.end)<=tol&&Math.abs(fresh.start-before.start)>tol;
  }
  return false;
}
export function verifyNativeDelete(before,afterClips){
  if(!before||!Array.isArray(afterClips))return false;
  // FilmCraft may renumber other clips after ripple, but this exact source clip
  // identity must disappear from the verified native disk readback.
  return !afterClips.some(c=>c.clipId===before.clipId);
}
