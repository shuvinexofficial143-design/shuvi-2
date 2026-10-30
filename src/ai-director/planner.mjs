// A02 model output is an untrusted proposal. This module cannot edit a project.
import {validateAction,validateSnapshot,sameSnapshot} from "./contracts.mjs";
import {validateModelInventory} from "./provider-gateway.mjs";

const ID_MAP = Object.freeze({clipId:"clipIds",itemId:"mediaIds",compId:"compIds",layerId:"layerIds",
  uid:null});
function strictObject(value,label,keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).some(k => !keys.includes(k)) ||
      keys.some(k => !Object.hasOwn(value,k)))
    throw new Error(label+": unexpected or missing fields");
}
export function parseModelProposal(raw,engine,inventory) {
  if (typeof raw !== "string" || raw.length > 24000) throw new Error("invalid model response");
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error("model response is not JSON"); }
  strictObject(data,"proposal",["reason","actions"]);
  if (typeof data.reason !== "string" || data.reason.length > 320 ||
      !data.reason.trim() || /[\u0000-\u001f\u007f]/.test(data.reason))
    throw new Error("model reason invalid");
  const verified = validateModelInventory(inventory,engine);
  if (!Array.isArray(data.actions) || data.actions.length < 1 || data.actions.length > 12)
    throw new Error("model step limit is 1..12");
  const actions = data.actions.map((item,index) => {
    const action = validateAction(item,engine); // exact schema, enums, bounds, no shell/IPC.
    for (const [field,collection] of Object.entries(ID_MAP)) {
      if (!Object.hasOwn(action,field)) continue;
      if (field === "uid") {
        if (!verified.maskIds?.includes(action.uid) && !verified.effectIds?.includes(action.uid))
          throw new Error("step "+index+": unverified native uid");
      } else if (!verified[collection]?.includes(action[field]))
        throw new Error("step "+index+": unverified native "+field);
    }
    if (Object.hasOwn(action,"track") && !/^[VA](?:[1-9]|1[0-6])$/.test(action.track))
      throw new Error("step "+index+": invalid native track");
    if (action.type === "video.place" &&
        ((action.track.startsWith("V") && !action.video) ||
         (action.track.startsWith("A") && !action.audio)))
      throw new Error("step "+index+": media/track mismatch");
    return action;
  });
  return Object.freeze({reason:data.reason,actions});
}
// Serial native snapshot checks before and after inference. prepare() must also
// compare expectedSnapshot at its own snapshot read, closing the final race.
export async function prepareModelPlan({director,adapter,gateway,taskId,instruction,inventory}) {
  if (typeof adapter?.readSnapshot !== "function" ||
      typeof director?.prepare !== "function" ||
      typeof gateway?.propose !== "function")
    throw new Error("trusted native planning ports required");
  const before = validateSnapshot(await adapter.readSnapshot());
  const safe = validateModelInventory(inventory,before.engine);
  const raw = await gateway.propose({instruction,engine:before.engine,inventory:safe});
  const proposed = parseModelProposal(raw,before.engine,safe);
  const now = validateSnapshot(await adapter.readSnapshot());
  if (!sameSnapshot(before,now))
    throw new Error("STALE_PROJECT_DURING_MODEL: refresh native project and plan again");
  const prepared = await director.prepare({
    taskId,instruction,actions:proposed.actions,expectedSnapshot:before
  });
  return {prepared,reason:proposed.reason};
}
