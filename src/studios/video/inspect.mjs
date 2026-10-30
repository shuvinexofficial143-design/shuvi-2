/** Read-only adapters for real FilmCraft inspect sequence JSON. */
const TICKS=254_016_000_000;
const seconds=ticks=>Number.isFinite(ticks)&&ticks>=0?ticks/TICKS:null;
export function realClipDetail(sequence,clipId){
  if(!Number.isSafeInteger(clipId)||clipId<=0)return null;
  for(const kind of ["video","audio"]){
    const tracks=sequence?.[kind];
    if(!Array.isArray(tracks))continue;
    for(let i=0;i<tracks.length;i++){
      const track=tracks[i];
      if(!Array.isArray(track?.items))continue;
      const item=track.items.find(x=>x?.clip===clipId);
      if(!item)continue;
      const start=seconds(item.start),duration=seconds(item.duration);
      if(start===null||duration===null||duration<=0)return null;
      return {
        clipId,kind,track:(kind==="video"?"V":"A")+(i+1),
        itemId:Number.isSafeInteger(item.item)?item.item:null,
        name:String(item.name??""),start,duration,end:start+duration,
        sourceIn:seconds(item.sourceIn),sourceOut:seconds(item.sourceOut),
        startFrame:Number.isSafeInteger(item.startFrame)?item.startFrame:null,
        durationFrames:Number.isSafeInteger(item.durationFrames)?item.durationFrames:null,
        speed:Number.isFinite(item.speed)?item.speed:null,
        reverse:item.reverse===true,enabled:item.enabled!==false,
        gainDb:Number.isFinite(item.gainDb)?item.gainDb:null,
        effectCount:Array.isArray(item.effects)?item.effects.length:0,
        locked:track.locked===true,
      };
    }
  }
  return null;
}
export function realSequenceMarkers(sequence){
  if(!Array.isArray(sequence?.markers))return [];
  const out=[],seen=new Set();
  for(const mark of sequence.markers){
    if(!Number.isSafeInteger(mark?.id)||mark.id<=0||seen.has(mark.id))continue;
    const start=seconds(mark.start),duration=seconds(mark.duration);
    if(start===null)continue;
    seen.add(mark.id);
    out.push({id:mark.id,start,duration:duration??0,
      name:String(mark.name??"").slice(0,160),comment:String(mark.comment??"").slice(0,320),
      kind:String(mark.kind??"").slice(0,80),color:String(mark.color??"").slice(0,40)});
  }
  return out.sort((a,b)=>a.start-b.start||a.id-b.id);
}
export function revealTimeOffset(time,viewport){
  if(!viewport||!Number.isFinite(time))return null;
  if(time>=viewport.start&&time<viewport.end)return viewport.start;
  return Math.max(0,Math.min(viewport.maxStart,time-viewport.duration/2));
}
