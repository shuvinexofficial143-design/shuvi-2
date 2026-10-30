// A04 IPC contract tests with STUB native transports. No true desktop E2E.
import test from "node:test";
import assert from "node:assert/strict";
import {createStudioReadback,createGuardedDesktopAdapter,aiDesktopCommands} from "../src/ai-director/desktop-bridge.mjs";
import {createNativeApprovalGateway} from "../src/ai-director/native-approval.mjs";
import {AiDirector} from "../src/ai-director/director.mjs";

const SHA="a".repeat(64),SHA2="b".repeat(64);
const videoBinding={engine:"video",sessionId:"owner-video-1",selectedRoot:"/owner",projectPath:"/owner/clip.fcproj"};
const motionBinding={engine:"motion",sessionId:"owner-motion-1",projectId:"workspace:open.ecproj"};
const shape={type:"motion.addShape",compId:2,name:"Title",kind:"rect",x:50,y:50,width:200,height:100,fill:"#ee1177"};
function videoResponse(sha=SHA){return {projectPath:videoBinding.projectPath,projectSha256:sha,sessionRevision:2,project:{revision:2},sequence:{}};}
function motionResponse(revision=3){return {ready:true,native:true,engine:"effectcraft",projectRevision:revision,dirty:true};}
function nativeCaps(){return {version:1,nativeGuarded:true,sameOwnerAsManual:true,ownerConsent:true,durableIdempotency:true,independentObjectReadback:true};}
test("read only FilmCraft snapshot uses actual video_project_snapshot command and disk SHA",async()=>{
 const calls=[];
 const readback=createStudioReadback({ownerBinding:()=>videoBinding,invoke:async(name,args)=>{calls.push({name,args});return videoResponse();}});
 const snap=await readback.readSnapshot();
 assert.equal(snap.engine,"video");assert.equal(snap.projectId,videoBinding.projectPath);
 assert.equal(snap.version,SHA);assert.equal(snap.sessionId,videoBinding.sessionId);
 assert.deepEqual(calls.map(c=>c.name),["video_project_snapshot"]);
 assert.deepEqual(calls[0].args,{selectedRoot:"/owner",projectPath:"/owner/clip.fcproj"});
});
test("read only EffectCraft state uses real motion_command status and session nonce",async()=>{
 const calls=[];
 const readback=createStudioReadback({ownerBinding:()=>motionBinding,invoke:async(name,args)=>{calls.push({name,args});return motionResponse(41);}});
 const snap=await readback.readSnapshot();
 assert.equal(snap.engine,"motion");assert.equal(snap.version,41);
 assert.deepEqual(calls,[{name:"motion_command",args:{request:{action:"status"}}}]);
});
test("reject native Video project path substitution and missing disk SHA",async()=>{
 for(const bad of [{...videoResponse(),projectPath:"/other/file.fcproj"},{...videoResponse(),projectSha256:"wrong"}]){
   const adapter=createStudioReadback({ownerBinding:()=>videoBinding,invoke:async()=>bad});
   await assert.rejects(()=>adapter.readSnapshot(),/native project\/SHA readback invalid/);
 }
});
test("reject motion unready or fabricated local preview",async()=>{
 const readback=createStudioReadback({ownerBinding:()=>motionBinding,invoke:async()=>({...motionResponse(),native:false})});
 await assert.rejects(()=>readback.readSnapshot(),/native owner not ready/);
});
test("owner session replacement during readback invalidates planner state",async()=>{
 let calls=0;
 const readback=createStudioReadback({ownerBinding:()=>{calls++;return {...motionBinding,sessionId:calls===1?"owner-motion-1":"owner-motion-2"};},
  invoke:async()=>motionResponse()});
 await assert.rejects(()=>readback.readSnapshot(),/OWNER_CHANGED_DURING_READBACK/);
});
test("guard interface fails closed while native unified command not registered",async()=>{
 const calls=[];
 const readback={async readSnapshot(){return {engine:"motion",projectId:motionBinding.projectId,sessionId:motionBinding.sessionId,version:3};}};
 const guarded=createGuardedDesktopAdapter({readback,invoke:async(name)=>{calls.push(name);throw Error("unknown Tauri command");}});
 await assert.rejects(()=>guarded.requireReady(),/unknown Tauri command/);
 assert.deepEqual(calls,[aiDesktopCommands.capabilities]);
});
test("native capability handshake rejects any missing atomic owner, consent or ledger gate",async()=>{
 const readback={async readSnapshot(){throw Error("should not read");}};
 for(const gate of ["nativeGuarded","sameOwnerAsManual","ownerConsent","durableIdempotency","independentObjectReadback"]){
   const caps={...nativeCaps(),[gate]:false};
   const adapter=createGuardedDesktopAdapter({readback,invoke:async()=>caps});
   await assert.rejects(()=>adapter.requireReady(),/NATIVE_AI_GUARD_NOT_READY/);
 }
});
test("guarded adapter forbids stale project or unapproved commands before native mutation",async()=>{
 const calls=[],snapshot={engine:"motion",projectId:motionBinding.projectId,sessionId:motionBinding.sessionId,version:7};
 const readback={async readSnapshot(){return snapshot;}};
 const adapter=createGuardedDesktopAdapter({readback,invoke:async(name)=>{calls.push(name);return nativeCaps();}});
 const intent={action:shape,expectedSnapshot:{...snapshot,version:3},idempotencyKey:SHA,taskId:"task0001",stepIndex:0};
 await assert.rejects(()=>adapter.executeGuarded(intent),/STALE_PROJECT_BEFORE_GUARD/);
 assert.deepEqual(calls,[aiDesktopCommands.capabilities]);
 await assert.rejects(()=>adapter.executeGuarded({...intent,action:{type:"shell",code:"id"}}),/unapproved/);
 assert.equal(calls.includes(aiDesktopCommands.executeGuarded),false);
});
test("fake native guarded result without exact affected-object proof never counts as success",async()=>{
 const s={engine:"motion",projectId:motionBinding.projectId,sessionId:motionBinding.sessionId,version:3};
 const readback={async readSnapshot(){return {...s};}};
 const adapter=createGuardedDesktopAdapter({readback,invoke:async(name)=>{
   if(name===aiDesktopCommands.capabilities)return nativeCaps();
   return {guarded:true,nativeVerified:true,idempotencyKey:SHA,taskId:"task0001",stepIndex:0,
     after:{...s,version:4}};
 }});
 await assert.rejects(()=>adapter.executeGuarded({action:shape,expectedSnapshot:s,idempotencyKey:SHA,
   taskId:"task0001",stepIndex:0}),/NATIVE_GUARDED_RECEIPT_INVALID/);
});
test("native approval must reflect exactly matching task and native owner interaction",async()=>{
 const p={taskId:"task0001",planHash:SHA,project:{engine:"motion",projectId:"scene",sessionId:"host-session-1",version:1},
   instruction:"Create rectangle",actions:[shape]};
 let calls=0;
 const approval=createNativeApprovalGateway({invoke:async(name,args)=>{
   assert.equal(name,"ai_director_request_owner_consent");
   assert.equal(args.request.planHash,SHA);calls++;
   return {granted:true,nativeOwnerInteraction:true,taskId:p.taskId,planHash:p.planHash};
 }});
 assert.equal((await approval.request(p)).granted,true);
 const bad=createNativeApprovalGateway({invoke:async()=>({granted:true,nativeOwnerInteraction:false,taskId:p.taskId,planHash:p.planHash})});
 assert.equal((await bad.request(p)).granted,false);
 assert.equal(calls,1);
});
test("fully wired simulated IPC honors ONE native approval and native guarded readback",async()=>{
 // All values below are TEST DOUBLES, not a Windows editing engine.
 let rev=4,approvalCalls=0,guardedCalls=0;
 const invoke=async(name,args)=>{
   if(name==="motion_command"){assert.deepEqual(args,{request:{action:"status"}});return motionResponse(rev);}
   if(name==="ai_director_request_owner_consent"){
     approvalCalls++;
     return {granted:true,nativeOwnerInteraction:true,taskId:args.request.taskId,planHash:args.request.planHash};
   }
   if(name===aiDesktopCommands.capabilities)return nativeCaps();
   if(name===aiDesktopCommands.executeGuarded){
     guardedCalls++;assert.equal(args.request.expectedSnapshot.version,4);
     assert.deepEqual(args.request.action,shape);
     rev=5;
     return {guarded:true,nativeVerified:true,objectProofSha256:SHA2,
       idempotencyKey:args.request.idempotencyKey,taskId:args.request.taskId,stepIndex:0,
       after:{engine:"motion",projectId:motionBinding.projectId,sessionId:motionBinding.sessionId,version:5}};
   }
   throw Error("unexpected command");
 };
 const readback=createStudioReadback({invoke,ownerBinding:()=>motionBinding});
 const adapter=createGuardedDesktopAdapter({invoke,readback});
 const approval=createNativeApprovalGateway({invoke});
 const events=[],used=new Set();
 const journal={async reserve({taskId}){if(used.has(taskId))return false;used.add(taskId);return true;},
   async append(e){events.push(e);}};
 const director=new AiDirector({adapter,approval,journal});
 await director.prepare({taskId:"task0001",instruction:"Create shape",actions:[shape]});
 const result=await director.run("task0001");
 assert.equal(result.status,"complete");
 assert.equal(result.receipts.length,1);
 assert.equal(guardedCalls,1);assert.equal(approvalCalls,1);
 assert.equal(result.receipts[0].after.version,5);
 await assert.rejects(()=>director.run("task0001"),/already consumed/);
 assert.deepEqual(events.filter(e=>e.event==="step_verified").length,1);
});
