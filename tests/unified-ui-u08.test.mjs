import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createWorkspaceController} from "../src/unified-workspace/core.mjs";
import {trimPreflight,deletePreflight,verifyNativeTrim,verifyNativeDelete} from "../src/unified-workspace/video-mutations.mjs";
import {workspaceActionAvailable} from "../src/unified-workspace/ui-guards.mjs";
const T=254016000000,sha=n=>String(n).repeat(64);
function fixture({locked=false,mode="real",fps=30}={}){
  let digest=sha("1"),revision=1;
  let items=[
    {clip:14,item:8,name:"native source",start:T,duration:5*T},
    {clip:15,item:9,name:"neighbour",start:7*T,duration:2*T}
  ];
  const edits=[],bridge={
    async videoSnapshot(root,path){
      return {projectPath:path,projectSha256:digest,sessionRevision:revision,
        project:{root:{children:[]}},sequence:{
          settings:{frame_rate:{num:fps,den:1}},
          video:[{locked,items}],audio:[]}};
    },
    async videoTimeline(request){
      edits.push(request);
      const action=request.actions[0];
      if(mode==="throw")throw Error("FilmCraft IPC timeout after possible edit");
      if(mode==="real"){
        if(action.type==="trim"){
          const seconds=action.deltaFrames/fps;
          if(action.edge==="out")items[0]={...items[0],duration:items[0].duration+seconds*T};
          else items[0]={...items[0],start:items[0].start+(-seconds)*T,duration:items[0].duration+seconds*T};
        }
        if(action.type==="delete")items=items.filter(c=>c.clip!==action.clipId);
      }
      revision++;digest=mode==="same-sha"?sha("1"):sha("2");
      return {projectSha256:digest,commands:mode==="missing-receipt"?[]:[{ok:true}]};
    },
    async videoPreview({expectedProjectSha256}){
      return {projectSha256:expectedProjectSha256,pngBytes:[137,80,78,71]};
    },
    async videoImport(){throw Error("not used");},
    async videoRestore(){throw Error("not used");},async videoExport(){throw Error("not used");},
    async motion(){throw Error("not used");}
  };
  const ctrl=createWorkspaceController(bridge);
  return {ctrl,edits,items:()=>items,bridge};
}
const opened=async f=>{await f.ctrl.refreshVideo("C:\\test","C:\\test\\edit.fcproj");return f;};
test("U08 Trim Out invokes native exact signed-frame action, independently verifies saved end",async()=>{
  const f=await opened(fixture());
  const r=await f.ctrl.trimVideoClip(14,"out",-30,false);
  assert.equal(r.projectSha256,sha("2"));
  assert.equal(f.edits.length,1);
  assert.deepEqual(f.edits[0].actions,[{type:"trim",clipId:14,edge:"out",deltaFrames:-30,ripple:false}]);
  assert.equal(f.edits[0].expectedProjectSha256,sha("1"));
  const changed=f.ctrl.getState().video.clips.find(c=>c.clipId===14);
  assert.equal(changed.start,1);assert.equal(changed.duration,4);
  assert.equal(f.ctrl.getState().recoveryByStudio.video,false);
});
test("U08 Trim In preserves native clip end while changing start",async()=>{
  const f=await opened(fixture());
  await f.ctrl.trimVideoClip(14,"in",-30,true);
  const latest=f.ctrl.getState().video.clips.find(c=>c.clipId===14);
  assert.equal(latest.start,2);
  assert.equal(latest.duration,4);
  assert.equal(latest.start+latest.duration,6);
  assert.equal(f.edits[0].actions[0].ripple,true);
});
test("U08 verified native Delete removes selected ID while preserving other clip",async()=>{
  const f=await opened(fixture());
  await f.ctrl.deleteVideoClip(14,false);
  assert.deepEqual(f.ctrl.getState().video.clips.map(c=>c.clipId),[15]);
  assert.equal(f.edits[0].actions[0].ripple,false);
  assert.equal(f.ctrl.getState().needsReload,false);
});
test("U08 Ripple Delete transfers boolean through the native FilmCraft command",async()=>{
  const f=await opened(fixture());
  await f.ctrl.deleteVideoClip(14,true);
  assert.equal(f.edits[0].actions[0].ripple,true);
  assert.equal(f.ctrl.getState().video.clips.some(c=>c.clipId===14),false);
});
test("native Trim Out receipt with no saved edge movement is quarantined",async()=>{
  const f=await opened(fixture({mode:"receipt-only"}));
  await assert.rejects(f.ctrl.trimVideoClip(14,"out",-30,false),{code:"REVISION_CONFLICT"});
  assert.equal(f.ctrl.getState().recoveryByStudio.video,true);
  assert.equal(f.ctrl.getState().videoFrame,null);
  await assert.rejects(f.ctrl.trimVideoClip(14,"out",-30,false),{code:"RELOAD_REQUIRED"});
  assert.equal(f.edits.length,1);
});
test("native Delete receipt without saved clip removal is quarantined",async()=>{
  const f=await opened(fixture({mode:"receipt-only"}));
  await assert.rejects(f.ctrl.deleteVideoClip(14),{code:"REVISION_CONFLICT"});
  assert.equal(f.ctrl.getState().recoveryByStudio.video,true);
  assert.equal(f.edits.length,1);
});
test("locked tracks reject Trim and Delete with zero native writes",async()=>{
  const f=await opened(fixture({locked:true}));
  await assert.rejects(f.ctrl.trimVideoClip(14,"out",-30),{code:"INVALID_TRIM"});
  await assert.rejects(f.ctrl.deleteVideoClip(14),{code:"INVALID_DELETE"});
  assert.equal(f.edits.length,0);
  assert.equal(f.ctrl.getState().needsReload,false);
});
test("invalid trim frame, edge and unknown clip are rejected before native IPC",async()=>{
  const f=await opened(fixture());
  for(const delta of [0,1.5,NaN,Infinity,144001,-144001])
    await assert.rejects(f.ctrl.trimVideoClip(14,"out",delta),{code:"INVALID_TRIM"});
  await assert.rejects(f.ctrl.trimVideoClip(14,"middle",-30),{code:"INVALID_TRIM"});
  await assert.rejects(f.ctrl.trimVideoClip(999,"out",-30),{code:"INVALID_TRIM"});
  await assert.rejects(f.ctrl.deleteVideoClip(999),{code:"INVALID_DELETE"});
  await assert.rejects(f.ctrl.deleteVideoClip(14,"yes"),{code:"INVALID_DELETE"});
  assert.equal(f.edits.length,0);
});
test("native errors during Trim quarantine because outcome could have been committed",async()=>{
  const f=await opened(fixture({mode:"throw"}));
  await assert.rejects(f.ctrl.trimVideoClip(14,"out",-30),/timeout/);
  assert.equal(f.ctrl.getState().recoveryByStudio.video,true);
  await assert.rejects(f.ctrl.deleteVideoClip(14),{code:"RELOAD_REQUIRED"});
  assert.equal(f.edits.length,1);
});
test("trim verification rejects wrong source ID, wrong track, or wrong edge",()=>{
  const before={clipId:14,itemId:8,track:"V1",start:1,end:6,duration:5,fps:30};
  assert.equal(verifyNativeTrim(before,[{clipId:14,itemId:8,track:"V1",start:1,duration:4}],"out"),true);
  assert.equal(verifyNativeTrim(before,[{clipId:14,itemId:8,track:"V1",start:2,duration:4}],"in"),true);
  assert.equal(verifyNativeTrim(before,[{clipId:14,itemId:9,track:"V1",start:1,duration:4}],"out"),false);
  assert.equal(verifyNativeTrim(before,[{clipId:14,itemId:8,track:"A1",start:1,duration:4}],"out"),false);
  assert.equal(verifyNativeTrim(before,[{clipId:14,itemId:8,track:"V1",start:1,duration:5}],"out"),false);
  assert.equal(verifyNativeTrim(before,[{clipId:14,itemId:8,track:"V1",start:2,duration:4}],"out"),false);
  assert.equal(verifyNativeDelete(before,[{clipId:14,itemId:9,track:"V1"}]),false);
  assert.equal(verifyNativeDelete(before,[{clipId:15,itemId:8,track:"V1"}]),true);
});
test("U08 preflight derives source from native sequence, never guessed label or timing",async()=>{
  const f=await opened(fixture());
  const state=f.ctrl.getState();
  const trim=trimPreflight(state,14,"out",-30,true);
  assert.equal(trim.ok,true);
  assert.equal(trim.before.itemId,8);
  assert.equal(trim.before.fps,30);
  assert.equal(trim.action.ripple,true);
  const del=deletePreflight(state,14,false);
  assert.equal(del.ok,true);
  assert.equal(del.before.start,1);
  assert.equal(trimPreflight({...state,video:null},14,"out",-30).ok,false);
  assert.equal(deletePreflight({...state,video:null},14).ok,false);
});
test("native successful mutation drops stale preview receipt",async()=>{
  const f=await opened(fixture());
  await f.ctrl.renderVideo(2);
  assert.deepEqual(f.ctrl.getState().videoFrame.pngBytes,[137,80,78,71]);
  await f.ctrl.trimVideoClip(14,"out",-30);
  assert.equal(f.ctrl.getState().videoFrame,null);
  assert.equal(f.ctrl.getState().pendingApproval,null);
});
test("U08 UI uses verified native Trim/Delete and offers FilmCraft In, Out and ripple control",()=>{
  const s=readFileSync(new URL("../src/desktop-ui/workspace.ts",import.meta.url),"utf8");
  assert.match(s,/data-field="trimEdge"/);
  assert.match(s,/data-field="videoRipple"/);
  assert.match(s,/ctrl\.trimVideoClip\(/);
  assert.match(s,/ctrl\.deleteVideoClip\(/);
  assert.doesNotMatch(s,/case "video-delete":return ctrl\.applyVideo/);
  assert.doesNotMatch(s,/case "video-trim":return ctrl\.applyVideo/);
  assert.match(s,/Math\.abs\(delta\)>144000/);
});

test("FilmCraft missing individual command proof refuses to accept native write",async()=>{
  const f=await opened(fixture({mode:"missing-receipt"}));
  await assert.rejects(f.ctrl.trimVideoClip(14,"out",-30),{code:"INVALID_RECEIPT"});
  assert.equal(f.ctrl.getState().recoveryByStudio.video,true);
  assert.equal(f.ctrl.getState().progress.includes("refresh required"),true);
});
test("FilmCraft unchanged disk SHA after a purported mutation is not an editing success",async()=>{
  const f=await opened(fixture({mode:"same-sha"}));
  await assert.rejects(f.ctrl.deleteVideoClip(14),{code:"INVALID_RECEIPT"});
  assert.equal(f.ctrl.getState().recoveryByStudio.video,true);
});
test("failed post-save native Trim proof replaces earlier success progress with recovery reason",async()=>{
  const f=await opened(fixture({mode:"receipt-only"}));
  await assert.rejects(f.ctrl.trimVideoClip(14,"out",-30),{code:"REVISION_CONFLICT"});
  const state=f.ctrl.getState();
  assert.match(state.progress,/proof mismatched.*refresh required/i);
  assert.match(state.error,/did not produce the required saved edge readback/);
});
test("Motion New composition UI can trigger a trusted native worker before status probe",()=>{
  const state={studio:"motion",busy:false,recoveryByStudio:{video:false,motion:false},
    motion:{ready:false,composition:null}};
  assert.equal(workspaceActionAvailable(state,"motion-create"),true);
  assert.equal(workspaceActionAvailable(state,"motion-save"),false);
  assert.equal(workspaceActionAvailable({...state,recoveryByStudio:{video:false,motion:true}},"motion-create"),false);
});
