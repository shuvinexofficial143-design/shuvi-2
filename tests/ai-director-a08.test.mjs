// A08: strict connected owner-receipt proof across native Desktop and Director.
// Mock transport/editor used only for deterministic contract tests.
import test from "node:test";
import assert from "node:assert/strict";
import {AiDirector} from "../src/ai-director/director.mjs";
import {createGuardedDesktopAdapter} from "../src/ai-director/desktop-bridge.mjs";
const TASK="taskproof0001",HASH="e".repeat(64),VALID="a".repeat(64);
const base={engine:"motion",projectId:"owner/project.ecproj",
  sessionId:"owner-session-1234",version:8};
const shape={type:"motion.addShape",compId:1,name:"Badge",kind:"rect",
  x:0,y:0,width:300,height:120,fill:"#aaccee"};
const caps={version:1,nativeGuarded:true,sameOwnerAsManual:true,
  ownerConsent:true,durableIdempotency:true,independentObjectReadback:true};
function connectedProof(response){
  let executed=0,version=8,committed=false;
  const invoke=async(name,args)=>{
    if(name==="ai_director_capabilities")return caps;
    if(name==="ai_director_execute_guarded"){
      executed++;
      version+=1;
      return {guarded:true,nativeVerified:true,taskId:args.request.taskId,
        stepIndex:args.request.stepIndex,idempotencyKey:args.request.idempotencyKey,
        objectProofSha256:VALID,
        after:{...base,version},...(response??{})};
    }
    throw Error("unregistered command");
  };
  const reader={async readSnapshot(){return {...base,version};}};
  const adapter=createGuardedDesktopAdapter({invoke,readback:reader});
  const journal={async reserve(){return true},async append(){}};
  const approval={async request({taskId,planHash}){return {granted:true,taskId,planHash};}};
  const stop={async cancel(){throw Error("unused");},async recover(){throw Error("unused");}};
  const director=new AiDirector({adapter,approval,journal,nativeStop:stop});
  return {director,get executed(){return executed}};
}
async function run(x){
  await x.director.prepare({taskId:TASK,instruction:"Create shape",actions:[shape]});
  return x.director.run(TASK);
}
test("connected verified receipt exposes exact object hash in Director result",async()=>{
  const rig=connectedProof();
  const value=await run(rig);
  assert.equal(value.status,"complete");
  assert.equal(value.receipts.length,1);
  assert.equal(value.receipts[0].objectProofSha256,VALID);
  assert.equal(value.receipts[0].idempotencyKey.length,64);
  assert.equal(rig.executed,1);
});
for(const [label,response] of [
  ["incorrect task id",{taskId:"other-task-0001"}],
  ["incorrect step index",{stepIndex:1}],
  ["missing object proof",{objectProofSha256:undefined}],
  ["invalid object proof",{objectProofSha256:"not-a-digest"}],
  ["false native result",{nativeVerified:false}],
  ["wrong native key",{idempotencyKey:HASH}]
]){
  test("connected editing rejects "+label,async()=>{
    const rig=connectedProof(response);
    const result=await run(rig);
    assert.equal(result.status,"uncertain");
    assert.equal(result.receipts.length,0);
    assert.equal(rig.executed,1);
    assert.match(result.error,/NATIVE_OUTCOME_UNKNOWN|NATIVE_PROOF_MISSING/);
  });
}
test("native guarded result cannot silently switch project/session",async()=>{
  const rig=connectedProof({after:{...base,projectId:"other/file.ecproj",version:9}});
  const value=await run(rig);
  assert.equal(value.status,"uncertain");
});
test("read-only unintegrated host never calls native mutation",async()=>{
  let calls=[];
  const readback={async readSnapshot(){return base;}};
  const adapter=createGuardedDesktopAdapter({readback,invoke:async cmd=>{
    calls.push(cmd);return {version:1,nativeGuarded:false};
  }});
  await assert.rejects(()=>adapter.executeGuarded({action:shape,expectedSnapshot:base,
    idempotencyKey:VALID,taskId:TASK,stepIndex:0}),/NATIVE_AI_GUARD_NOT_READY/);
  assert.deepEqual(calls,["ai_director_capabilities"]);
});
