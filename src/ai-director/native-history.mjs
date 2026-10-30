// A08: read-only recovery listing after application restart.
// The native owner (not the WebView) chooses project and private SQLite file.
// Never authorize edit from history, even when all old steps were verified.
const SHA=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;
const STATUSES=new Set(["verified","uncertain","not_started","cancelled"]);
const APPROVALS=new Set(["pending","requested","approved","denied"]);
const string=(s,max)=>typeof s==="string"&&s.length>0&&s.length<=max&&!/[\u0000-\u001f]/.test(s);
function checkedRow(row,projectId,sessionId){
  if(!row||typeof row!=="object"||Array.isArray(row)||
     !ID.test(row.taskId)||!SHA.test(row.planHash)||
     !string(row.instruction,8000)||!string(row.projectId,1024)||
     !string(row.sessionId,128)||
     row.projectId!==projectId||
     row.historicalSession!==(row.sessionId!==sessionId)||
     !APPROVALS.has(row.approval)||typeof row.cancelled!=="boolean"||
     !Number.isInteger(row.actionsCount)||row.actionsCount<1||row.actionsCount>12||
     !Array.isArray(row.steps)||row.steps.length!==row.actionsCount||
     row.steps.some(x=>!STATUSES.has(x)))
    throw new Error("UNTRUSTED_NATIVE_HISTORY_ROW");
  const uncertain=row.steps.includes("uncertain");
  const fullyVerified=row.steps.every(x=>x==="verified");
  return Object.freeze({
    taskId:row.taskId,planHash:row.planHash,instruction:row.instruction,
    historicalSession:row.historicalSession,approval:row.approval,
    cancelled:row.cancelled,steps:Object.freeze([...row.steps]),
    // This is a display label, NOT a fresh proof of native project state.
    displayStatus:uncertain?"uncertain":row.cancelled?"cancelled":
      fullyVerified?"historical_verified":"incomplete",
    canResume:false
  });
}
export function createNativeHistory({invoke}={}){
  if(typeof invoke!=="function")throw new Error("trusted native invoke required");
  return Object.freeze({
    async recent(){
      // Deliberately no project path, session or task hash in request.
      const reply=await invoke("ai_director_task_history",{});
      if(!reply||reply.readOnly!==true||reply.nativeOwnerBound!==true||
         !string(reply.projectId,1024)||!string(reply.sessionId,128)||
         !Array.isArray(reply.tasks)||reply.tasks.length>50)
        throw new Error("UNTRUSTED_NATIVE_HISTORY");
      const seen=new Set();
      const tasks=reply.tasks.map(row=>{
        const item=checkedRow(row,reply.projectId,reply.sessionId);
        if(seen.has(item.taskId))throw new Error("DUPLICATED_NATIVE_HISTORY_TASK");
        seen.add(item.taskId);
        return item;
      });
      return Object.freeze({projectId:reply.projectId,sessionId:reply.sessionId,
        tasks:Object.freeze(tasks),readOnly:true});
    }
  });
}
