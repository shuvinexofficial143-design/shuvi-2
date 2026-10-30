/**
 * Read FilmCraft's actual sequence.inspect track lock/mute/visibility state.
 * Never infer lock state from text or DOM; "locked" belongs to native engine.
 */
export function videoTrackStates(sequence) {
  const result=[];
  if(!sequence||typeof sequence!=="object")return result;
  for(const kind of ["video","audio"]){
    const lanes=sequence[kind];
    if(!Array.isArray(lanes))continue;
    for(let index=0;index<lanes.length;index++){
      const lane=lanes[index];
      if(!lane||typeof lane!=="object")continue;
      result.push({
        track:(kind==="video"?"V":"A")+(index+1),kind,
        name:String(lane.name??""),
        locked:lane.locked===true,
        muted:lane.muted===true,
        enabled:lane.enabled!==false,
        solo:lane.solo===true,
        clips:Array.isArray(lane.items)?lane.items.length:0,
      });
    }
  }
  return result;
}
/**
 * Frontend preflight; Rust/FilmCraft still validate every native action.
 * Only explicit native locked=true blocks. Allows new tracks when FilmCraft
 * supports creation; never fabricates a missing clip.
 */
export function videoActionPreflight(action,sequence){
  if(!action||typeof action!=="object"||typeof action.type!=="string")
    return {ok:false,reason:"Unknown timeline action"};
  if(action.type==="createSequence"||action.type==="undo"||action.type==="redo")
    return {ok:true};
  const tracks=videoTrackStates(sequence);
  if(action.type==="place"){
    const target=tracks.find(t=>t.track===action.track);
    if(target?.locked)return {ok:false,reason:"Destination "+target.track+" is locked in FilmCraft"};
    return {ok:true};
  }
  if(!["split","trim","move","delete"].includes(action.type))
    return {ok:false,reason:"Unrecognized edit cannot pass track safety"};
  if(!Number.isSafeInteger(action.clipId)||action.clipId<=0)
    return {ok:false,reason:"Invalid native FilmCraft clip ID"};
  let source=null;
  for(const kind of ["video","audio"]){
    const lanes=sequence?.[kind];
    if(!Array.isArray(lanes))continue;
    for(let i=0;i<lanes.length;i++){
      const items=lanes[i]?.items;
      if(Array.isArray(items)&&items.some(x=>x?.clip===action.clipId)){
        source={address:(kind==="video"?"V":"A")+(i+1),locked:lanes[i]?.locked===true};
      }
    }
  }
  if(!source)return {ok:false,reason:"Clip is no longer present in saved FilmCraft sequence"};
  if(source.locked)return {ok:false,reason:"Source "+source.address+" is locked in FilmCraft"};
  if(action.type==="move"){
    const dest=tracks.find(t=>t.track===action.track);
    if(dest?.locked)return {ok:false,reason:"Destination "+dest.track+" is locked in FilmCraft"};
    if(!action.track||action.track[0]!==source.address[0])
      return {ok:false,reason:"Cannot move clip between audio and video track families"};
  }
  return {ok:true};
}
