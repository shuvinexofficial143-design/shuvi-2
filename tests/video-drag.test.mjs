import {test} from "node:test";
import {strict as assert} from "node:assert";
import {clipDragDestination as move} from "../src/studios/video/drag.mjs";
test("drag translates native clip location to sequence frames",()=>{
  assert.equal(move({start:0,deltaPixels:100,lanePixels:400,visibleSeconds:2,fps:12}),0.5);
  assert.equal(move({start:1,deltaPixels:-100,lanePixels:200,visibleSeconds:2,fps:24}),0);
  assert.equal(move({start:0,deltaPixels:4,lanePixels:400,visibleSeconds:1,fps:25}),0);
});
test("horizontal clip drag is bounded, finite and rejects corrupt geometry",()=>{
  assert.equal(move({start:1,deltaPixels:999999,lanePixels:400,visibleSeconds:1,fps:30}),1);
  for(const args of [
    {start:0,deltaPixels:100,lanePixels:0,visibleSeconds:1,fps:30},
    {start:0,deltaPixels:100,lanePixels:400,visibleSeconds:1,fps:0},
    {start:0,deltaPixels:NaN,lanePixels:400,visibleSeconds:1,fps:24},
    {start:0,deltaPixels:0,lanePixels:400,visibleSeconds:0,fps:24}
  ])assert.equal(move(args),null);
});

test("fractional sequence end never rounds drag beyond last frame",()=>{
  const result=move({start:0.85,deltaPixels:150,lanePixels:200,visibleSeconds:0.95,fps:24});
  assert.ok(result<=0.95, "Drag must not move beyond the end of the visible lane");
  assert.equal(result,Math.floor(0.95*24)/24);
});
test("drag supports extending past original clip start but never exceeds visible sequence",()=>{
  assert.equal(move({start:0,deltaPixels:100,lanePixels:400,visibleSeconds:1,fps:12}),0.25);
  assert.equal(move({start:0.5,deltaPixels:1000,lanePixels:400,visibleSeconds:1,fps:12}),1);
});
