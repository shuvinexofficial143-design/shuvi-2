import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createWorkspaceController} from "../src/unified-workspace/core.mjs";
import {nativeDiagnosticReport} from "../src/unified-workspace/diagnostics.mjs";
import {describeApprovalState} from "../src/unified-workspace/approval.mjs";
import {studioRecovery,workspaceActionAvailable} from "../src/unified-workspace/ui-guards.mjs";
const sha=n=>String(n).repeat(64);
function setup(){
  let currentSha=sha("1"),motionRevision=0,failMotion=false;
  const calls=[];
  const bridge={
    async videoSnapshot(root,projectPath){
      calls.push("video-read");
      return {projectPath,projectSha256:currentSha,sessionRevision:1,project:{root:{children:[]}},
        sequence:{settings:{frame_rate:{num:30,den:1}},video:[{locked:false,items:[{clip:4,item:5,name:"Test",start:0,duration:254016000000}]}],audio:[]}};
    },
    async videoTimeline(){calls.push("video-write");return {projectSha256:currentSha,commands:[{ok:true}]};},
    async videoImport(){},async videoPreview(){},async videoExport(){},async videoRestore(){},
    async motion(req){
      calls.push("motion-"+req.action);
      if(req.action==="status")return {native:true,ready:true,projectRevision:motionRevision,dirty:true};
      if(req.action==="createComposition")return {id:6,revision:++motionRevision};
      if(req.action==="inspectComposition")return {id:6,revision:motionRevision};
      if(req.action==="listLayers")return [{id:8,name:"Title",kind:"text"}];
      if(req.action==="listEffects")return [{uid:10,id:"ec.blur.gaussian",name:"Blur",enabled:true}];
      if(req.action==="listMasks")return [{uid:12,name:"Mask"}];
      if(req.action==="addText"){
        motionRevision++;
        if(failMotion)throw Error("native worker timed out after possible edit");
        return {id:9};
      }
      throw Error("unexpected native command "+req.action);
    }
  };
  return {ctrl:createWorkspaceController(bridge),calls,
    changeVideo:()=>{currentSha=sha("9");},
    failMotion:()=>{failMotion=true;}};
}
test("U07 independent recovery flags survive Video + Motion native failures",async()=>{
  const {ctrl,changeVideo,failMotion,calls}=setup();
  await ctrl.refreshVideo("C:\\film","C:\\film\\test.fcproj");
  await ctrl.createComposition({name:"Comp",width:640,height:480,fps:30,durationSeconds:8});
  changeVideo();
  await assert.rejects(ctrl.verifyVideoSnapshot(),{code:"REVISION_CONFLICT"});
  assert.deepEqual(ctrl.getState().recoveryByStudio,{video:true,motion:false});
  ctrl.selectStudio("motion");
  failMotion();
  await assert.rejects(ctrl.editMotion({action:"addText",compId:6,name:"Title",text:"Hi",size:48,x:0,y:0}),/timed out/);
  assert.deepEqual(ctrl.getState().recoveryByStudio,{video:true,motion:true});
  assert.equal(ctrl.getState().needsReload,true);
  assert.equal(ctrl.getState().recoveryStudio,"motion");
  assert.equal(nativeDiagnosticReport(ctrl.getState()).video.status,"recovery-required");
  assert.equal(nativeDiagnosticReport(ctrl.getState()).motion.status,"recovery-required");
  await assert.rejects(ctrl.editMotion({action:"addText",compId:6,name:"Title",text:"Hi",size:48,x:0,y:0}),{code:"RELOAD_REQUIRED"});
  const editCalls=calls.filter(x=>x==="motion-addText").length;
  assert.equal(editCalls,1);
  ctrl.selectStudio("video");
  assert.equal(ctrl.getState().recoveryStudio,"video");
  await ctrl.refreshVideo("C:\\film","C:\\film\\test.fcproj");
  assert.deepEqual(ctrl.getState().recoveryByStudio,{video:false,motion:true});
  assert.equal(ctrl.getState().needsReload,true);
  assert.equal(ctrl.getState().recoveryStudio,"motion");
  assert.equal(nativeDiagnosticReport(ctrl.getState()).video.status,"snapshot-verified");
  assert.equal(nativeDiagnosticReport(ctrl.getState()).motion.status,"recovery-required");
  await ctrl.motionStatus();
  assert.deepEqual(ctrl.getState().recoveryByStudio,{video:false,motion:false});
  assert.equal(ctrl.getState().needsReload,false);
  assert.equal(ctrl.getState().recoveryStudio,null);
});
test("recovery compatibility properties report non-active quarantined studio",async()=>{
  const {ctrl,changeVideo}=setup();
  await ctrl.refreshVideo("C:\\film","C:\\film\\test.fcproj");
  changeVideo();
  await assert.rejects(ctrl.verifyVideoSnapshot(),{code:"REVISION_CONFLICT"});
  ctrl.selectStudio("motion");
  assert.equal(ctrl.getState().recoveryStudio,"video");
  assert.equal(studioRecovery(ctrl.getState(),"video"),true);
  assert.equal(studioRecovery(ctrl.getState(),"motion"),false);
  assert.equal(workspaceActionAvailable(ctrl.getState(),"video-preview"),false);
  assert.equal(workspaceActionAvailable(ctrl.getState(),"video-open"),true);
  assert.equal(workspaceActionAvailable(ctrl.getState(),"motion-status"),true);
});
test("native diagnostics can report BOTH quarantines simultaneously without leaking project details",()=>{
  const state={studio:"video",busy:false,needsReload:true,recoveryStudio:"video",
    recoveryByStudio:{video:true,motion:true},
    video:{projectPath:"C:\\secret",snapshot:{projectSha256:sha("1"),sessionRevision:3},clips:[{clipId:4}]},
    motion:{ready:true,revision:2,composition:{id:6,name:"secret"},layers:[{name:"secret"}]},
    verificationHistory:[]};
  const report=nativeDiagnosticReport(state);
  assert.deepEqual(report.recoveryByStudio,{video:true,motion:true});
  assert.equal(report.video.status,"recovery-required");
  assert.equal(report.video.projectSha256,null);
  assert.equal(report.motion.status,"recovery-required");
  assert.equal(report.motion.projectRevision,null);
  assert.equal(JSON.stringify(report).includes("secret"),false);
});
test("Motion action enablement recalculates after real layer selection and inspection",()=>{
  const state={studio:"motion",busy:false,needsReload:false,
    recoveryByStudio:{video:false,motion:false},motion:{ready:true,revision:7,
      composition:{id:3},layers:[{id:5,kind:"text",name:"Native"}],inspector:null}};
  assert.equal(workspaceActionAvailable(state,"motion-inspect",{layerId:5}),true);
  assert.equal(workspaceActionAvailable(state,"motion-transform",{layerId:5}),false);
  state.motion.inspector={layer:{id:5,kind:"text"},revision:7,effects:[{uid:9}],masks:[{uid:11}]};
  assert.equal(workspaceActionAvailable(state,"motion-transform",{layerId:5}),true);
  assert.equal(workspaceActionAvailable(state,"motion-key",{layerId:5}),true);
  assert.equal(workspaceActionAvailable(state,"motion-edit",{layerId:5}),true);
  assert.equal(workspaceActionAvailable(state,"motion-set-effect",{layerId:5,effectUid:9}),true);
  assert.equal(workspaceActionAvailable(state,"motion-remove-mask",{layerId:5,maskUid:11}),true);
  assert.equal(workspaceActionAvailable(state,"motion-remove-mask",{layerId:5,maskUid:999}),false);
  assert.equal(workspaceActionAvailable(state,"motion-set-effect",{layerId:6,effectUid:9}),false);
  assert.equal(workspaceActionAvailable(state,"motion-set-effect",{layerId:5,effectUid:999}),false);
});
test("stale layer inspector revision disables Motion edits even when IDs are reused",()=>{
  const state={studio:"motion",busy:false,recoveryByStudio:{video:false,motion:false},
    motion:{ready:true,revision:9,composition:{id:3},layers:[{id:5}],
      inspector:{layer:{id:5,kind:"text"},revision:8,effects:[],masks:[]}}};
  assert.equal(workspaceActionAvailable(state,"motion-inspect",{layerId:5}),true);
  assert.equal(workspaceActionAvailable(state,"motion-transform",{layerId:5}),false);
  assert.equal(workspaceActionAvailable(state,"motion-add-effect",{layerId:5}),false);
});
test("recovery presentation permits only recovery operations, not stale edits",()=>{
  const state={studio:"motion",busy:false,recoveryByStudio:{video:true,motion:true},
    motion:{ready:true,revision:3,composition:{id:4},layers:[{id:5}],inspector:{layer:{id:5},revision:3,effects:[],masks:[]}},
    video:{snapshot:{},clips:[]}};
  assert.equal(workspaceActionAvailable(state,"motion-status"),true);
  assert.equal(workspaceActionAvailable(state,"motion-open"),true);
  assert.equal(workspaceActionAvailable(state,"motion-verify"),false);
  assert.equal(workspaceActionAvailable(state,"motion-transform",{layerId:5}),false);
  assert.equal(workspaceActionAvailable(state,"video-open"),true);
  assert.equal(workspaceActionAvailable(state,"video-undo"),false);
  assert.equal(workspaceActionAvailable(state,"diagnostic-copy"),true);
  assert.equal(workspaceActionAvailable(state,"bookmark-forget"),true);
});
test("video clip availability rechecks actual saved lock and selection each time",()=>{
  const video={clips:[{clipId:4,kind:"video",track:"V1"}],
    snapshot:{sequence:{video:[{locked:false}],audio:[]}}};
  const s={studio:"video",busy:false,recoveryByStudio:{video:false,motion:false},video};
  assert.equal(workspaceActionAvailable(s,"video-split",{clipId:4}),true);
  assert.equal(workspaceActionAvailable(s,"video-split",{clipId:99}),false);
  video.snapshot.sequence.video[0].locked=true;
  assert.equal(workspaceActionAvailable(s,"video-split",{clipId:4}),false);
  assert.equal(workspaceActionAvailable(s,"video-move",{clipId:4}),false);
  s.busy=true;
  assert.equal(workspaceActionAvailable(s,"video-open"),false);
  assert.equal(workspaceActionAvailable(s,"stop"),true);
});
test("native task approval remains unavailable when stale, regardless of tab or busy",()=>{
  const s={studio:"video",busy:false,recoveryByStudio:{video:false,motion:false},
    video:{snapshot:{projectSha256:sha("1")}},
    pendingApproval:{id:"task-3",expectedSha:sha("2")}};
  assert.equal(workspaceActionAvailable(s,"approve"),false);
  s.pendingApproval.expectedSha=sha("1");
  assert.equal(workspaceActionAvailable(s,"approve"),true);
  s.busy=true;
  assert.equal(workspaceActionAvailable(s,"approve"),false);
  s.busy=false;s.studio="motion";
  assert.equal(workspaceActionAvailable(s,"approve"),false);
});
test("approval diagnostics distinguish a recovered Motion from still-quarantined Video",()=>{
  const s={studio:"video",busy:false,needsReload:true,recoveryStudio:"video",
    recoveryByStudio:{video:true,motion:false},motion:{ready:true},pendingApproval:null,
    video:{snapshot:{projectSha256:sha("1")}}};
  assert.equal(describeApprovalState(s).eligible,false);
  assert.match(describeApprovalState(s).reason,/recovery/i);
  s.studio="motion";
  assert.doesNotMatch(describeApprovalState(s).reason,/recovery required/);
});
test("U07 source does not use sticky disabled flag and includes studio-specific recovery",()=>{
  const src=readFileSync(new URL("../src/desktop-ui/workspace.ts",import.meta.url),"utf8");
  const core=readFileSync(new URL("../src/unified-workspace/core.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(src,/button\.disabled=button\.disabled/);
  assert.match(src,/button\.disabled=!workspaceActionAvailable/);
  assert.match(src,/studioRecovery\(state,studio as "video"\|"motion"\)/);
  assert.match(src,/render\(ctrl\.getState\(\)\)/);
  assert.match(core,/recoveryByStudio:\{video:false,motion:false\}/);
  assert.match(core,/recoveryByStudio:\{\.\.\.state\.recoveryByStudio,video:false\}/);
  assert.match(core,/recoveryByStudio:\{\.\.\.state\.recoveryByStudio,motion:false\}/);
});
