// A02 source contract verification. Native provider invoke here is a TEST DOUBLE.
// These tests neither contact OpenAI nor claim the desktop command exists.
import test from "node:test";
import assert from "node:assert/strict";
import {createNativeModelGateway,providerBridgeCommand,validateModelInventory} from "../src/ai-director/provider-gateway.mjs";
import {parseModelProposal,prepareModelPlan} from "../src/ai-director/planner.mjs";
import {buildReviewPreview} from "../src/ai-director/preview.mjs";
import {AiDirector} from "../src/ai-director/director.mjs";

const V_SHA="a".repeat(64),H2="b".repeat(64);
const motion={engine:"motion",projectId:"project.ecproj",sessionId:"host-1",version:2};
const video={engine:"video",projectId:"video.fcproj",sessionId:"video-host-1",version:V_SHA};
const motionIds={compIds:[8],layerIds:[13],maskIds:[4],effectIds:[6]};
const videoIds={clipIds:[10],mediaIds:[9]};
const shape={type:"motion.addShape",compId:8,name:"Rect",kind:"rect",x:12,y:22,width:100,height:70,fill:"#224466"};
const split={type:"video.split",clipId:10,seconds:3};

test("renderer gateway invokes fixed native-only command with no token or filesystem",async()=>{
 const seen=[];
 const provider=createNativeModelGateway({invoke:async(name,args)=>{seen.push({name,args});return JSON.stringify({reason:"Valid",actions:[shape]});}});
 assert.equal(await provider.propose({instruction:"आकार बनाओ",engine:"motion",inventory:motionIds}),
  JSON.stringify({reason:"Valid",actions:[shape]}));
 assert.equal(providerBridgeCommand,"ai_director_model_propose");
 assert.equal(seen[0].name,providerBridgeCommand);
 const text=JSON.stringify(seen);
 assert.doesNotMatch(text,/apiKey|bearer|authorization|openai\.com|workspace|projectId|projectPath/i);
 assert.equal(seen[0].args.request.model,"gpt-4o-mini");
});
test("unregistered or throwing native provider fails closed without exposing backend details",async()=>{
 const bridge=createNativeModelGateway({invoke:async()=>{throw {message:"SECRET_API_KEY",code:"NETWORK"};}});
 await assert.rejects(()=>bridge.propose({instruction:"Create",engine:"motion",inventory:motionIds}),/AI_PROVIDER_NETWORK/);
 const error=await bridge.propose({instruction:"Create",engine:"motion",inventory:motionIds}).catch(e=>e);
 assert.doesNotMatch(error.message,/SECRET_API_KEY/);
});
test("model inventory forbids paths, unknown fields, duplicate IDs and oversized sets",()=>{
 assert.deepEqual(validateModelInventory(videoIds,"video"),videoIds);
 assert.throws(()=>validateModelInventory({...motionIds,projectPath:"C:\\private"},"motion"),/inventory/);
 assert.throws(()=>validateModelInventory({...motionIds,compIds:[8,8]},"motion"),/native IDs/);
 assert.throws(()=>validateModelInventory({...videoIds,clipIds:[-1]},"video"),/native IDs/);
 assert.throws(()=>validateModelInventory({...videoIds,clipIds:Array(129).fill(1)},"video"),/native IDs/);
 assert.throws(()=>validateModelInventory(motionIds,"video"),/editor-specific/);
});
test("strict parser accepts only real typed native IDs and exact action schemas",()=>{
 const plan=parseModelProposal(JSON.stringify({reason:"Place title",actions:[shape]}),"motion",motionIds);
 assert.deepEqual(plan.actions,[shape]);
 assert.throws(()=>parseModelProposal(JSON.stringify({reason:"No",actions:[{...shape,compId:99}]}),"motion",motionIds),/unverified native compId/);
 assert.throws(()=>parseModelProposal(JSON.stringify({reason:"No",actions:[{...shape,exec:"sh"}]}),"motion",motionIds),/unexpected key/);
 assert.throws(()=>parseModelProposal(JSON.stringify({reason:"No",actions:[split]}),"motion",motionIds),/mismatch/);
});
test("model cannot inject arbitrary shell commands, bad tracks or unverified clips",()=>{
 assert.throws(()=>parseModelProposal(JSON.stringify({reason:"bad",actions:[{type:"shell",command:"rm"}]}),"video",videoIds),/unapproved/);
 assert.throws(()=>parseModelProposal(JSON.stringify({reason:"bad",actions:[{...split,clipId:77}]}),"video",videoIds),/unverified native clipId/);
 assert.throws(()=>parseModelProposal(JSON.stringify({reason:"bad",actions:[{type:"video.move",clipId:10,track:"../x",seconds:0,insert:false}]}),"video",videoIds),/invalid native track/);
});
test("model cannot invent layer or mask ID created by earlier step in same plan",()=>{
 const addText={type:"motion.addText",compId:8,name:"Title",text:"नमस्ते",x:10,y:10,size:24};
 const editText={type:"motion.editText",compId:8,layerId:999,text:"later"};
 assert.throws(()=>parseModelProposal(JSON.stringify({reason:"bad",actions:[addText,editText]}),"motion",motionIds),/unverified native layerId/);
});
test("model response JSON must be complete, bounded and contain only reason/actions",()=>{
 assert.throws(()=>parseModelProposal('~~~',"video",videoIds),/not JSON/);
 assert.throws(()=>parseModelProposal(JSON.stringify({reason:"No",actions:[split],tool:"shell"}),"video",videoIds),/unexpected or missing/);
 assert.throws(()=>parseModelProposal(JSON.stringify({reason:"No",actions:[]}),"video",videoIds),/step limit/);
 assert.throws(()=>parseModelProposal(JSON.stringify({reason:"No",actions:Array(13).fill(split)}),"video",videoIds),/step limit/);
 assert.throws(()=>parseModelProposal(JSON.stringify({reason:"\u0000",actions:[split]}),"video",videoIds),/reason invalid/);
});
test("review renders immutable plan, digest, project version and explicit not-approved state",()=>{
 const prepared={taskId:"task1234",planHash:"a".repeat(64),status:"prepared",project:motion,actions:[shape]};
 const review=buildReviewPreview(prepared,"Need a title");
 assert.equal(review.approvalRequired,true);
 assert.equal(review.approved,false);
 assert.equal(review.readyForGuardedExecution,false);
 assert.equal(review.steps[0].requiresNativeVerification,true);
 assert.equal(review.steps[0].description,"Add rect shape Rect to composition #8");
 assert.equal(Object.isFrozen(review.steps),true);
 assert.throws(()=>buildReviewPreview({...prepared,status:"complete"},"Done"),/prepared plan/);
});
function fakeRig(afterModel) {
 let current={...motion}, calls=0, reserved=0;
 const adapter={async readSnapshot(){calls++;return {...current};},
   async executeGuarded(){throw Error("Native execution must never occur during planning");}};
 const approval={async request(){throw Error("Approval must never be requested during planning");}};
 const journal={async reserve(){reserved++;return true;},async append(){}};
 const director=new AiDirector({adapter,approval,journal});
 const gateway={async propose(){if(afterModel)current={...current,version:99};return JSON.stringify({reason:"Simple rectangle",actions:[shape]});}};
 return {adapter,director,gateway,get reserved(){return reserved;},get calls(){return calls;}};
}
test("model planning creates a reserved review but never applies editor action",async()=>{
 const r=fakeRig(false);
 const p=await prepareModelPlan({director:r.director,adapter:r.adapter,gateway:r.gateway,
   taskId:"task9876",instruction:"Make rectangle",inventory:motionIds});
 assert.equal(p.prepared.status,"prepared");
 assert.equal(p.prepared.actions.length,1);
 assert.match(p.prepared.planHash,/^[0-9a-f]{64}$/);
 assert.equal(r.reserved,1);
 assert.equal(buildReviewPreview(p.prepared,p.reason).approved,false);
});
test("manual edit during remote model inference blocks plan before task reservation",async()=>{
 const r=fakeRig(true);
 await assert.rejects(()=>prepareModelPlan({director:r.director,adapter:r.adapter,gateway:r.gateway,
   taskId:"task9877",instruction:"Make rectangle",inventory:motionIds}),/STALE_PROJECT_DURING_MODEL/);
 assert.equal(r.reserved,0);
});
test("native snapshot change during prepare blocks old model proposal",async()=>{
 let n=0, reserved=0;
 const adapter={async readSnapshot(){n++;return {...motion,version:n>=3?4:2};},
   async executeGuarded(){throw Error("must not edit");}};
 const director=new AiDirector({adapter,approval:{async request(){throw Error("not approved");}},
   journal:{async reserve(){reserved++;return true;},async append(){}}});
 await assert.rejects(()=>prepareModelPlan({director,adapter,gateway:{async propose(){
   return JSON.stringify({reason:"safe",actions:[shape]});}},taskId:"task9878",
   instruction:"Make rectangle",inventory:motionIds}),/STALE_PROJECT_DURING_PREPARE/);
 assert.equal(reserved,0);
});
