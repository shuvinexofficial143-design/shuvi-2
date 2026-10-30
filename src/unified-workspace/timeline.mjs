/** U03: frame-accurate UI gestures derived exclusively from native FilmCraft readback. */
const TICKS=254016000000;
export function nativeFps(sequence){
  const rate=sequence?.settings?.frame_rate ?? sequence?.settings?.frameRate;
  const num=rate?.num ?? rate?.numerator, den=rate?.den ?? rate?.denominator;
  if(!Number.isSafeInteger(num)||!Number.isSafeInteger(den)||num<=0||den<=0)return null;
  const fps=num/den;
  return Number.isFinite(fps)&&fps>=1&&fps<=240?fps:null;
}
export function visibleTimelineSeconds(sequence,clips){
  const nativeDuration=Number(sequence?.duration);
  const duration=Number.isFinite(nativeDuration)&&nativeDuration>=0?nativeDuration/TICKS:0;
  const clipEnd=Array.isArray(clips)?clips.reduce((m,c)=>
    Number.isFinite(c.start)&&Number.isFinite(c.duration)?Math.max(m,c.start+c.duration):m,0):0;
  return Math.min(86400,Math.max(10,duration,clipEnd));
}
export function moveDestination({start,deltaX,laneWidth,visibleSeconds,duration,fps}){
  if(![start,deltaX,laneWidth,visibleSeconds,duration,fps].every(Number.isFinite)||
      laneWidth<=0||visibleSeconds<=0||visibleSeconds>86400||
      start<0||duration<0||fps<1||fps>240)return null;
  const maxStart=Math.max(0,Math.min(86400,visibleSeconds-duration));
  const target=Math.max(0,Math.min(maxStart,start+deltaX/laneWidth*visibleSeconds));
  const frames=Math.floor(target*fps+0.5);
  return Math.min(maxStart,frames/fps);
}
export function verifyNativeMove(clips,clipId,track,seconds,fps){
  const clip=Array.isArray(clips)?clips.find(x=>x.clipId===clipId):null;
  return !!clip&&clip.track===track&&Number.isFinite(seconds)&&
    Number.isFinite(fps)&&fps>0&&Math.abs(clip.start-seconds)<=0.51/fps;
}
