import test from "node:test";
import assert from "node:assert/strict";
import {createNativeHistory} from "../src/ai-director/native-history.mjs";
const HASH="a".repeat(64),P="owner/project.ecproj",S="new-session-001";
const item={taskId:"oldtask0001",planHash:HASH,instruction:"Create title",
  projectId:P,sessionId:"old-session-001",historicalSession:true,
  approval:"approved",cancelled:false,actionsCount:2,
  steps:["verified","uncertain"]};
function rig(reply){
  const calls=[];
  const api=createNativeHistory({invoke:async(cmd,args)=>{
    calls.push({cmd,args});
    return {nativeOwnerBound:true,readOnly:true,projectId:P,sessionId:S,
      tasks:[item],...reply};
  }});
  return {api,calls};
}
test("native task history recovers old project session only as read-only",async()=>{
  const r=rig();
  const result=await r.api.recent();
  assert.deepEqual(r.calls,[{cmd:"ai_director_task_history",args:{}}]);
  assert.equal(result.readOnly,true);
  assert.equal(result.tasks[0].historicalSession,true);
  assert.equal(result.tasks[0].canResume,false);
  assert.equal(result.tasks[0].displayStatus,"uncertain");
  assert.equal(Object.isFrozen(result.tasks),true);
});
test("verified old native task is historical not executable",async()=>{
  const r=rig({tasks:[{...item,steps:["verified","verified"]}]});
  const x=await r.api.recent();
  assert.equal(x.tasks[0].displayStatus,"historical_verified");
  assert.equal(x.tasks[0].canResume,false);
});
test("missing native host or fake read-only/owner proof is rejected",async()=>{
  const unavailable=createNativeHistory({invoke:async()=>{throw Error("Tauri command missing");}});
  await assert.rejects(()=>unavailable.recent(),/missing/);
  for(const overrides of [{readOnly:false},{nativeOwnerBound:false},{tasks:new Array(51).fill(item)}]){
    await assert.rejects(()=>rig(overrides).api.recent(),/UNTRUSTED_NATIVE_HISTORY/);
  }
});
test("history from another project or forged session ownership is rejected",async()=>{
  for(const changed of [{projectId:"other.ecproj"},{historicalSession:false},
    {sessionId:S,historicalSession:true}]){
    await assert.rejects(()=>rig({tasks:[{...item,...changed}]}).api.recent(),
      /UNTRUSTED_NATIVE_HISTORY_ROW/);
  }
});
test("history cannot contain unsupported state or inconsistent step count",async()=>{
  for(const changed of [{steps:["verified","executed"]},{steps:["verified"]},
    {actionsCount:13},{planHash:"not-sha"},{approval:"auto_approved"}]){
    await assert.rejects(()=>rig({tasks:[{...item,...changed}]}).api.recent(),
      /UNTRUSTED_NATIVE_HISTORY_ROW/);
  }
});
test("history must reject repeated task IDs in same result",async()=>{
  await assert.rejects(()=>rig({tasks:[item,{...item}]}).api.recent(),
    /DUPLICATED_NATIVE_HISTORY_TASK/);
});
test("cancelled or not-yet-verified history remains non-executable",async()=>{
  const r=rig({tasks:[{...item,cancelled:true,
    steps:["verified","cancelled"]},{...item,taskId:"newtask0002",
    sessionId:S,historicalSession:false,steps:["not_started","not_started"]}]});
  const x=await r.api.recent();
  assert.equal(x.tasks[0].displayStatus,"cancelled");
  assert.equal(x.tasks[1].displayStatus,"incomplete");
  assert.equal(x.tasks.every(t=>t.canResume===false),true);
});
