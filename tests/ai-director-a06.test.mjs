// A06 native stop UI bridge with test-double native IPC; no real editor edit.
import test from "node:test";
import assert from "node:assert/strict";
import {createNativeStopController} from "../src/ai-director/native-stop.mjs";
const TASK="task0001",SHA="c".repeat(64);
function response(state,cancelled){
  return {taskId:TASK,planHash:SHA,state,cancelled,durable:true,nativeOwnerBound:true};
}
test("Stop only claims success after native SQLite acknowledged before-first edit",async()=>{
 const calls=[];
 const api=createNativeStopController({invoke:async(cmd,args)=>{
   calls.push({cmd,args});return response("before_first_edit",true);
 }});
 const value=await api.cancel({taskId:TASK,planHash:SHA});
 assert.deepEqual(value,{cancelled:true,state:"before_first_edit",
   nativeAcknowledged:true,taskId:TASK});
 assert.deepEqual(calls,[{cmd:"ai_director_cancel_task",
   args:{request:{taskId:TASK,planHash:SHA}}}]);
});
test("Stop succeeds only between independently verified native steps",async()=>{
 const api=createNativeStopController({invoke:async()=>response("between_verified_steps",true)});
 assert.equal((await api.cancel({taskId:TASK,planHash:SHA})).cancelled,true);
});
test("native step in-flight must not be represented as stopped",async()=>{
 const api=createNativeStopController({invoke:async()=>response("intent_uncertain",false)});
 const result=await api.cancel({taskId:TASK,planHash:SHA});
 assert.equal(result.cancelled,false);assert.equal(result.state,"intent_uncertain");
});
test("a completed task cannot be cancelled after the fact",async()=>{
 const api=createNativeStopController({invoke:async()=>response("already_complete",false)});
 assert.equal((await api.cancel({taskId:TASK,planHash:SHA})).cancelled,false);
});
test("unregistered native stop or fake durability fails closed",async()=>{
 const noNative=createNativeStopController({invoke:async()=>{throw Error("unknown Tauri command");}});
 await assert.rejects(()=>noNative.cancel({taskId:TASK,planHash:SHA}),/unknown Tauri command/);
 const fake=createNativeStopController({invoke:async()=>({...response("before_first_edit",true),durable:false})});
 await assert.rejects(()=>fake.cancel({taskId:TASK,planHash:SHA}),/NATIVE_STOP_ACK_INVALID/);
});
test("wrong plan/owner and contradictory native status are rejected",async()=>{
 const fake=createNativeStopController({invoke:async()=>({...response("before_first_edit",true),planHash:"a".repeat(64)})});
 await assert.rejects(()=>fake.cancel({taskId:TASK,planHash:SHA}),/NATIVE_STOP_ACK_INVALID/);
 const contradictory=createNativeStopController({invoke:async()=>response("intent_uncertain",true)});
 await assert.rejects(()=>contradictory.cancel({taskId:TASK,planHash:SHA}),/NATIVE_STOP_STATE_INVALID/);
});
test("native recovery returns only bounded authoritative step states",async()=>{
 const api=createNativeStopController({invoke:async()=>({
   taskId:TASK,planHash:SHA,durable:true,nativeOwnerBound:true,
   steps:["verified","uncertain","not_started"]})});
 const result=await api.recover({taskId:TASK,planHash:SHA});
 assert.deepEqual(result.steps,["verified","uncertain","not_started"]);
 const fake=createNativeStopController({invoke:async()=>({
   taskId:TASK,planHash:SHA,durable:true,nativeOwnerBound:true,steps:["complete"]})});
 await assert.rejects(()=>fake.recover({taskId:TASK,planHash:SHA}),/NATIVE_RECOVERY_ACK_INVALID/);
});
