// A02: renderer-safe bridge to a trusted native model provider.
// No API credentials, endpoints, or transport functions are accepted from a model.
import {allowedActions} from "./contracts.mjs";

const MODEL = "gpt-4o-mini";
const NATIVE_COMMAND = "ai_director_model_propose"; // Not registered until integration.
function boundedString(x, label, max) {
  if (typeof x !== "string" || !x.trim() || x.length > max ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(x))
    throw new Error(label + ": invalid text");
  return x;
}
function ids(value, label) {
  if (!Array.isArray(value) || value.length > 128 ||
      value.some(id => !Number.isSafeInteger(id) || id < 1) ||
      new Set(value).size !== value.length)
    throw new Error(label + ": invalid native IDs");
  return [...value];
}
// The host supplies only native numeric IDs, never project paths, filenames,
// customer data, raw media, provider keys or arbitrary context fields.
export function validateModelInventory(inventory, engine) {
  const allowed = ["clipIds","mediaIds","compIds","layerIds","maskIds","effectIds"];
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory) ||
      Object.keys(inventory).some(k => !allowed.includes(k)) ||
      Object.getPrototypeOf(inventory) !== Object.prototype)
    throw new Error("inventory: only verified native IDs are allowed");
  if (!["video","motion"].includes(engine)) throw new Error("unsupported engine");
  const keys = engine === "video" ? ["clipIds","mediaIds"] : ["compIds","layerIds","maskIds","effectIds"];
  if (Object.keys(inventory).some(k => !keys.includes(k)) ||
      keys.some(k => !Object.hasOwn(inventory,k)))
    throw new Error("inventory: editor-specific native ID collections required");
  const copy = Object.fromEntries(keys.map(key => [key,ids(inventory[key],key)]));
  if (JSON.stringify(copy).length > 5000) throw new Error("inventory exceeds model context budget");
  return Object.freeze(copy);
}
export function createNativeModelGateway({invoke}={}) {
  if (typeof invoke !== "function") throw new Error("trusted native invoke required");
  return Object.freeze({
    async propose({instruction,engine,inventory}) {
      const prompt = boundedString(instruction,"instruction",2000);
      const safe = validateModelInventory(inventory,engine);
      // This is a real IPC call site, not a mocked model or claim that the
      // Tauri command has been registered. Missing native module fails closed.
      let response;
      try {
        response = await invoke(NATIVE_COMMAND,{
          request:{
            model:MODEL, instruction:prompt, engine,
            inventory:safe, allowedActions:allowedActions.filter(a=>a.startsWith(engine+"."))
          }
        });
      } catch(error) {
        // Never echo provider/backend errors: they could contain secret material.
        const code = typeof error?.code === "string" && /^[A-Z_]{2,48}$/.test(error.code)
          ? error.code : "PROVIDER_UNAVAILABLE";
        throw new Error("AI_PROVIDER_"+code+": native model request failed");
      }
      if (typeof response !== "string" || response.length > 24000) {
        throw new Error("AI_PROVIDER_INVALID_RESPONSE");
      }
      return response;
    }
  });
}
export const providerBridgeCommand = NATIVE_COMMAND;
