import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createWorkspaceController} from "../src/unified-workspace/core.mjs";
import {nativeDiagnosticReport,nativeDiagnosticText} from "../src/unified-workspace/diagnostics.mjs";
const SHA=n=>String(n).repeat(64);
function setup(){
  let sha=SHA("1"),vrev=1,mrev=0,failWrite=false,failRead=false,motionWriteFails=false;
  let videoCalls=0;
  const calls=[];
  const bridge={
    calls,
    async videoSnapshot(root,path){
      calls.push("videoSnapshot");
      if(failRead)throw Error("FILMCRAFT_TEMPORARY_UNAVAILABLE");
      return {projectPath:path,projectSha256:sha,sessionRevision:vrev,
        project:{root:{children:[{name:"Original private title",item:7}]}},
        sequence:{video:[{items:[{clip:9,item:7,name:"Owner secret media",start:0,duration:254016000000}]}]}};
    },
    async videoTimeline(req){
      calls.push("videoTimeline");videoCalls++;
      if(failWrite){sha=SHA("2");vrev++;throw Error("native IPC disconnected after possible edit");}
      sha=SHA("2");vrev++;
      return {projectSha256:sha,commands:[{ok:true}]};
    },
    async videoImport(){throw Error("unused");},
    async videoPreview(){throw Error("unused");},
    async videoExport(){throw Error("unused");},
    async videoRestore(){throw Error("unused");},
    async motion(req){
      calls.push("motion:"+req.action);
      if(req.action==="status")return {ready:true,native:true,projectRevision:mrev,dirty:true};
      if(req.action==="createComposition"){mrev++;return {id:13,name:req.name,revision:mrev};}
      if(req.action==="inspectComposition")return {id:13,name:"Native",revision:mrev};
      if(req.action==="listLayers")return [{id:3,name:"Owner private title",kind:"text",keyframes:0}];
      if(req.action==="addText"){
        mrev++;
        if(motionWriteFails)throw Error("Motion IPC timeout after write");
        return {id:4,kind:"text"};
      }
      if(req.action==="openProject")return {verifiedFromDisk:true,compositions:[{id:13,name:"Native"}]};
      throw Error("unexpected motion action "+req.action);
    }
  };
  return {ctrl:createWorkspaceController(bridge),bridge,
    divergeVideo:()=>{sha=SHA("9");vrev++;},
    divergeMotion:()=>mrev++,
    badWrite:v=>failWrite=v,badRead:v=>failRead=v,badMotion:v=>motionWriteFails=v,
    calls:()=>videoCalls};
}
test("U05 read-only FilmCraft verification checks persisted checksum without editing",async()=>{
  const {ctrl,bridge}=setup();
  await ctrl.refreshVideo("C:\\private","C:\\private\\project.fcproj");
  const proof=await ctrl.verifyVideoSnapshot();
  assert.equal(proof.snapshot.projectSha256,SHA("1"));
  assert.equal(bridge.calls.filter(c=>c==="videoTimeline").length,0);
  assert.equal(ctrl.getState().videoGeneration,1);
  assert.equal(ctrl.getState().needsReload,false);
  assert.equal(ctrl.getState().verificationHistory.at(-1).outcome,"verified");
});
test("read-only Video verification refuses external changes and quarantines stale project",async()=>{
  const {ctrl,divergeVideo,bridge}=setup();
  await ctrl.refreshVideo("C:\\private","C:\\private\\project.fcproj");
  divergeVideo();
  await assert.rejects(ctrl.verifyVideoSnapshot(),{code:"REVISION_CONFLICT"});
  assert.equal(ctrl.getState().needsReload,true);
  assert.equal(ctrl.getState().recoveryStudio,"video");
  assert.equal(bridge.calls.includes("videoTimeline"),false);
  await assert.rejects(ctrl.applyVideo([{type:"split",clipId:9,seconds:0.5}]),{code:"RELOAD_REQUIRED"});
  await ctrl.refreshVideo("C:\\private","C:\\private\\project.fcproj");
  assert.equal(ctrl.getState().needsReload,false);
  assert.equal(ctrl.getState().videoGeneration,2);
});
test("native Video write uncertainty never leaves editable stale state",async()=>{
  const {ctrl,badWrite,bridge}=setup();
  await ctrl.refreshVideo("C:\\private","C:\\private\\project.fcproj");
  badWrite(true);
  await assert.rejects(ctrl.applyVideo([{type:"split",clipId:9,seconds:0.5}]),/IPC disconnected/);
  assert.equal(ctrl.getState().recoveryStudio,"video");
  assert.equal(ctrl.getState().verificationHistory.at(-1).outcome,"uncertain");
  await assert.rejects(ctrl.applyVideo([{type:"split",clipId:9,seconds:0.5}]),{code:"RELOAD_REQUIRED"});
  assert.equal(bridge.calls.filter(c=>c==="videoTimeline").length,1);
});
test("read-only FilmCraft inspector failure quarantines instead of silently keeping project open",async()=>{
  const {ctrl,badRead}=setup();
  await ctrl.refreshVideo("C:\\private","C:\\private\\project.fcproj");
  badRead(true);
  await assert.rejects(ctrl.verifyVideoSnapshot(),/TEMPORARY_UNAVAILABLE/);
  assert.equal(ctrl.getState().recoveryStudio,"video");
});
test("real Motion revision can be verified without invoking a mutation",async()=>{
  const {ctrl,bridge}=setup();
  await ctrl.createComposition({name:"Native",width:640,height:480,fps:30,durationSeconds:5});
  const status=await ctrl.verifyMotionSnapshot();
  assert.equal(status.projectRevision,1);
  assert.equal(ctrl.getState().motion.layers[0].id,3);
  assert.equal(ctrl.getState().needsReload,false);
  assert.equal(ctrl.getState().motionGeneration,1);
  assert.equal(bridge.calls.includes("motion:addText"),false);
});
test("Motion change outside workspace quarantines read-only inspector",async()=>{
  const {ctrl,divergeMotion,bridge}=setup();
  await ctrl.createComposition({name:"Native",width:640,height:480,fps:30,durationSeconds:5});
  divergeMotion();
  await assert.rejects(ctrl.verifyMotionSnapshot(),{code:"REVISION_CONFLICT"});
  assert.equal(ctrl.getState().recoveryStudio,"motion");
  assert.equal(bridge.calls.includes("motion:addText"),false);
});
test("Motion mutation exception after possible write requires native refresh",async()=>{
  const {ctrl,badMotion}=setup();
  await ctrl.createComposition({name:"Native",width:640,height:480,fps:30,durationSeconds:5});
  badMotion(true);
  await assert.rejects(ctrl.editMotion({action:"addText",compId:13,name:"Native",text:"x",x:5,y:10,size:22}),/timeout/);
  assert.equal(ctrl.getState().recoveryStudio,"motion");
  assert.equal(ctrl.getState().verificationHistory.at(-1).outcome,"uncertain");
  await assert.rejects(ctrl.editMotion({action:"addText",compId:13,name:"Native",text:"x",x:5,y:10,size:22}),{code:"RELOAD_REQUIRED"});
  await ctrl.motionStatus();
  assert.equal(ctrl.getState().needsReload,false);
});
test("explicit project reopen changes session generation even with identical Video SHA",async()=>{
  const {ctrl}=setup();
  await ctrl.refreshVideo("C:\\private","C:\\private\\project.fcproj");
  await ctrl.refreshVideo("C:\\private","C:\\private\\project.fcproj");
  assert.equal(ctrl.getState().videoGeneration,2);
  await ctrl.openMotion("C:\\private","native.ecproj");
  await ctrl.openMotion("C:\\private","native.ecproj");
  assert.equal(ctrl.getState().motionGeneration,2);
});
test("native diagnostic report includes receipt-backed facts but not private paths/chat/media",async()=>{
  const {ctrl}=setup();
  await ctrl.refreshVideo("C:\\private","C:\\private\\owner-secret.fcproj");
  ctrl.addDraft("private customer secret");
  const report=nativeDiagnosticReport(ctrl.getState()),text=nativeDiagnosticText(ctrl.getState());
  assert.equal(report.video.status,"snapshot-verified");
  assert.equal(report.video.projectSha256,SHA("1"));
  assert.equal(report.video.clipCount,1);
  assert.equal(report.installationVerified,false);
  assert.equal(report.aiNativeTaskGuardVerified,false);
  assert.equal(report.motion.status,"not-ready");
  for(const secret of ["owner-secret","private customer secret","Original private title","Owner secret media","C:\\private"])
    assert.equal(text.includes(secret),false);
});
test("diagnostic report labels quarantined data unsafe until refresh, never verified",async()=>{
  const {ctrl,divergeVideo}=setup();
  await ctrl.refreshVideo("C:\\private","C:\\private\\project.fcproj");
  divergeVideo();
  await assert.rejects(ctrl.verifyVideoSnapshot(),{code:"REVISION_CONFLICT"});
  const report=nativeDiagnosticReport(ctrl.getState());
  assert.equal(report.video.status,"recovery-required");
  assert.equal(report.video.projectSha256,null);
  assert.equal(report.video.clipCount,null);
});
test("session evidence is bounded and ordered, no unbounded telemetry",async()=>{
  const {ctrl}=setup();
  await ctrl.refreshVideo("C:\\private","C:\\private\\project.fcproj");
  for(let i=0;i<57;i++)await ctrl.verifyVideoSnapshot();
  const history=ctrl.getState().verificationHistory;
  assert.equal(history.length,48);
  assert.ok(history[0].id>1);
  assert.ok(history.every(e=>["started","verified","failed","uncertain"].includes(e.outcome)));
  assert.ok(nativeDiagnosticReport(ctrl.getState()).recentEvents.length<=25);
});
test("U05 UI wires explicit native verification and session-identity selection clearing",()=>{
  const src=readFileSync(new URL("../src/desktop-ui/workspace.ts",import.meta.url),"utf8");
  for(const action of ["video-verify","motion-verify","diagnostic-copy"]){
    assert.match(src,new RegExp('data-act="'+action+'"'));
    assert.match(src,new RegExp('case "'+action+'"'));
  }
  assert.match(src,/state\.videoGeneration!==seenVideoGeneration/);
  assert.match(src,/state\.motionGeneration!==seenMotionGeneration/);
  assert.match(src,/nativeDiagnosticText\(state\)/);
});
