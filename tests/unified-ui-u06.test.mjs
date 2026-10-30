import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {nativeClipInspector,splitPreflight,verifyNativeSplit,timelineSeekFromX} from "../src/unified-workspace/video-inspector.mjs";
import {createWorkspaceController} from "../src/unified-workspace/core.mjs";
const T=254016000000,SHA=n=>String(n).repeat(64);
function fixture({fps=30,locked=false,splitMode="actual",duration=4}={}){
  let sha=SHA("1"),revision=1,edits=[];
  let clips=[{clip:19,item:3,name:"Owner project clip",start:2*T,duration:duration*T,startFrame:40,durationFrames:Math.round(duration*fps)}];
  const bridge={
    async videoSnapshot(root,projectPath){return {
      projectPath,projectSha256:sha,sessionRevision:revision,
      project:{root:{children:[{item:3,name:"Owner imported footage",type:"video"}]}},
      sequence:{settings:fps?{frame_rate:{num:fps,den:1}}:{},
        duration:12*T,video:[{locked,items:clips}],audio:[]}
    };},
    async videoTimeline(request){
      edits.push(request);
      const cut=request.actions.find(a=>a.type==="split");
      if(cut&&splitMode==="actual"){
        const leftDuration=cut.seconds-2;
        clips=[
          {...clips[0],duration:leftDuration*T,durationFrames:Math.round(leftDuration*fps)},
          {clip:21,item:3,name:"Owner project clip",start:cut.seconds*T,
           duration:(duration-leftDuration)*T,startFrame:40+Math.round(leftDuration*fps),
           durationFrames:Math.round((duration-leftDuration)*fps)}
        ];
      }
      sha=SHA("2");revision++;
      return {projectSha256:sha,commands:[{ok:true}]};
    },
    async videoImport(){throw Error("not used");},
    async videoPreview(){throw Error("not used");},
    async videoExport(){throw Error("not used");},
    async videoRestore(){throw Error("not used");},
    async motion(){throw Error("not used");}
  };
  const ctrl=createWorkspaceController(bridge);
  return {ctrl,bridge,edits,read:()=>clips};
}
test("native clip Inspector uses real sequence entry and source frame metadata",async()=>{
  const {ctrl}=fixture();
  await ctrl.refreshVideo("C:\\film","C:\\film\\take.fcproj");
  const detail=nativeClipInspector(ctrl.getState(),19);
  assert.deepEqual({id:detail.clipId,source:detail.itemId,track:detail.track,
    start:detail.start,end:detail.end,duration:detail.duration,fps:detail.fps,
    sourceStartFrame:detail.sourceStartFrame,sourceDurationFrames:detail.sourceDurationFrames,
    locked:detail.locked},{id:19,source:3,track:"V1",start:2,end:6,duration:4,
      fps:30,sourceStartFrame:40,sourceDurationFrames:120,locked:false});
  assert.equal(nativeClipInspector(ctrl.getState(),999),null);
  assert.equal(nativeClipInspector({video:{clips:[{clipId:19,track:"V1",kind:"video",start:2,duration:4}]}},19),null);
});
test("split preflight only accepts on-frame positions leaving both sides nonempty",async()=>{
  const {ctrl}=fixture();
  await ctrl.refreshVideo("C:\\film","C:\\film\\take.fcproj");
  const inspector=nativeClipInspector(ctrl.getState(),19);
  assert.deepEqual(splitPreflight(inspector,4),{ok:true,seconds:4,frame:120});
  for(const time of [2,6,1,7,-2,Infinity,NaN])
    assert.equal(splitPreflight(inspector,time).ok,false);
  assert.equal(splitPreflight(inspector,2+1/30).ok,true);
  assert.equal(splitPreflight(inspector,6-1/30).ok,true);
  assert.equal(splitPreflight({...inspector,locked:true},4).ok,false);
  assert.equal(splitPreflight({...inspector,fps:null},4).ok,false);
  assert.equal(splitPreflight(null,4).ok,false);
});
test("actual FilmCraft split edits native disk and verifies left and right saved segments",async()=>{
  const {ctrl,edits}=fixture();
  await ctrl.refreshVideo("C:\\film","C:\\film\\take.fcproj");
  const proof=await ctrl.splitVideoClip(19,4);
  assert.equal(proof.projectSha256,SHA("2"));
  assert.equal(edits.length,1);
  assert.equal(edits[0].expectedProjectSha256,SHA("1"));
  assert.deepEqual(edits[0].actions,[{type:"split",clipId:19,seconds:4}]);
  const latest=ctrl.getState();
  assert.equal(latest.video.clips.length,2);
  assert.equal(latest.video.clips[1].start,4);
  assert.equal(latest.needsReload,false);
});
test("split response without left/right saved segments quarantines video",async()=>{
  const {ctrl,edits}=fixture({splitMode:"receipt-only"});
  await ctrl.refreshVideo("C:\\film","C:\\film\\take.fcproj");
  await assert.rejects(ctrl.splitVideoClip(19,4),{code:"REVISION_CONFLICT"});
  assert.equal(edits.length,1);
  assert.equal(ctrl.getState().recoveryStudio,"video");
  await assert.rejects(ctrl.splitVideoClip(19,4),{code:"RELOAD_REQUIRED"});
});
test("invalid/locked split must never call native mutation",async()=>{
  const {ctrl,edits}=fixture({locked:true});
  await ctrl.refreshVideo("C:\\film","C:\\film\\take.fcproj");
  await assert.rejects(ctrl.splitVideoClip(19,4),{code:"INVALID_SPLIT"});
  assert.equal(edits.length,0);
  const noFps=fixture({fps:0});
  await noFps.ctrl.refreshVideo("C:\\film","C:\\film\\take.fcproj");
  await assert.rejects(noFps.ctrl.splitVideoClip(19,4),{code:"INVALID_SPLIT"});
  assert.equal(noFps.edits.length,0);
});
test("frame-aware seek snaps actual native FPS including empty-lane endpoint",()=>{
  const sequence={settings:{frame_rate:{num:25,den:1}},duration:10*T};
  const clips=[{start:2,duration:3}];
  const seek=(x)=>timelineSeekFromX({clientX:x,laneLeft:20,laneWidth:400,sequence,clips});
  assert.equal(seek(20),0);
  assert.equal(seek(220),5);
  assert.equal(seek(420),10);
  assert.equal(seek(-300),0);
  assert.equal(seek(900),10);
  assert.equal(timelineSeekFromX({clientX:150,laneLeft:20,laneWidth:0,sequence,clips}),null);
  assert.equal(timelineSeekFromX({clientX:150,laneLeft:20,laneWidth:400,sequence:{},clips}),null);
});
test("strict split verification uses same media ID and track not unrelated clip",()=>{
  const before={itemId:3,track:"V1",start:2,end:6,fps:25};
  assert.equal(verifyNativeSplit(before,[
    {itemId:3,track:"V1",start:2,duration:2},
    {itemId:3,track:"A1",start:4,duration:2}],4),false);
  assert.equal(verifyNativeSplit(before,[
    {itemId:3,track:"V1",start:2,duration:2},
    {itemId:3,track:"V1",start:4,duration:2}],4),true);
});
test("U06 UI contains click-to-seek, actual split controller, zoom and source inspector",()=>{
  const src=readFileSync(new URL("../src/desktop-ui/workspace.ts",import.meta.url),"utf8");
  assert.match(src,/data-field="timelineZoom"/);
  assert.match(src,/data-ui="clip-inspector"/);
  assert.match(src,/case "video-split"/);
  assert.match(src,/ctrl\.splitVideoClip\(/);
  assert.match(src,/timelineSeekFromX\(/);
  assert.match(src,/nativeClipInspector\(/);
  assert.match(src,/row\.style\.minWidth/);
  assert.match(src,/showSelectedClip\(state\)/);
});
