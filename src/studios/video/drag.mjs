/**
 * Convert a user pointer gesture into a typed FilmCraft timeline timestamp.
 * Actual clip position remains unchanged until native save/readback succeeds.
 */
export function clipDragDestination({start,deltaPixels,lanePixels,visibleSeconds,totalSeconds=visibleSeconds,fps}){
  if(![start,deltaPixels,lanePixels,visibleSeconds,totalSeconds,fps].every(Number.isFinite)||
    lanePixels<=0||visibleSeconds<=0||totalSeconds<visibleSeconds||totalSeconds>86400||fps<1||fps>240||start<0||start>86400)
    return null;
  const raw=start+(deltaPixels/lanePixels)*visibleSeconds;
  // A drag gesture cannot place a clip outside the currently visible timeline.
  const clamped=Math.max(0,Math.min(totalSeconds,raw));
  // Quantize to real saved FilmCraft sequence frame rate.
  // Floor the maximum playable frame to avoid rounding an end-of-lane
  // gesture beyond the visible FilmCraft sequence boundary.
  const frame=Math.min(Math.floor(totalSeconds*fps),Math.round(clamped*fps));
  if(!Number.isSafeInteger(frame)||frame<0)return null;
  const seconds=frame/fps;
  return seconds<=86400 ? seconds : 86400;
}
