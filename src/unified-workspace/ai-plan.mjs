/** U04 owner-gated Video-only plan preflight. No model instruction can
 * introduce arbitrary native IPC, shell, undo, redo or createSequence.
 * This matches the AI Director's Video actions subset without importing
 * another chat's unmerged branch.
 */
const schemas={
 place:["itemId","track","seconds","video","audio"],
 split:["clipId","seconds"],
 trim:["clipId","edge","ripple","deltaFrames"],
 move:["clipId","track","seconds","insert"],
 delete:["clipId","ripple"]
};
const id=v=>Number.isSafeInteger(v)&&v>0;
const seconds=v=>typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=86400;
export function checkedAiVideoActions(actions){
  if(!Array.isArray(actions)||actions.length<1||actions.length>12)throw Error("AI Video plan requires 1–12 allowed actions");
  const out=[];
  for(const action of actions){
    if(!action||typeof action!=="object"||Array.isArray(action)||
      ![Object.prototype,null].includes(Object.getPrototypeOf(action))||!Object.hasOwn(schemas,action.type))
      throw Error("Unapproved AI Video action");
    const keys=["type",...schemas[action.type]];
    if(Object.keys(action).length!==keys.length||
      keys.some(k=>!Object.hasOwn(action,k))||
      Object.keys(action).some(k=>!keys.includes(k)))
      throw Error("AI Video action must use exact typed fields");
    if("clipId" in action&&!id(action.clipId))throw Error("AI clip ID invalid");
    if("itemId" in action&&!id(action.itemId))throw Error("AI media ID invalid");
    if("seconds" in action&&!seconds(action.seconds))throw Error("AI timeline time invalid");
    if("track" in action&&!/^[VA](?:[1-9]|1[0-6])$/.test(action.track))
      throw Error("AI destination track invalid");
    for(const field of ["ripple","insert","video","audio"]){
      if(field in action&&typeof action[field]!=="boolean")throw Error("AI flag must be boolean");
    }
    if(action.type==="place"&&!action.video&&!action.audio)throw Error("AI place requires enabled media stream");
    if("edge" in action&&!["in","out"].includes(action.edge))throw Error("AI trim edge invalid");
    if("deltaFrames" in action&&(!Number.isSafeInteger(action.deltaFrames)||
      action.deltaFrames===0||Math.abs(action.deltaFrames)>100000))
      throw Error("AI trim frame count invalid");
    out.push({...action});
  }
  return out;
}
