// A01 isolated tests: fakeAdapter/fakeApproval are TEST DOUBLES, not desktop proof.
import test from "node:test";
import assert from "node:assert/strict";
import {AiDirector} from "../src/ai-director/director.mjs";
import {allowedActions, validateDraft, validateAction, validateSnapshot, sameSnapshot} from "../src/ai-director/contracts.mjs";
import {describeNativeCall} from "../src/ai-director/native-contract.mjs";

const TASK = "task0001";
const HASH = "a".repeat(64);
const split = {type:"video.split", clipId:5, seconds:2};
const shape = {type:"motion.addShape",compId:1,name:"Plate",kind:"rect",x:40,y:50,width:120,height:80,fill:"#123456"};
const textAction = {type:"motion.addText",compId:1,name:"Title",text:"नमस्ते Shuvi",x:20,y:30,size:24};
const transform = {type:"motion.setTransform",compId:1,layerId:2,kind:"opacity",x:null,y:null,value:45};
const vector = {type:"motion.setTransform",compId:1,layerId:2,kind:"position",x:50,y:70,value:null};
function snapshot(engine="motion",v=4) {
  return {engine,projectId:engine==="motion"?"workspace:project.ecproj":"/owner/movie.fcproj",
    version:engine==="motion"?v:HASH,sessionId:"host-session-1"};
}
function rig({engine="motion",approval,execute,journalHook,readHook,reserved=new Set()}={}) {
  let current=snapshot(engine);
  const events=[], calls=[];
  let director;
  const adapter={
    async readSnapshot(){if (readHook) await readHook({current,calls,events});return structuredClone(current);},
    async executeGuarded(request){
      calls.push(request);
      if (execute) return execute(request,{current,setCurrent:v=>{current=v;}});
      current={...current,version:engine==="motion"?current.version+1:"b".repeat(64)};
      return {guarded:true,nativeVerified:true,idempotencyKey:request.idempotencyKey,after:structuredClone(current)};
    }
  };
  const gateway={async request(preview){
    if (approval) return approval(preview,()=>director.cancel(TASK));
    return {granted:true,taskId:preview.taskId,planHash:preview.planHash};
  }};
  const journal={async reserve(record){if(reserved.has(record.taskId))return false;reserved.add(record.taskId);return true;},async append(event){ if (journalHook) await journalHook(event,{current,events,setCurrent:v=>{current=v;}});events.push(event); }};
  director=new AiDirector({adapter,approval:gateway,journal});
  return {director,events,calls,adapter,journal,get current(){return current;},set current(x){current=x;}};
}
async function prepare(r,actions=[shape]) {
  return r.director.prepare({taskId:TASK,instruction:"Create and edit title",actions});
}

