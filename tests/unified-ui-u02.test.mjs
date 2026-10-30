import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createWorkspaceController} from "../src/unified-workspace/core.mjs";
import {projectMediaItems,selectedNativeMedia} from "../src/unified-workspace/media.mjs";
const sha=x=>String(x).repeat(64);
function fixture(){
  let videoHash=sha("1"),motionRev=0,midRead=false;
  let layers=[{id:9,name:"Headline",kind:"Text",position:[10,20,0],scale:[100,100,100],rotation:0,opacity:100,keyframes:0,revision:0}];
  const effects=[{uid:21,name:"Blur",enabled:true}];
  const masks=[{uid:22,name:"Mask",vertices:[[0,0],[1,0],[1,1]]}];
  const calls=[];
  const bridge={
    calls,
    async videoSnapshot(root,path){
      calls.push(["videoSnapshot",path]);
      return {projectPath:path,projectSha256:videoHash,sessionRevision:1,project:{root:{children:[]}},sequence:null};
    },
    async videoTimeline(){throw Error("not used")},
    async videoImport(){throw Error("not used")},
    async videoPreview(){throw Error("not used")},
    async videoExport(){throw Error("not used")},
    async videoRestore(){throw Error("not used")},
    async motion(request){
      calls.push(["motion",request]);
      if(request.action==="status"){
        if(midRead && calls.filter(c=>c[1]?.action==="status").length%2===0)motionRev++;
        return {native:true,ready:true,projectRevision:motionRev,dirty:!!motionRev};
      }
      if(request.action==="createComposition"){motionRev++;return {id:7,name:request.name,revision:motionRev};}
      if(request.action==="inspectComposition")return {id:7,name:"Native Comp",revision:motionRev};
      if(request.action==="openProject")return {verifiedFromDisk:true,bytes:256,compositions:[{id:7,name:"Native Comp"}]};
      if(request.action==="listLayers")return structuredClone(layers);
      if(request.action==="listEffects")return structuredClone(effects);
      if(request.action==="listMasks")return structuredClone(masks);
      if(request.action==="setTransform"){
        motionRev++;
        if(request.kind==="position"||request.kind==="scale")
          layers[0][request.kind]=[request.x,request.y,request.kind==="position"?0:100];
        else layers[0][request.kind]=request.value;
        layers[0].revision=motionRev;
        return structuredClone(layers[0]);
      }
      if(request.action==="addKey"){
        motionRev++;
        layers[0].keyframes++;
        layers[0].revision=motionRev;
        return {native:true,revision:motionRev,value:request.value};
      }
      throw Error("Unexpected native command "+request.action);
    }
  };
  return {bridge,ctrl:createWorkspaceController(bridge),
    externalChange:()=>motionRev++,divergeInspector:()=>{midRead=true;}};
}
test("native nested bins remain selectable even under an item-bearing parent",()=>{
  const project={root:{name:"Root",children:[
    {name:"Folder",item:4,type:"bin",children:[{name:"a.mp4",item:7,type:"media"},
       {name:"wrong",item:-2},{name:"a-duplicate",item:7}]},
    {name:"Sequence",item:8,type:"sequence"},
    {name:"b.wav",item:9}
  ]}};
  assert.deepEqual(projectMediaItems(project).map(x=>x.id),[4,7,9]);
  assert.deepEqual(selectedNativeMedia(project,"7"),{id:7,name:"a.mp4",location:"Root / Folder"});
  assert.throws(()=>selectedNativeMedia(project,"8"),/absent/);
  assert.throws(()=>selectedNativeMedia(project,"7.0"),/Choose/);
  assert.throws(()=>selectedNativeMedia(project,"0"),/Choose/);
});
test("inspector binds only to a live selected layer and reads actual native effects/masks",async()=>{
  const {ctrl,bridge}=fixture();
  await ctrl.createComposition({name:"Native",width:640,height:360,fps:30,durationSeconds:8});
  const inspector=await ctrl.inspectMotionLayer(9);
  assert.equal(inspector.layer.name,"Headline");
  assert.equal(inspector.effects[0].uid,21);
  assert.equal(inspector.masks[0].uid,22);
  assert.equal(inspector.revision,1);
  assert.ok(bridge.calls.some(x=>x[1]?.action==="listEffects"));
  await assert.rejects(ctrl.inspectMotionLayer(999),{code:"LAYER_NOT_FOUND"});
});
test("native Transform and Keyframe change uses native revision and fresh layer readback",async()=>{
  const {ctrl,bridge}=fixture();
  await ctrl.createComposition({name:"Native",width:640,height:360,fps:30,durationSeconds:8});
  await ctrl.inspectMotionLayer(9);
  await ctrl.editMotion({action:"setTransform",compId:7,layerId:9,kind:"position",x:100,y:200});
  assert.equal(ctrl.getState().motion.revision,2);
  assert.equal(ctrl.getState().motion.inspector.layer.revision,2);
  await ctrl.editMotion({action:"addKey",compId:7,layerId:9,property:"opacity",time:1,value:50});
  assert.equal(ctrl.getState().motion.revision,3);
  assert.equal(bridge.calls.filter(x=>x[1]?.action==="addKey").length,1);
});
test("external Motion revision invalidates edit and refresh re-inspects composition",async()=>{
  const {ctrl,externalChange,bridge}=fixture();
  await ctrl.createComposition({name:"Native",width:640,height:360,fps:30,durationSeconds:8});
  externalChange();
  await assert.rejects(ctrl.editMotion({action:"setTransform",compId:7,layerId:9,kind:"opacity",value:80}),{code:"REVISION_CONFLICT"});
  assert.equal(ctrl.getState().recoveryStudio,"motion");
  assert.equal(bridge.calls.some(x=>x[1]?.action==="setTransform"),false);
  await ctrl.motionStatus();
  assert.equal(ctrl.getState().motion.revision,2);
  assert.equal(ctrl.getState().needsReload,false);
  assert.equal(ctrl.getState().motion.frame,null);
  assert.ok(bridge.calls.some(x=>x[1]?.action==="inspectComposition"));
});
test("video may be inspected during motion quarantine without dismissing Motion recovery",async()=>{
  const {ctrl,externalChange}=fixture();
  await ctrl.createComposition({name:"Native",width:640,height:360,fps:30,durationSeconds:8});
  externalChange();
  await assert.rejects(ctrl.editMotion({action:"setTransform",compId:7,layerId:9,kind:"opacity",value:80}),{code:"REVISION_CONFLICT"});
  await ctrl.refreshVideo("C:\\Owner","C:\\Owner\\a.fcproj");
  assert.equal(ctrl.getState().video.snapshot.projectSha256,sha("1"));
  assert.equal(ctrl.getState().recoveryStudio,"motion");
  assert.equal(ctrl.getState().needsReload,true);
});
test("mid-inspection native revision drift is quarantined instead of publishing stale properties",async()=>{
  const {ctrl,divergeInspector}=fixture();
  await ctrl.createComposition({name:"Native",width:640,height:360,fps:30,durationSeconds:8});
  divergeInspector();
  await assert.rejects(ctrl.inspectMotionLayer(9),{code:"REVISION_CONFLICT"});
  assert.equal(ctrl.getState().motion.inspector,null);
  assert.equal(ctrl.getState().recoveryStudio,"motion");
});
test("unified U02 controls are actual event handlers, not display-only labels",()=>{
  const src=readFileSync(new URL("../src/desktop-ui/workspace.ts",import.meta.url),"utf8");
  for(const action of ["motion-transform","motion-key","motion-shape","motion-inspect"]){
    assert.match(src,new RegExp('data-act="'+action+'"'));
    assert.match(src,new RegExp('case "'+action+'"'));
  }
  assert.match(src,/selectedNativeMedia/);
  assert.match(src,/ctrl\.inspectMotionLayer/);
});

