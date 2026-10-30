/**
 * Pure viewport math for long FilmCraft timelines.
 * All positions are seconds from saved sequence.inspect; zoom/pan never
 * changes clip/project content. Intended for visual display only.
 */
export function timelineViewport(totalSeconds, zoom, offsetSeconds=0){
  if(!Number.isFinite(totalSeconds)||totalSeconds<=0||
    !Number.isFinite(zoom)||zoom<1||zoom>64||
    !Number.isFinite(offsetSeconds))return null;
  const duration=Math.max(1/240,totalSeconds/zoom);
  const boundedDuration=Math.min(totalSeconds,duration);
  const maxStart=Math.max(0,totalSeconds-boundedDuration);
  const start=Math.max(0,Math.min(maxStart,offsetSeconds));
  return Object.freeze({
    start, duration:boundedDuration, end:start+boundedDuration,
    total:totalSeconds, maxStart, zoom
  });
}
export function clipViewportBounds(clip,viewport) {
  if(!viewport||!clip||!Number.isFinite(clip.start)||
     !Number.isFinite(clip.duration)||clip.duration<=0)return null;
  const left=Math.max(clip.start,viewport.start);
  const right=Math.min(clip.start+clip.duration,viewport.end);
  if(right<=left)return null;
  return {
    leftPercent:Math.max(0,Math.min(100,(left-viewport.start)/viewport.duration*100)),
    widthPercent:Math.max(0,Math.min(100,(right-left)/viewport.duration*100)),
    clippedLeft:clip.start<viewport.start,
    clippedRight:clip.start+clip.duration>viewport.end,
  };
}
