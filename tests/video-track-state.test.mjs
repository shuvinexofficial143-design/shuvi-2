import {test} from "node:test";
import {strict as assert} from "node:assert";
import {videoTrackStates,videoActionPreflight as check} from "../src/studios/video/track-state.mjs";
const seq={
 video:[{name:"Picture Lock",locked:true,muted:false,solo:false,enabled:true,
  items:[{clip:7,item:3,start:0,duration:254016000000}]},
  {name:"Open Track",locked:false,muted:false,enabled:true,items:[{clip:8,item:3,start:0,duration:254016000000}]}],
 audio:[{name:"VO",locked:false,muted:true,enabled:false,solo:false,items:[{clip:9,item:5,start:0,duration:254016000000}]}]
};
test("native FilmCraft track flags are presented without invented values",()=>{
  const tracks=videoTrackStates(seq);
  assert.deepEqual(tracks.map(x=>x.track),["V1","V2","A1"]);
  assert.equal(tracks[0].locked,true);
  assert.equal(tracks[2].muted,true);
  assert.equal(tracks[2].enabled,false);
  assert.equal(tracks[1].name,"Open Track");
});
test("cannot edit or place into locked saved FilmCraft tracks",()=>{
  for(const type of ["split","trim","delete","move"]){
    const result=check({type,clipId:7,track:"V2"},seq);
    assert.equal(result.ok,false,type);
  }
  assert.equal(check({type:"place",track:"V1"},seq).ok,false);
  assert.equal(check({type:"move",clipId:8,track:"V1"},seq).ok,false);
  assert.equal(check({type:"move",clipId:8,track:"A1"},seq).ok,false);
});
test("unlocked real clips remain editable; unknown clips fail closed",()=>{
  assert.equal(check({type:"move",clipId:8,track:"V2"},seq).ok,true);
  assert.equal(check({type:"split",clipId:8},seq).ok,true);
  assert.equal(check({type:"delete",clipId:999},seq).ok,false);
  assert.equal(check({type:"undo"},seq).ok,true);
  assert.equal(check({type:"createSequence"},null).ok,true);
  assert.equal(check({type:"totallyUnknown"},seq).ok,false);
  assert.equal(check({type:"place",track:"V4"},seq).ok,true);
});
