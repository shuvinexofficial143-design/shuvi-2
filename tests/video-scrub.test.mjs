import {test} from "node:test";
import {strict as assert} from "node:assert";
import {createPreviewCoordinator} from "../src/studios/video/scrub.mjs";

const HASH = "a".repeat(64);
const req = seconds => ({selectedRoot:"C:\\Movies",projectPath:"C:\\Movies\\edit.fcproj",
  expectedRevision:1,expectedProjectSha256:HASH,seconds,scale:0.25});
const frame = seconds => ({projectSha256:HASH,seconds,width:32,height:32,pngBytes:[137,80,78,71]});
const tick = () => new Promise(resolve=>setImmediate(resolve));
function fakeClock(){
  let seq=0;const calls=new Map();
  return {
    schedule:(cb,delay)=>{const id=++seq;calls.set(id,{cb,delay});return id;},
    cancel:id=>calls.delete(id),
    fire:()=>{const [id,next]=calls.entries().next().value??[];if(id!==undefined){calls.delete(id);next.cb();}},
    get size(){return calls.size;}
  };
}
test("scrubbing coalesces burst to one latest real native render",async()=>{
  const clock=fakeClock(),executed=[],shown=[],errors=[];
  const ctl=createPreviewCoordinator(async r=>{executed.push(r.seconds);return frame(r.seconds);},r=>shown.push(r.seconds),e=>errors.push(e),clock);
  ctl.request(req(0));ctl.request(req(.2));ctl.request(req(.75));
  assert.equal(clock.size,1);
  clock.fire();await tick();
  assert.deepEqual(executed,[.75]);assert.deepEqual(shown,[.75]);assert.deepEqual(errors,[]);
});
test("only one render in flight, queued latest wins, stale frames discarded",async()=>{
  const clock=fakeClock(), shown=[],started=[],resolvers=[];
  const ctl=createPreviewCoordinator(r=>{
    started.push(r.seconds);
    return new Promise(resolve=>resolvers.push(resolve));
  },r=>shown.push(r.seconds),e=>{throw e;},clock);
  ctl.request(req(1));clock.fire();await tick();
  ctl.request(req(2));ctl.request(req(3));
  assert.deepEqual(started,[1]);
  resolvers.shift()(frame(1));await tick();
  assert.deepEqual(shown,[]);
  clock.fire();await tick();
  assert.deepEqual(started,[1,3]);
  resolvers.shift()(frame(3));await tick();
  assert.deepEqual(shown,[3]);
});
test("pause-and-drain blocks edits until real in-flight render finishes",async()=>{
  const clock=fakeClock();let finish,done=false,shown=[];
  const ctl=createPreviewCoordinator(()=>new Promise(resolve=>{finish=resolve;}),r=>shown.push(r.seconds),()=>{},clock);
  ctl.request(req(4));clock.fire();await tick();
  const paused=ctl.pauseAndDrain().then(()=>{done=true;});
  ctl.request(req(8));
  assert.equal(clock.size,0);
  assert.equal(done,false);
  finish(frame(4));await paused;await tick();
  assert.equal(done,true);assert.deepEqual(shown,[]);
  ctl.resume();ctl.request(req(9));assert.equal(clock.size,1);
  ctl.dispose();assert.equal(clock.size,0);
});
test("native failure is surfaced only for newest request, dispose suppresses callbacks",async()=>{
  const clock=fakeClock(), errors=[];
  let reject;
  const ctl=createPreviewCoordinator(()=>new Promise((_,r)=>{reject=r;}),()=>{},e=>errors.push(String(e)),clock);
  ctl.request(req(2));clock.fire();await tick();
  ctl.request(req(3));reject(new Error("old failure"));await tick();
  assert.deepEqual(errors,[]);
  clock.fire();await tick();
  ctl.dispose();reject(new Error("new failure"));await tick();
  assert.deepEqual(errors,[]);
  assert.equal(ctl.request(req(1)),false);
});
test("rejects invalid input without dispatching native engine",()=>{
  const ctl=createPreviewCoordinator(async r=>r,()=>{},()=>{});
  assert.throws(()=>ctl.request({...req(1),seconds:Infinity}),/Invalid preview/);
  assert.throws(()=>ctl.request({...req(1),expectedProjectSha256:"abc"}),/Invalid preview/);
  ctl.dispose();
  assert.equal(ctl.request(req(2)),false);
});
