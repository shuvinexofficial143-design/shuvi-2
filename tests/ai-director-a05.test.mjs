// A05: real code contracts, in-test fake IPC only. No live Windows GUI proof.
import test from "node:test";
import assert from "node:assert/strict";
import {canonicalJson,planDigest} from "../src/ai-director/plan-digest.mjs";
import {createNativeAuditJournal} from "../src/ai-director/native-journal.mjs";
import {AiDirector} from "../src/ai-director/director.mjs";
const SHA="a".repeat(64);
const snapshot={engine:"motion",projectId:"scene.ecproj",version:4,sessionId:"host-session-1"};
const action={type:"motion.addShape",compId:2,name:"Shape",kind:"rect",x:12,y:20,width:120,height:60,fill:"#112233"};
const fullPlan={taskId:"task0001",instruction:"एक rectangle बनाओ",snapshot,actions:[action]};
const EXPECTED="3fbba55c9fb67a596487b13f556469770b59b40f4bf29b3fef51afb1a6cf6a40";
test("canonical SHA-256 has exact Rust cross-language vector (Hindi and typed action)",async()=>{
 assert.equal(await planDigest(fullPlan),EXPECTED);
 assert.deepEqual(JSON.parse(canonicalJson(fullPlan)),fullPlan);
});
test("plan digest is independent of object key insertion order, not action order",async()=>{
 const rekey={actions:[{fill:"#112233",height:60,width:120,y:20,x:12,kind:"rect",name:"Shape",compId:2,type:"motion.addShape"}],
   snapshot:{sessionId:"host-session-1",version:4,projectId:"scene.ecproj",engine:"motion"},
   instruction:"एक rectangle बनाओ",taskId:"task0001"};
 assert.equal(await planDigest(rekey),EXPECTED);
 assert.notEqual(await planDigest({...rekey,actions:[...rekey.actions,{...rekey.actions[0]}]}),EXPECTED);
});
test("hash changes with every authorization-critical edit and context mutation",async()=>{
 for (const p of [
   {...fullPlan,taskId:"task0002"},
   {...fullPlan,instruction:"बदला हुआ prompt"},
   {...fullPlan,snapshot:{...snapshot,version:5}},
   {...fullPlan,snapshot:{...snapshot,sessionId:"host-session-2"}},
   {...fullPlan,actions:[{...action,x:13}]}
 ]) assert.notEqual(await planDigest(p),EXPECTED);
});
test("canonical hashing rejects malicious prototypes and non-finite inputs",async()=>{
 const sneaky=Object.assign(Object.create({hidden:true}),fullPlan);
 await assert.rejects(()=>planDigest(sneaky),/OBJECT_REQUIRED/);
 await assert.rejects(()=>planDigest({...fullPlan,actions:[{...action,x:NaN}]}),/NUMBER_INVALID/);
 await assert.rejects(()=>planDigest({...fullPlan,actions:[{...action,x:Infinity}]}),/NUMBER_INVALID/);
});
test("native journal reserves entire validated plan, never project-only metadata",async()=>{
 const calls=[];
 const journal=createNativeAuditJournal({invoke:async(cmd,args)=>{
    calls.push({cmd,args});
    if(cmd==="ai_director_reserve_plan")
      return {reserved:true,nativeOwnerBound:true,durable:true,taskId:args.request.taskId,planHash:args.request.planHash};
    return {persisted:true,taskId:args.request.taskId};
 }});
 assert.equal(await journal.reserve({taskId:"task0001",planHash:EXPECTED,project:snapshot,plan:fullPlan}),true);
 assert.equal(calls.length,1);
 assert.equal(calls[0].cmd,"ai_director_reserve_plan");
 assert.equal(calls[0].args.request.plan.actions[0].type,"motion.addShape");
 assert.equal(calls[0].args.request.plan.instruction,"एक rectangle बनाओ");
 assert.deepEqual(calls[0].args.request.project,snapshot);
});
test("changed plan or project cannot reach the native reservation command",async()=>{
 const commands=[];
 const journal=createNativeAuditJournal({invoke:async(cmd)=>{commands.push(cmd);return {reserved:true,durable:true,nativeOwnerBound:true,taskId:"task0001",planHash:EXPECTED};}});
 await assert.rejects(()=>journal.reserve({taskId:"task0001",planHash:EXPECTED,project:snapshot,plan:{...fullPlan,actions:[{...action,x:13}]}}),/hash mismatch/);
 await assert.rejects(()=>journal.reserve({taskId:"task0001",planHash:EXPECTED,project:{...snapshot,version:5},plan:fullPlan}),/hash mismatch/);
 await assert.rejects(()=>journal.reserve({taskId:"task0001",planHash:EXPECTED,project:snapshot}),/complete typed plan/);
 assert.deepEqual(commands,[]);
});
test("missing native journal, false durability or fake receipt blocks reservation",async()=>{
 const reject=createNativeAuditJournal({invoke:async()=>({reserved:true,nativeOwnerBound:true,durable:false,taskId:"task0001",planHash:EXPECTED})});
 assert.equal(await reject.reserve({taskId:"task0001",planHash:EXPECTED,project:snapshot,plan:fullPlan}),false);
 const missing=createNativeAuditJournal({invoke:async()=>{throw Error("unregistered Tauri command");}});
 await assert.rejects(()=>missing.reserve({taskId:"task0001",planHash:EXPECTED,project:snapshot,plan:fullPlan}),/unregistered/);
});
test("native audit events are strict, cannot silently become approval",async()=>{
 const calls=[];
 const journal=createNativeAuditJournal({invoke:async(cmd,args)=>{calls.push({cmd,args});return {persisted:true,taskId:args.request.taskId};}});
 await journal.append({event:"approved",taskId:"task0001",planHash:EXPECTED,
   // never forward extra model-provided fields into native
   granted:true,apiKey:"SECRET",remoteCommand:"shell"});
 assert.equal(calls[0].cmd,"ai_director_record_audit");
 assert.deepEqual(calls[0].args.request,{event:"approved",taskId:"task0001",planHash:EXPECTED});
 await assert.rejects(()=>journal.append({event:"grant_native_consent",taskId:"task0001"}),/unapproved/);
 await assert.rejects(()=>journal.append({event:"step_intent",taskId:"task0001",index:12}),/step/);
});
test("A05 director passes native complete plan and its same canonical digest",async()=>{
 let observed=null;
 const reader={async readSnapshot(){return structuredClone(snapshot);},
   async executeGuarded(){throw Error("not an editor test");}};
 const approval={async request(){throw Error("not approving in planning");}};
 const journal={async reserve(record){observed=record;return true;},async append(){}};
 const director=new AiDirector({adapter:reader,approval,journal});
 const p=await director.prepare({taskId:"task0001",instruction:fullPlan.instruction,actions:[action]});
 assert.equal(p.planHash,EXPECTED);
 assert.equal(p.instruction,fullPlan.instruction);
 assert.equal(observed.planHash,EXPECTED);
 assert.equal(await planDigest(observed.plan),EXPECTED);
 assert.deepEqual(observed.plan,fullPlan);
});
