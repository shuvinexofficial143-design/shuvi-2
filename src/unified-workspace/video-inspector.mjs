/** U06: pure readback-backed FilmCraft clip inspection and frame-accurate actions. */
import {nativeFps,visibleTimelineSeconds} from "./timeline.mjs";
export function nativeClipInspector(state,clipId){
  const video=state?.video;
  if(!video||!Number.isSafeInteger(clipId)||clipId<=0)return null;
  const clip=video.clips?.find(c=>c.clipId===clipId);
  if(!clip||!Number.isFinite(clip.start)||!Number.isFinite(clip.duration)||clip.duration<0)return null;
  const sequence=video.snapshot?.sequence,kind=clip.kind==="audio"?"audio":"video";
  const index=Number(clip.track?.slice(1))-1;
  const lane=sequence?.[kind]?.[index];
  const nativeEntry=lane?.items?.find(e=>e.clip===clip.clipId&&e.item===clip.itemId);
  if(!nativeEntry)return null;
  const fps=nativeFps(sequence);
  return {
    clipId:clip.clipId,itemId:clip.itemId,track:clip.track,kind,
    name:clip.name,start:clip.start,end:clip.start+clip.duration,
    duration:clip.duration,locked:lane?.locked===true,
    fps,sourceStartFrame:Number.isSafeInteger(nativeEntry.startFrame)?nativeEntry.startFrame:null,
    sourceDurationFrames:Number.isSafeInteger(nativeEntry.durationFrames)?nativeEntry.durationFrames:null
  };
}
export function splitPreflight(inspector,seconds){
  if(!inspector)return {ok:false,reason:"Select a saved FilmCraft clip"};
  if(inspector.locked)return {ok:false,reason:"FilmCraft source track is locked"};
  if(!Number.isFinite(seconds)||seconds<0||seconds>86400)
    return {ok:false,reason:"Split time must be finite and in range"};
  const fps=inspector.fps;
  if(!Number.isFinite(fps)||fps<1)return {ok:false,reason:"Native sequence FPS unavailable"};
  const first=Math.ceil((inspector.start+1/fps)*fps-1e-7)/fps;
  const last=Math.floor((inspector.end-1/fps)*fps+1e-7)/fps;
  const requestedFrame=Math.round(seconds*fps);
  const snapped=requestedFrame/fps;
  if(first>last||snapped<first-1e-8||snapped>last+1e-8)
    return {ok:false,reason:"A split must leave at least one native frame on both sides"};
  if(Math.abs(snapped-seconds)>0.51/fps)
    return {ok:false,reason:"Split time is not on a valid native frame"};
  return {ok:true,seconds:snapped,frame:requestedFrame};
}
export function verifyNativeSplit(before,afterClips,seconds){
  if(!before||!Array.isArray(afterClips)||!Number.isFinite(before.fps))return false;
  const tolerance=0.51/before.fps;
  const children=afterClips.filter(c=>c.itemId===before.itemId&&c.track===before.track);
  const start=children.some(c=>Math.abs(c.start-before.start)<=tolerance&&
    c.duration>0&&c.start+c.duration<=seconds+tolerance);
  const right=children.some(c=>Math.abs(c.start-seconds)<=tolerance&&
    c.duration>0&&c.start+c.duration<=before.end+tolerance);
  return start&&right;
}
export function timelineSeekFromX({clientX,laneLeft,laneWidth,sequence,clips}){
  const duration=visibleTimelineSeconds(sequence,clips),fps=nativeFps(sequence);
  if(![clientX,laneLeft,laneWidth].every(Number.isFinite)||laneWidth<=0||fps===null)return null;
  const fraction=Math.max(0,Math.min(1,(clientX-laneLeft)/laneWidth));
  const second=Math.min(duration,Math.round(duration*fraction*fps)/fps);
  return second>=0&&second<=86400?second:null;
}
