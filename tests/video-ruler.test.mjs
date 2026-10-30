import {test} from "node:test";
import {strict as assert} from "node:assert";
import {rulerTicks,rulerSeekTime,percentOnRuler} from "../src/studios/video/ruler.mjs";
import {timelineViewport} from "../src/studios/video/viewport.mjs";
test("real 2-hour timeline ruler has bounded valid ticks at 1x and 32x",()=>{
  for(const zoom of [1,2,4,8,16,32]){
    const v=timelineViewport(7200,zoom,Math.min(3600,7000*(1-1/zoom)));
    const ticks=rulerTicks(v);
    assert.ok(ticks.length>=2&&ticks.length<=12,zoom);
    assert.ok(ticks.every(t=>t.seconds>=v.start&&t.seconds<=v.end),zoom);
    assert.ok(ticks.every(t=>t.percent>=0&&t.percent<=100),zoom);
    assert.ok(ticks.every((t,i)=>i===0||t.seconds>ticks[i-1].seconds),zoom);
  }
});
test("clicking real ruler snaps to saved 12fps frame and rejects clip EOF",()=>{
  const v=timelineViewport(1,1,0);
  assert.equal(rulerSeekTime(150,{left:100,width:400},v,12),2/12);
  assert.equal(rulerSeekTime(300,{left:100,width:400},v,12),0.5);
  assert.equal(rulerSeekTime(500,{left:100,width:400},v,12),11/12);
  assert.equal(rulerSeekTime(-300,{left:100,width:400},v,12),0);
});
test("zoomed ruler click uses absolute project seconds, not relative clip offset",()=>{
  const v=timelineViewport(7200,16,2000);
  assert.equal(rulerSeekTime(200,{left:100,width:400},v,30),2112.5);
  assert.equal(percentOnRuler(2000,v),0);
  assert.equal(percentOnRuler(2225,v),50);
  assert.equal(percentOnRuler(100,v),null);
});
test("invalid ruler geometry or frame metadata never triggers preview",()=>{
  const v=timelineViewport(10,2,0);
  assert.equal(rulerSeekTime(NaN,{left:0,width:100},v,24),null);
  assert.equal(rulerSeekTime(10,{left:0,width:0},v,24),null);
  assert.equal(rulerSeekTime(10,{left:0,width:100},v,0),null);
  assert.deepEqual(rulerTicks(null),[]);
  assert.equal(percentOnRuler(NaN,v),null);
});

test("fractional saved sequence duration allows its final valid sample",()=>{
  const v=timelineViewport(0.95,1,0);
  assert.equal(rulerSeekTime(100,{left:0,width:100},v,24),22/24);
  const short=timelineViewport(1/30,1,0);
  assert.equal(rulerSeekTime(100,{left:0,width:100},short,30),0);
});
