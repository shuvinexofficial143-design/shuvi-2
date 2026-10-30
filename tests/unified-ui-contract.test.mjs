import test from "node:test";
import assert from "node:assert/strict";
import {createWorkspaceController,clipsFromSequence} from "../src/unified-workspace/core.mjs";
const sha=n=>String(n).repeat(64);
function setup(){
  let revision=1,hash=sha(1),motionRev=0,layers=[];
  const calls=[];
  const bridge={
    calls,
    async videoSnapshot(root,path){calls.push(["snapshot",path]);return {projectPath:path,projectSha256:hash,sessionRevision:revision,
      project:{root:{children:[]}},sequence:{video:[{items:[{clip:3,item:6,name:"Native Clip",start:0,duration:254016000000}]}]}};},
    async videoTimeline(req){calls.push(["timeline",req]);assert.equal(req.expectedProjectSha256,hash);revision++;hash=sha(revision);
      return {projectSha256:hash,commands:[{id:"native",ok:true}]};},
    async videoImport(root,path,source){calls.push(["import",source]);revision++;hash=sha(revision);return {projectSha256:hash};},
    async videoPreview(req){calls.push(["preview",req]);return {projectSha256:hash,pngBytes:[137,80,78,71]};},
    async videoExport(req){calls.push(["export",req]);return {projectSha256:hash,outputPath:req.outputPath,outputBytes:512};},
    async videoRestore(req){calls.push(["restore",req]);revision++;hash=sha(revision);return {projectSha256:hash};},
    async motion(req){
      calls.push(["motion",req.action]);
      if(req.action==="status")return {ready:true,native:true,projectRevision:motionRev,dirty:true};
      if(req.action==="createComposition"){motionRev++;return {id:7,name:req.name,revision:motionRev};}
      if(req.action==="listLayers")return layers.slice();
      if(req.action==="addText"){motionRev++;const l={id:9,name:req.name,kind:"text"};layers.push(l);return l;}
      if(req.action==="render")return {source:"native-effectcraft",revision:motionRev,pngBase64:"iVBORw0KGgo"};
      if(req.action==="saveProject")return {verifiedFromDisk:true,bytes:250};
      if(req.action==="openProject")return {verifiedFromDisk:true,compositions:[{id:7,name:"Readback"}]};
      if(req.action==="exportPng")return {verifiedFromDisk:true,bytes:130,source:"native-effectcraft"};
      throw Error("Unrecognized test action: "+req.action);
    }
  };
  return {bridge,control:createWorkspaceController(bridge),setHash:n=>{hash=sha(n);}};
}
test("real FilmCraft SHA and revision are used by editing and readback",async()=>{
  const {control,bridge}=setup();
  await control.refreshVideo("C:\\a","C:\\a\\x.fcproj");
  const receipt=await control.applyVideo([{type:"split",clipId:3,seconds:.5}]);
  assert.equal(receipt.projectSha256,sha(2));
  assert.equal(control.getState().video.snapshot.projectSha256,sha(2));
  assert.equal(bridge.calls.filter(x=>x[0]==="timeline").length,1);
});
test("valid real native video preview and export receipts are surfaced",async()=>{
  const {control}=setup();
  await control.refreshVideo("C:\\a","C:\\a\\x.fcproj");
  assert.deepEqual((await control.renderVideo(0)).pngBytes,[137,80,78,71]);
  assert.equal((await control.exportVideo("C:\\a\\out.mp4")).outputBytes,512);
  await control.importVideo("C:\\a\\movie.mp4");
  assert.equal(control.getState().video.snapshot.projectSha256,sha(2));
});
test("no native edit before explicit owner permission",async()=>{
  const {control,bridge}=setup();
  await control.refreshVideo("C:\\a","C:\\a\\x.fcproj");
  const task=control.stageAiVideoTask([{type:"split",clipId:3,seconds:.5}],sha(1));
  assert.equal(bridge.calls.filter(x=>x[0]==="timeline").length,0);
  await assert.rejects(control.approveTask("wrong"),{code:"APPROVAL_REQUIRED"});
  await control.approveTask(task.id);
  assert.equal(bridge.calls.filter(x=>x[0]==="timeline").length,1);
  await assert.rejects(control.approveTask(task.id),{code:"APPROVAL_REQUIRED"});
});
test("stale AI plans and unsupported operations are refused",async()=>{
  const {control,bridge}=setup();
  await control.refreshVideo("C:\\a","C:\\a\\x.fcproj");
  assert.throws(()=>control.stageAiVideoTask([{type:"undo"}],sha(9)),{code:"REVISION_CONFLICT"});
  await assert.rejects(control.applyVideo([{type:"shell",command:"delete files"}]),{code:"UNSUPPORTED_ACTION"});
  assert.equal(bridge.calls.filter(x=>x[0]==="timeline").length,0);
  const pending=control.stageAiVideoTask([{type:"undo"}],sha(1));
  control.dismissTask();
  await assert.rejects(control.approveTask(pending.id),{code:"APPROVAL_REQUIRED"});
});
test("native motion revision, real layer readback, PNG render, save and export",async()=>{
  const {control,bridge}=setup();
  await control.motionStatus();
  await control.createComposition({name:"Intro",width:1280,height:720,fps:30,durationSeconds:4});
  await control.editMotion({action:"addText",compId:7,name:"Title",text:"Hello",x:20,y:30,size:50});
  assert.equal(control.getState().motion.layers[0].id,9);
  assert.equal((await control.renderMotion(0)).source,"native-effectcraft");
  assert.equal((await control.saveMotion("C:\\a","x.ecproj")).verifiedFromDisk,true);
  assert.equal((await control.exportMotionPng("C:\\a","x.png")).source,"native-effectcraft");
  assert.ok(bridge.calls.some(x=>x[1]==="render"));
});
test("motion refuses external divergence before native write",async()=>{
  const {control,bridge}=setup();
  await control.createComposition({name:"Intro",width:1280,height:720,fps:30,durationSeconds:4});
  const original=bridge.motion;
  bridge.motion=async req=>req.action==="status"?{ready:true,native:true,projectRevision:17}:original(req);
  await assert.rejects(control.editMotion({action:"addText",compId:7,name:"X",text:"x",x:0,y:0,size:22}),{code:"REVISION_CONFLICT"});
  assert.equal(control.getState().needsReload,true);
});
test("stop never falsely claims native IPC was interrupted",async()=>{
  const {control,bridge}=setup();
  await control.refreshVideo("C:\\a","C:\\a\\x.fcproj");
  let complete;
  bridge.videoTimeline=()=>new Promise(resolve=>{complete=resolve;});
  const pending=control.applyVideo([{type:"undo"}]);
  assert.equal(control.stop(),true);
  complete({projectSha256:sha(2),commands:[{ok:true}]});
  await assert.rejects(pending,{code:"STOP_UNVERIFIED"});
  assert.equal(control.getState().needsReload,true);
  await assert.rejects(control.applyVideo([{type:"undo"}]),{code:"RELOAD_REQUIRED"});
  await control.refreshVideo("C:\\a","C:\\a\\x.fcproj");
  assert.equal(control.getState().needsReload,false);
});
test("switching studio preserves shared native state and chat drafts only",async()=>{
  const {control,bridge}=setup();
  await control.refreshVideo("C:\\a","C:\\a\\x.fcproj");
  control.addDraft("Cut the music");
  control.selectStudio("motion");control.selectStudio("video");
  assert.equal(control.getState().chat.length,3);
  assert.equal(control.getState().video.projectPath,"C:\\a\\x.fcproj");
  assert.equal(bridge.calls.filter(x=>x[0]==="timeline").length,0);
});
test("native sequence time units map to seconds and stable V1 track",()=>{
  const parsed=clipsFromSequence({video:[{items:[{clip:1,item:2,name:"A",start:254016000000,duration:508032000000}]}]});
  assert.deepEqual([parsed[0].track,parsed[0].start,parsed[0].duration],["V1",1,2]);
});
test("unregistered Tauri commands do not receive fake success",async()=>{
  const {control,bridge}=setup();
  bridge.videoSnapshot=async()=>{throw Error("unknown IPC command video_project_snapshot");};
  await assert.rejects(control.refreshVideo("C:\\a","C:\\a\\x.fcproj"),/unknown IPC command/);
  assert.equal(control.getState().video,null);
  assert.equal(control.getState().progress.includes("failed"),true);
});