test("opening Motion does not silently clear a stopped Video project's recovery flag",async()=>{
  const {ctrl,bridge}=fixture();
  await ctrl.refreshVideo("C:\\Owner","C:\\Owner\\a.fcproj");
  let complete;
  bridge.videoTimeline=()=>new Promise(resolve=>{complete=resolve;});
  const pending=ctrl.applyVideo([{type:"undo"}]);
  assert.equal(ctrl.stop(),true);
  complete({projectSha256:sha("1"),commands:[{ok:true}]});
  await assert.rejects(pending,{code:"STOP_UNVERIFIED"});
  assert.equal(ctrl.getState().recoveryStudio,"video");
  await ctrl.openMotion("C:\\Owner","real.ecproj");
  assert.equal(ctrl.getState().motion.composition.id,7);
  assert.equal(ctrl.getState().needsReload,true);
  assert.equal(ctrl.getState().recoveryStudio,"video");
});
test("stale FilmCraft preview receipt quarantines the affected native Video studio",async()=>{
  const {ctrl,bridge}=fixture();
  await ctrl.refreshVideo("C:\\Owner","C:\\Owner\\a.fcproj");
  bridge.videoPreview=async()=>({projectSha256:sha("9"),pngBytes:[137,80,78,71]});
  await assert.rejects(ctrl.renderVideo(0),{code:"REVISION_CONFLICT"});
  assert.equal(ctrl.getState().recoveryStudio,"video");
  await assert.rejects(ctrl.renderVideo(0),{code:"RELOAD_REQUIRED"});
});