test("allowlist has only explicit FilmCraft and EffectCraft editing actions",()=>{
  assert.ok(allowedActions.length>=10);
  assert.ok(allowedActions.every(t=>t.startsWith("video.")||t.startsWith("motion.")));
  assert.throws(()=>validateAction({type:"shell",command:"whoami"},"motion"),/unapproved/);
  assert.throws(()=>validateAction({type:"motion.execute",code:"anything"},"motion"),/unapproved/);
});
test("reject arbitrary/extra properties and cross-editor commands",()=>{
  assert.throws(()=>validateAction({...shape,command:"shell"},"motion"),/unexpected key/);
  assert.throws(()=>validateAction(split,"motion"),/mismatch/);
  assert.throws(()=>validateAction({...shape,type:"motion.addText"},"motion"),/unexpected key|missing key/);
});
test("reject nonfinite numbers, unsafe RGB and invalid ids",()=>{
  assert.throws(()=>validateAction({...shape,x:NaN},"motion"),/invalid number/);
  assert.throws(()=>validateAction({...shape,fill:"javascript:alert(1)"},"motion"),/RGB/);
  assert.throws(()=>validateAction({...shape,compId:0},"motion"),/invalid number/);
  assert.throws(()=>validateAction({...shape,width:Infinity},"motion"),/invalid number/);
});
test("validate scalar and vector transforms against actual worker shape",()=>{
  assert.equal(validateAction(transform,"motion").value,45);
  assert.equal(validateAction(vector,"motion").x,50);
  assert.throws(()=>validateAction({...vector,value:2},"motion"),/vector transform/);
  assert.throws(()=>validateAction({...transform,x:2},"motion"),/scalar transform/);
  assert.throws(()=>validateAction({...transform,value:120},"motion"),/opacity/);
});
test("reject invalid video place and unsafe trim fields",()=>{
  const place={type:"video.place",itemId:5,track:"V1",seconds:1,video:false,audio:false};
  assert.throws(()=>validateAction(place,"video"),/requires audio or video/);
  assert.throws(()=>validateAction({...place,video:true,seconds:-1},"video"),/invalid number/);
  assert.throws(()=>validateAction({type:"video.trim",clipId:5,edge:"other",ripple:false,deltaFrames:4},"video"),/edge/);
});
test("project snapshots require genuine exact Video SHA or Motion revision",()=>{
  assert.equal(validateSnapshot(snapshot("video")).version,HASH);
  assert.throws(()=>validateSnapshot({...snapshot("video"),version:"123"}),/SHA-256/);
  assert.throws(()=>validateSnapshot({...snapshot(),version:1.5}),/revision/);
  assert.throws(()=>validateSnapshot({...snapshot(),sessionId:""}),/sessionId/);
});
test("strict plans reject prototype tricks, extra fields and >12 steps",()=>{
  const input={taskId:TASK,instruction:"Create",snapshot:snapshot(),actions:[shape]};
  assert.equal(validateDraft(input).actions.length,1);
  assert.throws(()=>validateDraft({...input,actions:Array(13).fill(shape)}),/1-12/);
  assert.throws(()=>validateDraft({...input,taskId:"bad"}),/task id/);
  assert.throws(()=>validateAction(Object.assign(Object.create({hidden:true}),shape),"motion"),/prototype/);
});
test("new director requires approval, adapter and journal ports",()=>{
  assert.throws(()=>new AiDirector({}),/native editor adapter/);
  assert.throws(()=>new AiDirector({adapter:rig().adapter}),/approval gateway/);
});
test("preparation only reads editor, journals, and creates reviewable immutable plan",async()=>{
  const r=rig();
  const p=await prepare(r);
  assert.equal(p.status,"prepared");
  assert.equal(p.actions[0].type,"motion.addShape");
  assert.match(p.planHash,/^[0-9a-f]{64}$/);
  assert.deepEqual(r.calls,[]);
  assert.deepEqual(r.events.map(x=>x.event),["prepared"]);
  p.actions[0].name="Changed view";
  assert.equal(r.director.get(TASK).actions[0].name,"Plate");
});
test("explicit denial produces no native edits",async()=>{
  const r=rig({approval:async p=>({granted:false,taskId:p.taskId,planHash:p.planHash})});
  await prepare(r);
  const result=await r.director.run(TASK);
  assert.equal(result.status,"denied");
  assert.equal(r.calls.length,0);
});
test("mismatched approval hash is denied without execution",async()=>{
  const r=rig({approval:async p=>({granted:true,taskId:p.taskId,planHash:"wrong"})});
  await prepare(r);
  assert.equal((await r.director.run(TASK)).status,"denied");
  assert.equal(r.calls.length,0);
});
test("approved guarded native readback records verified receipt",async()=>{
  const r=rig();
  const initial=await prepare(r,[shape,textAction]);
  const result=await r.director.run(TASK);
  assert.equal(result.status,"complete");
  assert.equal(result.receipts.length,2);
  assert.notEqual(result.receipts[0].idempotencyKey,result.receipts[1].idempotencyKey);
  assert.equal(result.receipts[0].nativeVerified,true);
  assert.ok(r.events.find(x=>x.event==="approved"));
  assert.deepEqual(r.events.filter(x=>x.event==="step_intent").length,2);
  assert.deepEqual(r.events.filter(x=>x.event==="step_verified").length,2);
  assert.equal(r.events.at(-1).event,"complete");
  assert.equal(initial.project.version,4);
  assert.equal(result.receipts[1].after.version,6);
});
test("single-use task cannot replay approval or apply twice",async()=>{
  const r=rig();
  await prepare(r);
  assert.equal((await r.director.run(TASK)).status,"complete");
  await assert.rejects(()=>r.director.run(TASK),/already consumed/);
  await assert.rejects(()=>prepare(r),/duplicate task/);
  assert.equal(r.calls.length,1);
});
test("concurrent runs cannot double-request consent",async()=>{
  let release,requested=0;
  const wait=new Promise(resolve=>{release=resolve;});
  const r=rig({approval:async p=>{requested++;await wait;return {granted:true,taskId:p.taskId,planHash:p.planHash};}});
  await prepare(r);
  const running=r.director.run(TASK);
  await assert.rejects(()=>r.director.run(TASK),/already consumed/);
  release();
  assert.equal((await running).status,"complete");
  assert.equal(requested,1);
});
test("fresh manual edit after preview invalidates approval before any action",async()=>{
  const r=rig({approval:async p=>{
    r.current={...r.current,version:8};
    return {granted:true,taskId:p.taskId,planHash:p.planHash};
  }});
  await prepare(r);
  const result=await r.director.run(TASK);
  assert.equal(result.status,"blocked");
  assert.match(result.error,/STALE_PROJECT/);
  assert.equal(r.calls.length,0);
});
test("manual change between two native edits blocks second action",async()=>{
  const r=rig({journalHook:async (e,ctx)=>{
    if(e.event==="step_verified") ctx.setCurrent({...ctx.current,version:99});
  }});
  await prepare(r,[shape,textAction]);
  const result=await r.director.run(TASK);
  assert.equal(result.status,"blocked");
  assert.equal(result.receipts.length,1);
  assert.equal(r.calls.length,1);
});
test("changed native editor session rejects stale plan",async()=>{
  const r=rig({approval:async p=>{r.current={...r.current,sessionId:"new-host"};return {granted:true,taskId:p.taskId,planHash:p.planHash};}});
  await prepare(r);
  assert.equal((await r.director.run(TASK)).status,"blocked");
  assert.equal(r.calls.length,0);
});
test("native error after intent is UNCERTAIN, never retried",async()=>{
  const r=rig({execute:async()=>{throw new Error("IPC timeout after commit");}});
  await prepare(r);
  const result=await r.director.run(TASK);
  assert.equal(result.status,"uncertain");
  assert.match(result.error,/NATIVE_OUTCOME_UNKNOWN/);
  assert.equal(r.calls.length,1);
});
test("success flag without native verification must not become completed",async()=>{
  const r=rig({execute:async(req,ctx)=>{ctx.setCurrent({...ctx.current,version:5});return {guarded:true,nativeVerified:false,idempotencyKey:req.idempotencyKey,after:ctx.current};}});
  await prepare(r);
  assert.equal((await r.director.run(TASK)).status,"uncertain");
});
test("native verification requires exact idempotency key",async()=>{
  const r=rig({execute:async(req,ctx)=>{ctx.setCurrent({...ctx.current,version:5});return {guarded:true,nativeVerified:true,idempotencyKey:"mismatch",after:ctx.current};}});
  await prepare(r);
  assert.equal((await r.director.run(TASK)).status,"uncertain");
});
test("claimed readback must match newly observed native state",async()=>{
  const r=rig({execute:async(req,ctx)=>{ctx.setCurrent({...ctx.current,version:7});return {guarded:true,nativeVerified:true,idempotencyKey:req.idempotencyKey,after:{...ctx.current,version:6}};}});
  await prepare(r);
  assert.equal((await r.director.run(TASK)).status,"uncertain");
});
test("missing project change is rejected even with claimed success",async()=>{
  const r=rig({execute:async(req,ctx)=>({guarded:true,nativeVerified:true,idempotencyKey:req.idempotencyKey,after:ctx.current})});
  await prepare(r);
  const result=await r.director.run(TASK);
  assert.equal(result.status,"uncertain");
  assert.match(result.error,/READBACK_MISMATCH/);
});
test("cancel before approval prevents native execution",async()=>{
  const r=rig();
  await prepare(r);
  assert.equal(r.director.cancel(TASK),true);
  await assert.rejects(()=>r.director.run(TASK),/already consumed/);
  assert.equal(r.calls.length,0);
});
test("cancel while approval pending rejects all native actions",async()=>{
  const r=rig({approval:async (p,cancel)=>{cancel();return {granted:true,taskId:p.taskId,planHash:p.planHash};}});
  await prepare(r);
  assert.equal((await r.director.run(TASK)).status,"cancelled");
  assert.equal(r.calls.length,0);
});
test("cancel after verified first step stops future steps",async()=>{
  const r=rig({journalHook:async e=>{if(e.event==="step_verified") r.director.cancel(TASK);}});
  await prepare(r,[shape,textAction]);
  const x=await r.director.run(TASK);
  assert.equal(x.status,"cancelled");
  assert.equal(x.receipts.length,1);
  assert.equal(r.calls.length,1);
});
test("audit failure before editing is fail-closed",async()=>{
  const r=rig({journalHook:async e=>{if(e.event==="step_intent")throw Error("audit unavailable");}});
  await prepare(r);
  const result=await r.director.run(TASK);
  assert.equal(result.status,"blocked");
  assert.equal(r.calls.length,0);
});
test("audit failure after native edit preserves UNCERTAIN outcome",async()=>{
  const r=rig({journalHook:async e=>{if(e.event==="step_verified")throw Error("durable receipt failed");}});
  await prepare(r);
  assert.equal((await r.director.run(TASK)).status,"uncertain");
  assert.equal(r.calls.length,1);
});
test("video snapshot SHA advances across guarded edits",async()=>{
  const r=rig({engine:"video"});
  await prepare(r,[split]);
  const result=await r.director.run(TASK);
  assert.equal(result.status,"complete");
  assert.equal(result.receipts[0].before.version,HASH);
  assert.equal(result.receipts[0].after.version,"b".repeat(64));
});
test("static native mapping uses only actual IPC names and trusted project binding",()=>{
  const m=describeNativeCall(shape,{snapshot:snapshot()});
  assert.equal(m.command,"motion_command");
  assert.equal(m.args.request.action,"addShape");
  assert.equal(m.readyForGuardedExecution,false);
  const v=describeNativeCall(split,{snapshot:snapshot("video"),selectedRoot:"/owner",projectPath:"/owner/movie.fcproj",sessionRevision:8});
  assert.equal(v.command,"video_timeline_apply");
  assert.equal(v.args.request.expectedProjectSha256,HASH);
  assert.equal(v.args.request.actions[0].type,"split");
  assert.equal(v.readyForGuardedExecution,false);
  assert.throws(()=>describeNativeCall(split,{snapshot:snapshot("video"),selectedRoot:"/owner",projectPath:"/wrong",sessionRevision:8}),/owner-selected video project binding required/);
});
test("snapshot equality is exact, not session-revision guesswork",()=>{
  const a=snapshot();
  assert.equal(sameSnapshot(a,{...a}),true);
  assert.equal(sameSnapshot(a,{...a,sessionId:"changed"}),false);
});

test("atomic durable reservation blocks replay after simulated application restart",async()=>{
  const reserved=new Set();
  const first=rig({reserved});
  await prepare(first);
  const second=rig({reserved});
  await assert.rejects(()=>prepare(second),/already reserved/);
  assert.equal(second.calls.length,0);
});
