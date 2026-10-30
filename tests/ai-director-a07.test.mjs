// A07: connected native Stop and stored-plan approval contracts.
// Only the IPC transport/editor in these tests is a TEST DOUBLE.
import test from "node:test";
import assert from "node:assert/strict";
import {AiDirector} from "../src/ai-director/director.mjs";
import {createNativeStopController} from "../src/ai-director/native-stop.mjs";
import {createNativeApprovalGateway} from "../src/ai-director/native-approval.mjs";
const TASK="hosttask1234",SHA="a".repeat(64);
const snapshot={engine:"motion",projectId:"native-scene.ecproj",
  sessionId:"effect-owner-001",version:3};
const shape={type:"motion.addShape",compId:4,name:"Rect",kind:"rect",
  x:40,y:40,width:100,height:90,fill:"#112233"};
function rig(cancelReply) {
  let current={...snapshot},executed=0,stops=0,requests=[],resolution;
  const journal={async reserve(){return true},async append(){}};
  const adapter={
    async readSnapshot(){return {...current}},
    async executeGuarded(req){
      executed++;
      if(resolution) await resolution;
      current={...current,version:current.version+1};
      return {guarded:true,nativeVerified:true,idempotencyKey:req.idempotencyKey,after:{...current}};
    }
  };
  const approval={async request({taskId,planHash}){
    return {granted:true,taskId,planHash};
  }};
  const nativeStop=createNativeStopController({invoke:async(cmd,args)=>{
    requests.push({cmd,args});
    if(cmd==="ai_director_cancel_task"){
      stops++;
      return {taskId:TASK,planHash:args.request.planHash,
        nativeOwnerBound:true,durable:true,...cancelReply};
    }
    return {taskId:TASK,planHash:args.request.planHash,
      nativeOwnerBound:true,durable:true,steps:["not_started"]};
  }});
  const director=new AiDirector({adapter,approval,journal,nativeStop});
  return {director,requests,get executed(){return executed},get stops(){return stops},
    hold(p){resolution=p},get snapshot(){return current}};
}
async function prepare(r,actions=[shape]){
  return r.director.prepare({taskId:TASK,instruction:"एक shape बनाओ",actions});
}
test("connected Director forbids local-only cancel pretending a native Stop",async()=>{
 const r=rig({cancelled:true,state:"before_first_edit"});
 await prepare(r);
 assert.throws(()=>r.director.cancel(TASK),/NATIVE_STOP_REQUIRED/);
 assert.equal(r.director.get(TASK).status,"prepared");
 assert.equal(r.stops,0);
});
test("native acknowledged cancel persists and blocks subsequent owner approval or edit",async()=>{
 const r=rig({cancelled:true,state:"before_first_edit"});
 await prepare(r);
 const stop=await r.director.stopNative(TASK);
 assert.equal(stop.cancelled,true);
 assert.equal(r.director.get(TASK).status,"cancelled");
 await assert.rejects(()=>r.director.run(TASK),/already consumed/);
 assert.equal(r.executed,0);
 assert.equal(r.stops,1);
});
test("unavailable/uncertain native Stop cannot fabricate success",async()=>{
 const r=rig({cancelled:false,state:"intent_uncertain"});
 await prepare(r);
 const refused=await r.director.stopNative(TASK);
 assert.equal(refused.cancelled,false);
 assert.equal(r.director.get(TASK).status,"prepared");
 assert.match(r.director.get(TASK).error,/STOP_REFUSED/);
 const result=await r.director.run(TASK);
 assert.equal(result.status,"complete");
 assert.equal(r.executed,1);
});
test("failing native Stop cannot set cancelled state before durable acknowledgement",async()=>{
 const nativeStop=createNativeStopController({invoke:async()=>{
   throw new Error("Native command not registered");}});
 const journal={async reserve(){return true},async append(){}};
 const adapter={async readSnapshot(){return {...snapshot}},
   async executeGuarded(){throw Error("should not be called");}};
 const approval={async request(){throw Error("should not prompt");}};
 const director=new AiDirector({adapter,approval,journal,nativeStop});
 await director.prepare({taskId:TASK,instruction:"Create shape",actions:[shape]});
 await assert.rejects(()=>director.stopNative(TASK),/not registered/);
 assert.equal(director.get(TASK).status,"prepared");
});
test("native recovery is read-only; missing/changed steps are not replayed",async()=>{
 const r=rig({cancelled:false,state:"intent_uncertain"});
 await prepare(r);
 const state=await r.director.recoverNative(TASK);
 assert.deepEqual(state.steps,["not_started"]);
 assert.equal(r.executed,0);
 assert.equal(r.director.get(TASK).status,"prepared");
});
test("native approval IPC sends ONLY stored task binding not webview actions",async()=>{
 const calls=[];
 const gateway=createNativeApprovalGateway({invoke:async(command,args)=>{
   calls.push({command,args});
   return {granted:true,taskId:TASK,planHash:SHA,nativeOwnerInteraction:true};
 }});
 const answer=await gateway.request({taskId:TASK,planHash:SHA,project:snapshot,
   actions:[shape],instruction:"Edited renderer preview!"});
 assert.equal(answer.granted,true);
 assert.deepEqual(calls,[{command:"ai_director_request_owner_consent",
   args:{request:{taskId:TASK,planHash:SHA}}}]);
});
test("native denied consent is never invented as approved",async()=>{
 const gateway=createNativeApprovalGateway({invoke:async()=>({
   granted:false,taskId:TASK,planHash:SHA,nativeOwnerInteraction:true})});
 const denied=await gateway.request({taskId:TASK,planHash:SHA,project:snapshot,
   actions:[shape],instruction:"Create shape"});
 assert.equal(denied.granted,false);
});
test("Stop accepted during pending approval prevents any native action",async()=>{
 let release;const pending=new Promise(resolve=>{release=resolve});
 let used=0;
 const adapter={async readSnapshot(){return {...snapshot}},
   async executeGuarded(){used++;throw Error("Never execute")}};
 const journal={async reserve(){return true},async append(){}};
 const stop=createNativeStopController({invoke:async(cmd,args)=>({
   taskId:TASK,planHash:args.request.planHash,NativeOwnerBound:true,
   nativeOwnerBound:true,durable:true,cancelled:true,state:"before_first_edit"})});
 const approval={async request({taskId,planHash}){
   await pending;return {granted:true,taskId,planHash};
 }};
 const director=new AiDirector({adapter,approval,journal,nativeStop:stop});
 await director.prepare({taskId:TASK,instruction:"Make shape",actions:[shape]});
 const running=director.run(TASK);
 const cancel=await director.stopNative(TASK);
 assert.equal(cancel.cancelled,true);
 release();
 const result=await running;
 assert.equal(result.status,"cancelled");
 assert.equal(used,0);
});
