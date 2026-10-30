import {test} from "node:test";
import {strict as assert} from "node:assert";
import {realClipDetail,realSequenceMarkers,revealTimeOffset} from "../src/studios/video/inspect.mjs";
import {timelineViewport} from "../src/studios/video/viewport.mjs";
const T=254016000000;
const seq={
 video:[{locked:true,items:[{clip:19,item:8,name:"Interview A",start:T*20,duration:T*5,
 startFrame:480,durationFrames:120,sourceIn:T*4,sourceOut:T*9,
 speed:1.5,reverse:false,enabled:true,gainDb:-3.5,effects:[{effect:"blur"}]}]}],
 audio:[{items:[{clip:21,item:9,name:"VO",start:0,duration:T*8}]}],
 markers:[{id:2,start:T*19,duration:0,name:"Second",comment:"Review"},
 {id:1,start:T*5,duration:0,name:"First"},{id:2,start:T*19,name:"Duplicate"},{id:3,start:-1,name:"Bad"}]
};
test("inspector reads native source time, rate, lock and effects",()=>{
 const c=realClipDetail(seq,19);
 assert.equal(c.track,"V1");assert.equal(c.itemId,8);
 assert.equal(c.start,20);assert.equal(c.sourceIn,4);assert.equal(c.sourceOut,9);
 assert.equal(c.effectCount,1);assert.equal(c.speed,1.5);assert.equal(c.locked,true);
 assert.equal(realClipDetail(seq,999),null);
 assert.equal(realClipDetail(null,19),null);
});
test("native markers sorted; invalid and duplicate entries dropped",()=>{
 const m=realSequenceMarkers(seq);
 assert.deepEqual(m.map(x=>x.id),[1,2]);
 assert.deepEqual(m.map(x=>x.start),[5,19]);
 assert.deepEqual(realSequenceMarkers({markers:"none"}),[]);
});
test("viewport reveal centers offscreen clip without a project edit",()=>{
 const view=timelineViewport(7200,8,0);
 assert.equal(revealTimeOffset(100,view),0);
 assert.equal(revealTimeOffset(2000,view),1550);
 assert.equal(revealTimeOffset(10000,view),6300);
 assert.equal(revealTimeOffset(NaN,view),null);
});

test("null viewport is a benign no-navigation state, not a crash",()=>{
  assert.equal(revealTimeOffset(1,null),null);
  assert.equal(revealTimeOffset(Infinity,{start:0,end:1,duration:1,maxStart:0}),null);
});
