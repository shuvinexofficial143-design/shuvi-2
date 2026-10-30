import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {nativeFps,moveDestination,verifyNativeMove,visibleTimelineSeconds} from "../src/unified-workspace/timeline.mjs";
import {workspaceKeyCommand} from "../src/unified-workspace/keyboard.mjs";
import {createWorkspaceController} from "../src/unified-workspace/core.mjs";
const SHA=n=>String(n).repeat(64),T=254016000000;
function setup(){
  let videoSha=SHA("1"),revision=1,motionRev=0;
  let clips=[{clip:7,item:21,start:T,duration:2*T,name:"Verified Media"}];
  let layers=[{id:8,name:"Native Text",kind:"text",position:{x:20,y:30},opacity:100}];
  let effects=[],masks=[],runEdit=null,changedOnEdit=false;
  const calls=[];
  const bridge={
    calls,
    async videoSnapshot(root,path){calls.push(["snapshot",path]);return {projectPath:path,projectSha256:videoSha,sessionRevision:revision,
      project:{root:{children:[]}},sequence:{settings:{frame_rate:{num:30000,den:1001}},duration:12*T,video:[{items:clips}]}};},
    async videoTimeline(req){calls.push(["edit",req]);const move=req.actions.find(a=>a.type==="move");
      if(move&&!changedOnEdit){clips=[{...clips[0],start:Math.round(move.seconds*T)}];}
      if(runEdit)await runEdit();
      revision++;videoSha=SHA("2");
      return {projectSha256:videoSha,commands:[{ok:true}]};},
    async videoImport(){throw Error("not used")},async videoPreview(){throw Error("not used")},
    async videoExport(){throw Error("not used")},async videoRestore(){throw Error("not used")},
    async motion(req){
      calls.push(["motion",req]);
      if(req.action==="status")return {ready:true,native:true,projectRevision:motionRev,dirty:true};
      if(req.action==="createComposition"){motionRev++;return {id:6,revision:motionRev,name:"Timeline Motion",fps:30,durationSeconds:8};}
      if(req.action==="listLayers")return structuredClone(layers);
      if(req.action==="listEffects")return structuredClone(effects);
      if(req.action==="listMasks")return structuredClone(masks);
      if(req.action==="addEffect"){motionRev++;effects.push({uid:33,id:"ec.blur.gaussian",name:"Gaussian Blur",enabled:true});return effects[0];}
      if(req.action==="setEffectParameter"){motionRev++;return {uid:req.uid,parameter:req.parameter,value:req.value,verified:true};}
      if(req.action==="toggleEffect"){motionRev++;effects=effects.map(e=>({...e,enabled:req.enabled}));return effects[0];}
      if(req.action==="removeEffect"){motionRev++;effects=[];return {removed:true,uid:req.uid};}
      if(req.action==="addPolygonMask"){motionRev++;masks=[{uid:44,name:"Polygon",vertices:req.vertices}];return masks[0];}
      if(req.action==="easeKeys"){motionRev++;return {projectRevision:motionRev};}
      throw Error("Unexpected native request "+req.action);
    }
  };
  return {ctrl:createWorkspaceController(bridge),bridge,setChangedOnEdit:v=>changedOnEdit=v,
    interceptEdit:f=>runEdit=f,externalSha:()=>{videoSha=SHA("9")}};
}
test("native FPS is exact rational and no invented fallback permits drag",()=>{
  assert.equal(nativeFps({settings:{frame_rate:{num:30000,den:1001}}}),30000/1001);
  assert.equal(nativeFps({settings:{frameRate:{numerator:25,denominator:1}}}),25);
  assert.equal(nativeFps({settings:{frame_rate:{num:0,den:1}}}),null);
  assert.equal(nativeFps({}),null);
});
test("timeline pointer move quantizes to FilmCraft frame and clamps boundaries",()=>{
  const args={start:1,deltaX:100,laneWidth:1000,visibleSeconds:20,duration:3,fps:25};
  assert.equal(moveDestination(args),3);
  assert.equal(moveDestination({...args,deltaX:-10000}),0);
  assert.equal(moveDestination({...args,deltaX:99999}),17);
  assert.equal(moveDestination({...args,laneWidth:0}),null);
  assert.equal(visibleTimelineSeconds({duration:4*T},[{start:10,duration:5}]),15);
});
test("keyboard never interferes with form inputs or incompatible Motion context",()=>{
  assert.equal(workspaceKeyCommand({key:"Delete",selectedClip:true,editable:true}),null);
  assert.equal(workspaceKeyCommand({key:"z",ctrlKey:true}),"undo");
  assert.equal(workspaceKeyCommand({key:"z",ctrlKey:true,shiftKey:true}),"redo");
  assert.equal(workspaceKeyCommand({key:"y",ctrlKey:true}),"redo");
  assert.equal(workspaceKeyCommand({key:"s",selectedClip:true}),"split");
  assert.equal(workspaceKeyCommand({key:"Delete",selectedClip:false}),null);
  assert.equal(workspaceKeyCommand({key:"ArrowRight"}),"frame-forward");
  assert.equal(workspaceKeyCommand({key:"Delete",selectedClip:true,studio:"motion"}),null);
});
test("native clip move requires fresh project SHA and exact frame readback",async()=>{
  const {ctrl,bridge}=setup();await ctrl.refreshVideo("C:\\work","C:\\work\\a.fcproj");
  await ctrl.moveVideoClip(7,"V1",3);
  assert.equal(ctrl.getState().video.clips[0].start,3);
  assert.equal(bridge.calls.filter(x=>x[0]==="edit").length,1);
  assert.equal(bridge.calls.find(x=>x[0]==="edit")[1].expectedProjectSha256,SHA("1"));
});
test("native receipt with unchanged clip refuses to call UI move complete",async()=>{
  const {ctrl,setChangedOnEdit}=setup();setChangedOnEdit(true);
  await ctrl.refreshVideo("C:\\work","C:\\work\\a.fcproj");
  await assert.rejects(ctrl.moveVideoClip(7,"V1",3),{code:"REVISION_CONFLICT"});
  assert.equal(ctrl.getState().needsReload,true);
  assert.equal(ctrl.getState().recoveryStudio,"video");
});
test("target track kind mismatch blocks native edit before invoking FilmCraft",async()=>{
  const {ctrl,bridge}=setup();await ctrl.refreshVideo("C:\\work","C:\\work\\a.fcproj");
  await assert.rejects(ctrl.moveVideoClip(7,"A1",2),{code:"INVALID_TRACK"});
  assert.equal(bridge.calls.some(x=>x[0]==="edit"),false);
});
test("native effects and masks are re-read after real Motion mutation",async()=>{
  const {ctrl,bridge}=setup();await ctrl.createComposition({name:"Native",width:640,height:360,fps:30,durationSeconds:8});
  await ctrl.inspectMotionLayer(8);
  await ctrl.editMotion({action:"addEffect",compId:6,layerId:8,effect:"gaussianBlur"});
  assert.equal(ctrl.getState().motion.inspector.effects[0].uid,33);
  await ctrl.editMotion({action:"setEffectParameter",compId:6,layerId:8,uid:33,effect:"gaussianBlur",parameter:"blurriness",value:20});
  await ctrl.editMotion({action:"toggleEffect",compId:6,layerId:8,uid:33,enabled:false});
  assert.equal(ctrl.getState().motion.inspector.effects[0].enabled,false);
  await ctrl.editMotion({action:"addPolygonMask",compId:6,layerId:8,vertices:[[-10,-10],[10,-10],[10,10],[-10,10]]});
  assert.equal(ctrl.getState().motion.inspector.masks[0].uid,44);
  assert.equal(bridge.calls.filter(x=>x[1]?.action==="listMasks").length>=3,true);
});
test("effect actions fail closed when native revision changes outside owner",async()=>{
  const {ctrl,externalSha}=setup();await ctrl.createComposition({name:"Native",width:640,height:360,fps:30,durationSeconds:8});
  await ctrl.inspectMotionLayer(8);
  // Motion auto-approval is still disabled despite new manual effect tools.
  assert.equal(ctrl.getState().pendingApproval,null);
  assert.throws(()=>ctrl.stageAiVideoTask([{type:"addEffect"}],SHA("1")),{code:"PROJECT_REQUIRED"});
  externalSha();
});
test("U03 UI contains actual wired native handlers for advanced actions",()=>{
  const src=readFileSync(new URL("../src/desktop-ui/workspace.ts",import.meta.url),"utf8");
  for(const action of ["video-move","motion-add-effect","motion-set-effect","motion-toggle-effect","motion-remove-effect","motion-ease","motion-add-mask"]){
    assert.match(src,new RegExp('data-act="'+action+'"'));
    assert.match(src,new RegExp('case "'+action+'"'));
  }
  assert.match(src,/pointerdown/);assert.match(src,/pointerup/);
  assert.match(src,/workspaceKeyCommand/);
});
