import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyMotionEdit} from "../src/unified-workspace/motion-proof.mjs";
import {createWorkspaceController} from "../src/unified-workspace/core.mjs";

function nativeHarness({missingLayer=false,wrongTransform=false,unstableStatus=false}={}){
  let rev=0,layers=[],effects=[],masks=[],postWriteStatusCalls=0,mutationMarked=false;
  const calls=[];
  const layer=(id,name,kind)=>({id,name,kind,position:[120,120,0],scale:[100,100,100],
    rotation:0,opacity:100,keyframes:0,revision:rev});
  const readLayers=()=>layers.map(x=>({...x,revision:rev}));
  const bridge={
    async videoSnapshot(){throw Error("Video not used");},
    async videoTimeline(){},async videoImport(){},async videoPreview(){},async videoExport(){},async videoRestore(){},
    async motion(request){
      calls.push(request.action);
      if(request.action==="status"){
        if(mutationMarked&&unstableStatus){
          postWriteStatusCalls++;
          if(postWriteStatusCalls>1)rev++;
        }
        return {ready:true,native:true,projectRevision:rev,dirty:true};
      }
      if(request.action==="createComposition"){rev++;return {id:6,name:request.name,revision:rev,durationSeconds:10};}
      if(request.action==="listLayers")return structuredClone(readLayers());
      if(request.action==="inspectComposition")return {id:6,name:"Native",revision:rev};
      if(request.action==="listEffects")return structuredClone(effects);
      if(request.action==="listMasks")return structuredClone(masks);
      if(request.action==="addText"){
        rev++;
        const item=layer(11,request.name,"Text");
        if(!missingLayer)layers.push(item);
        return structuredClone(item);
      }
      if(request.action==="addShape"){
        rev++;const item=layer(12,request.name,"Shape");
        if(!missingLayer)layers.push(item);
        return structuredClone(item);
      }
      if(request.action==="editText"){
        rev++;
        return structuredClone({...layers.find(x=>x.id===request.layerId),revision:rev});
      }
      if(request.action==="setTransform"){
        rev++;mutationMarked=true;const target=layers.find(x=>x.id===request.layerId);
        if(request.kind==="position"||request.kind==="scale")
          target[request.kind]=wrongTransform?[999,999,0]:[request.x,request.y,request.kind==="position"?0:100];
        else target[request.kind]=wrongTransform?999:request.value;
        return {...target,revision:rev};
      }
      if(request.action==="addKey"){
        rev++;layers.find(x=>x.id===request.layerId).keyframes++;
        return {native:true,value:request.value,revision:rev};
      }
      if(request.action==="easeKeys"){rev++;return {native:true,revision:rev};}
      if(request.action==="addEffect"){
        rev++;const effect={uid:41,id:"ec.blur.gaussian",name:"Gaussian Blur",enabled:true};
        effects.push(effect);return {...effect};
      }
      if(request.action==="toggleEffect"){
        rev++;const effect=effects.find(e=>e.uid===request.uid);
        effect.enabled=request.enabled;return {...effect};
      }
      if(request.action==="setEffectParameter"){
        rev++;return {uid:request.uid,parameter:request.parameter,value:request.value,verified:true};
      }
      if(request.action==="removeEffect"){
        rev++;effects=effects.filter(x=>x.uid!==request.uid);
        return {removed:true,uid:request.uid};
      }
      if(request.action==="addPolygonMask"){
        rev++;const mask={uid:51,name:"Polygon",closed:true,vertices:request.vertices};
        masks.push(mask);return {...mask};
      }
      if(request.action==="removeMask"){
        rev++;masks=masks.filter(m=>m.uid!==request.uid);
        return {removed:true,uid:request.uid};
      }
      throw Error("Unsupported mock action: "+request.action);
    }
  };
  return {ctrl:createWorkspaceController(bridge),calls,
    layers:()=>layers,effects:()=>effects,masks:()=>masks,
    getRev:()=>rev,corruptEffect:()=>{effects=[];},
    addExistingLayer:()=>{layers.push(layer(11,"Native Title","Text"));}};
}
async function ready(options){
  const v=nativeHarness(options);
  await v.ctrl.createComposition({name:"Comp",width:640,height:480,fps:30,durationSeconds:10});
  return v;
}
test("U09 new EffectCraft text is verified against the real native-created layer ID/name/kind",async()=>{
  const v=await ready();
  const receipt=await v.ctrl.editMotion({action:"addText",compId:6,name:"Native Title",text:"Hello",x:120,y:120,size:48});
  assert.equal(receipt.id,11);
  assert.deepEqual(v.ctrl.getState().motion.layers.map(x=>x.id),[11]);
  assert.equal(v.ctrl.getState().motion.revision,2);
  assert.equal(v.ctrl.getState().recoveryByStudio.motion,false);
  assert.ok(v.calls.filter(x=>x==="status").length>=2);
});
test("U09 missing created layer despite successful receipt quarantines Motion",async()=>{
  const v=await ready({missingLayer:true});
  await assert.rejects(v.ctrl.editMotion({action:"addText",compId:6,name:"Missing",text:"Text",x:4,y:7,size:20}),{code:"INVALID_RECEIPT"});
  assert.equal(v.ctrl.getState().recoveryByStudio.motion,true);
  assert.equal(v.ctrl.getState().motion.frame,null);
});
test("U09 native Shape creation also requires persisted layer identity",async()=>{
  const v=await ready();
  const receipt=await v.ctrl.editMotion({action:"addShape",compId:6,name:"Native Square",kind:"rect",
    x:120,y:120,width:100,height:100,fill:"#124ABC"});
  assert.equal(receipt.id,12);
  assert.equal(v.ctrl.getState().motion.layers[0].kind,"Shape");
});
test("U09 text editing checks same receipt layer and keeps existing native layer",async()=>{
  const v=await ready();v.addExistingLayer();
  await v.ctrl.motionStatus();
  const r=await v.ctrl.editMotion({action:"editText",compId:6,layerId:11,text:"Updated native text"});
  assert.equal(r.id,11);
  assert.deepEqual(v.ctrl.getState().motion.layers.map(x=>x.id),[11]);
});
test("U09 native transform requires precise vector readback and matching native revision",async()=>{
  const v=await ready();v.addExistingLayer();await v.ctrl.motionStatus();
  await v.ctrl.editMotion({action:"setTransform",compId:6,layerId:11,kind:"position",x:300,y:200});
  assert.deepEqual(v.ctrl.getState().motion.layers[0].position,[300,200,0]);
  await v.ctrl.editMotion({action:"setTransform",compId:6,layerId:11,kind:"opacity",value:80});
  assert.equal(v.ctrl.getState().motion.layers[0].opacity,80);
  assert.equal(v.ctrl.getState().recoveryByStudio.motion,false);
});
test("U09 wrong transform position fails even after native revision increases",async()=>{
  const v=await ready({wrongTransform:true});v.addExistingLayer();await v.ctrl.motionStatus();
  await assert.rejects(v.ctrl.editMotion({action:"setTransform",compId:6,layerId:11,kind:"position",x:250,y:400}),{code:"INVALID_RECEIPT"});
  assert.equal(v.ctrl.getState().recoveryByStudio.motion,true);
});
test("U09 native keyframe creation is read back without inventing keyframe timestamps",async()=>{
  const v=await ready();v.addExistingLayer();await v.ctrl.motionStatus();
  const r=await v.ctrl.editMotion({action:"addKey",compId:6,layerId:11,property:"opacity",time:2,value:30});
  assert.equal(r.native,true);
  assert.equal(v.ctrl.getState().motion.layers[0].keyframes,1);
  await v.ctrl.editMotion({action:"easeKeys",compId:6,layerId:11,property:"opacity",times:[0,2]});
  assert.equal(v.ctrl.getState().motion.layers[0].keyframes,1);
});
test("U09 effect creation from uninspected layer still re-reads native UID and mask list",async()=>{
  const v=await ready();v.addExistingLayer();await v.ctrl.motionStatus();
  assert.equal(v.ctrl.getState().motion.inspector,null);
  await v.ctrl.editMotion({action:"addEffect",compId:6,layerId:11,effect:"gaussianBlur"});
  assert.equal(v.ctrl.getState().motion.inspector.effects[0].uid,41);
  assert.ok(v.calls.includes("listEffects"));
  assert.ok(v.calls.includes("listMasks"));
});
test("U09 native effect parameter/toggle/delete all have independent UID proof",async()=>{
  const v=await ready();v.addExistingLayer();await v.ctrl.motionStatus();
  await v.ctrl.editMotion({action:"addEffect",compId:6,layerId:11,effect:"gaussianBlur"});
  await v.ctrl.editMotion({action:"setEffectParameter",compId:6,layerId:11,uid:41,
    effect:"gaussianBlur",parameter:"blurriness",value:25});
  await v.ctrl.editMotion({action:"toggleEffect",compId:6,layerId:11,uid:41,enabled:false});
  assert.equal(v.ctrl.getState().motion.inspector.effects[0].enabled,false);
  await v.ctrl.editMotion({action:"removeEffect",compId:6,layerId:11,uid:41});
  assert.equal(v.ctrl.getState().motion.inspector.effects.length,0);
});
test("U09 effect UID absent from post-save native list is rejected",()=>{
  const r=verifyMotionEdit({request:{action:"addEffect",layerId:11,effect:"gaussianBlur"},
    receipt:{uid:41,id:"ec.blur.gaussian"},beforeLayers:[{id:11}],afterLayers:[{id:11}],
    inspector:{layer:{id:11},effects:[],masks:[]}});
  assert.deepEqual(r,{ok:false,reason:"New native effect UID or kind missing from readback"});
});
test("U09 actual closed native polygon mask and subsequent removal are verified by UID",async()=>{
  const v=await ready();v.addExistingLayer();await v.ctrl.motionStatus();
  await v.ctrl.editMotion({action:"addPolygonMask",compId:6,layerId:11,
    vertices:[[0,0],[100,0],[100,100],[0,100]]});
  assert.equal(v.ctrl.getState().motion.inspector.masks[0].closed,true);
  await v.ctrl.editMotion({action:"removeMask",compId:6,layerId:11,uid:51});
  assert.equal(v.ctrl.getState().motion.inspector.masks.length,0);
});
test("U09 native worker revision drift after readback quarantines without reporting edit verified",async()=>{
  const v=await ready({unstableStatus:true});v.addExistingLayer();
  await v.ctrl.motionStatus();
  await assert.rejects(v.ctrl.editMotion({action:"setTransform",compId:6,layerId:11,
    kind:"rotation",value:25}),{code:"REVISION_CONFLICT"});
  assert.equal(v.ctrl.getState().recoveryByStudio.motion,true);
});
test("U09 pure verifier rejects spoofed text receipts and wrong numeric Motion transform",()=>{
  const state={beforeLayers:[{id:11,name:"Title",kind:"Text",keyframes:0}],
    afterLayers:[{id:11,name:"Title",kind:"Text",position:[90,30,0],revision:4,keyframes:0}]};
  const wrong=verifyMotionEdit({...state,request:{action:"setTransform",layerId:11,
    kind:"position",x:20,y:30},receipt:{id:11,revision:4,position:[90,30,0]},inspector:null});
  assert.equal(wrong.ok,false);
  const bogus=verifyMotionEdit({...state,request:{action:"editText",layerId:11,text:"hello"},
    receipt:{id:999,kind:"Text"},inspector:null});
  assert.equal(bogus.ok,false);
  const fx=verifyMotionEdit({...state,request:{action:"removeEffect",layerId:11,uid:99},
    receipt:{removed:true,uid:99},inspector:{effects:[{uid:99}],masks:[]}});
  assert.equal(fx.ok,false);
});
test("U09 UI selects and re-inspects only a native-created Text or Shape layer",()=>{
  const s=readFileSync(new URL("../src/desktop-ui/workspace.ts",import.meta.url),"utf8");
  assert.match(s,/case "motion-text":[\s\S]*?selectedLayer=receipt\.id;[\s\S]*?await ctrl\.inspectMotionLayer\(receipt\.id\)/);
  assert.match(s,/case "motion-shape":[\s\S]*?selectedLayer=receipt\.id;[\s\S]*?await ctrl\.inspectMotionLayer\(receipt\.id\)/);
});
