// A05 isolated host-backed durable plan journal for the A01/A05 Director.
// No browser storage, localStorage, fake approval or cross-editor writes.
// Host command implementations are the Integration 2.0.5 responsibility.
import {validateDraft,validateSnapshot,sameSnapshot} from "./contracts.mjs";
import {planDigest} from "./plan-digest.mjs";
const ALLOWED=new Set([
  "prepared","approved","approval_denied","cancelled_before_edit",
  "cancelled_between_steps","step_intent","step_verified",
  "step_uncertain","stale_block","verification_missing",
  "readback_mismatch","complete"
]);
const SHA=/^[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;
export function createNativeAuditJournal({invoke}={}) {
  if(typeof invoke!=="function")throw new Error("trusted native invoke required");
  return Object.freeze({
    async reserve({taskId,planHash,project,plan}) {
      if(!ID.test(taskId) || typeof planHash!=="string"||!SHA.test(planHash))
        throw new Error("native reservation requires valid task/hash");
      if(!plan)throw new Error("native reservation requires complete typed plan");
      const draft=validateDraft(plan);
      if(draft.taskId!==taskId || !sameSnapshot(validateSnapshot(project),draft.snapshot) ||
         await planDigest(draft)!==planHash)
        throw new Error("native plan reservation hash mismatch");
      // A successful IPC requires an actual native durable insertion and
      // a single-owner snapshot check. Missing command fails closed.
      const result=await invoke("ai_director_reserve_plan",{request:{
        taskId,planHash,project:draft.snapshot,plan:draft
      }});
      return result?.reserved===true && result.taskId===taskId &&
        result.planHash===planHash && result.durable===true &&
        result.nativeOwnerBound===true;
    },
    async append(event) {
      if(!event||typeof event!=="object"||Array.isArray(event) ||
         !ALLOWED.has(event.event)||!ID.test(event.taskId))
        throw new Error("unapproved native audit event");
      // The native audit is informational only. 'approved' is never proof
      // of human consent; the authoritative native Ledger checks its own
      // owner-click consent and previous durable plan independently.
      const safe={event:event.event,taskId:event.taskId};
      if(Object.hasOwn(event,"index")){
        if(!Number.isSafeInteger(event.index)||event.index<0||event.index>11)
          throw new Error("invalid audited step");
        safe.index=event.index;
      }
      if(Object.hasOwn(event,"planHash")){
        if(typeof event.planHash!=="string"||!SHA.test(event.planHash))
          throw new Error("invalid audited plan hash");
        safe.planHash=event.planHash;
      }
      if(Object.hasOwn(event,"key")){
        if(typeof event.key!=="string"||!SHA.test(event.key))
          throw new Error("invalid audited action key");
        safe.key=event.key;
      }
      const result=await invoke("ai_director_record_audit",{request:safe});
      if(result?.persisted!==true || result?.taskId!==event.taskId)
        throw new Error("NATIVE_AUDIT_NOT_PERSISTED");
    }
  });
}
