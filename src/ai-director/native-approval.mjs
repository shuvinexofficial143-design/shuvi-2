// A04: native owner-consent bridge. No model/renderer-created authorization proof.
// Does not use window.confirm or a fake frontend callback as consent.
import {validateSnapshot} from "./contracts.mjs";
const SHA=/^[a-f0-9]{64}$/;
function validateApprovalPreview(p) {
  if(!p||typeof p!=="object"||Array.isArray(p)||
     typeof p.taskId!=="string"||!/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/.test(p.taskId)||
     typeof p.planHash!=="string"||!SHA.test(p.planHash)||
     !Array.isArray(p.actions)||p.actions.length<1||p.actions.length>12)
    throw new Error("invalid native approval request");
  validateSnapshot(p.project);
  return p;
}
export function createNativeApprovalGateway({invoke}={}) {
  if(typeof invoke!=="function")throw new Error("trusted Tauri invoke required");
  return Object.freeze({
    async request(plan) {
      const p=validateApprovalPreview(plan);
      // This is a fixed host-only command: native code verifies actual owner
      // button interaction and a persisted plan hash before granting consent.
      const proof=await invoke("ai_director_request_owner_consent",{
        request:{taskId:p.taskId,planHash:p.planHash,project:p.project,
          instruction:p.instruction,actions:p.actions}
      });
      if(!proof||proof.granted!==true||proof.taskId!==p.taskId||
         proof.planHash!==p.planHash||proof.nativeOwnerInteraction!==true)
        return {granted:false,taskId:p.taskId,planHash:p.planHash};
      return {granted:true,taskId:p.taskId,planHash:p.planHash};
    }
  });
}
