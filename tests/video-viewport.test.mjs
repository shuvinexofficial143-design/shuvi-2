import {test} from "node:test";
import {strict as assert} from "node:assert";
import {timelineViewport as viewport,clipViewportBounds as bounds} from "../src/studios/video/viewport.mjs";
test("long 2-hour FilmCraft project supports bounded 8x zoom without mutating clip",()=>{
  const v=viewport(7200,8,2000);
  assert.equal(v.start,2000);assert.equal(v.duration,900);
  assert.equal(v.end,2900);assert.equal(v.total,7200);
  const clip={start:2100,duration:10};
  const b=bounds(clip,v);
  assert.ok(b.leftPercent>0&&b.leftPercent<100);
  assert.ok(b.widthPercent>0&&b.widthPercent<3);
  assert.deepEqual(clip,{start:2100,duration:10});
});
test("viewport pan clamps to last valid start time",()=>{
  const v=viewport(7200,16,999999);
  assert.equal(v.duration,450);assert.equal(v.start,6750);
  assert.equal(v.end,7200);
  assert.equal(viewport(10,1,9).start,0);
});
test("partly visible clips clip to viewport and offscreen clips are hidden",()=>{
  const v=viewport(100,10,40);
  assert.deepEqual(bounds({start:38,duration:5},v),{
    leftPercent:0,widthPercent:30,clippedLeft:true,clippedRight:false,
  });
  assert.deepEqual(bounds({start:48,duration:10},v),{
    leftPercent:80,widthPercent:20,clippedLeft:false,clippedRight:true,
  });
  assert.equal(bounds({start:70,duration:5},v),null);
  assert.equal(bounds({start:50,duration:5},v),null);
});
test("invalid durations, zoom, nan and zero-duration clips rejected",()=>{
  assert.equal(viewport(100,0),null);
  assert.equal(viewport(100,100),null);
  assert.equal(viewport(Infinity,8),null);
  assert.equal(bounds({start:0,duration:0},viewport(100,2)),null);
});
