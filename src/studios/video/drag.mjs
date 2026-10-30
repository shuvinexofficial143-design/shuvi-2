/**
 * Convert a user pointer gesture into a typed FilmCraft timeline timestamp.
 * Actual clip position remains unchanged until native save/readback succeeds.
 */
export function clipDragDestination({start,deltaPixels,lanePixels,visibleSeconds,fps}){
  if(![start,deltaPixels,lanePixels,visibleSeconds,fps].every(Number.isFinite)||
    lanePixels<=0||visibleSeconds<=0||fps<1||fps>240||start<0||start>86400)
    return null;
  const raw=start+(deltaPixels/lanePixels)*visibleSeconds;
  const clamped=Math.max(0,Math.min(86400,raw));
  // Quantize to real saved FilmCraft sequence frame rate.
  const frame=Math.round(clamped*fps);
  if(!Number.isSafeInteger(frame)||frame<0)return null;
  const seconds=frame/fps;
  return seconds<=86400 ? seconds : 86400;
}
