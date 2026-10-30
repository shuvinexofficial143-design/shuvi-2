// A06: Stop may only be acknowledged by the authoritative native SQLite owner.
// Never equate local AbortController, canceled fetch or a UI button to a
// canceled FilmCraft/EffectCraft operation.
const TASK=/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;
const SHA=/^[a-f0-9]{64}$/;
function bind(taskId,planHash){
  if(typeof taskId!=="string"||!TASK.test(taskId)||
    typeof planHash!=="string"||!SHA.test(planHash))
    throw new Error("NATIVE_TASK_BINDING_INVALID");
}
export function createNativeStopController({invoke}={}){
  if(typeof invoke!=="function")throw new Error("trusted native invoke required");
  return Object.freeze({
    async cancel({taskId,planHash}){
      bind(taskId,planHash);
      const reply=await invoke("ai_director_cancel_task",{
        request:{taskId,planHash}
      });
      // Only the actual SQLite transaction winner can say Stop succeeded.
      if(reply?.taskId!==taskId||reply?.planHash!==planHash ||
         reply?.durable!==true||reply?.nativeOwnerBound!==true)
        throw new Error("NATIVE_STOP_ACK_INVALID");
      if(reply.cancelled===true &&
        ["before_first_edit","between_verified_steps"].includes(reply.state))
        return Object.freeze({cancelled:true,state:reply.state,
          nativeAcknowledged:true,taskId});
      if(reply.cancelled===false &&
        ["intent_uncertain","already_complete","already_cancelled"].includes(reply.state))
        return Object.freeze({cancelled:false,state:reply.state,
          nativeAcknowledged:true,taskId});
      throw new Error("NATIVE_STOP_STATE_INVALID");
    },
    async recover({taskId,planHash}){
      bind(taskId,planHash);
      const reply=await invoke("ai_director_recover_task",{
        request:{taskId,planHash}
      });
      if(reply?.taskId!==taskId||reply?.planHash!==planHash||
         reply?.durable!==true||reply?.nativeOwnerBound!==true ||
         !Array.isArray(reply.steps)||reply.steps.length>12 ||
         reply.steps.some(s=>!["not_started","verified","uncertain","cancelled"].includes(s)))
        throw new Error("NATIVE_RECOVERY_ACK_INVALID");
      return Object.freeze({taskId,steps:Object.freeze([...reply.steps])});
    }
  });
}
