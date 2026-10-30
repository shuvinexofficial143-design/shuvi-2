import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {RECENT_PROJECTS_KEY,createProjectSessionStore} from "../src/unified-workspace/session.mjs";
import {checkedAiVideoActions} from "../src/unified-workspace/ai-plan.mjs";
import {keyframeReadback} from "../src/unified-workspace/keyframes.mjs";
import {describeApprovalState} from "../src/unified-workspace/approval.mjs";
import {createWorkspaceController} from "../src/unified-workspace/core.mjs";
const hash=n=>String(n).repeat(64);
function memoryStore(){
  const data=new Map(),writes=[];
  return {data,writes,
    getItem:k=>data.get(k)??null,
    setItem:(k,v)=>{writes.push([k,v]);data.set(k,v);},
    removeItem:k=>data.delete(k)};
}
const split={type:"split",clipId:7,seconds:1.25};
test("U04 session bookmarks are opt-in and never fabricate native editor state",()=>{
  const mem=memoryStore(),a=createProjectSessionStore(mem);
  assert.equal(a.load(),null);assert.equal(mem.writes.length,0);
  const bookmark=a.rememberVideo("C:\\Owner","C:\\Owner\\movie.fcproj");
  assert.equal(bookmark.video.projectPath,"C:\\Owner\\movie.fcproj");
  assert.deepEqual(Object.keys(bookmark),["version","video"]);
  assert.ok(mem.data.has(RECENT_PROJECTS_KEY));
  assert.doesNotMatch(mem.data.get(RECENT_PROJECTS_KEY),/projectSha256|approved|chat|pngBytes/);
  const b=createProjectSessionStore(mem);
  assert.deepEqual(b.load(),bookmark);
  b.forget();assert.equal(b.load(),null);
});
test("bookmarks can independently retain verified Video and Motion paths",()=>{
  const a=createProjectSessionStore(memoryStore());
  a.rememberVideo("C:\\","C:\\film.fcproj");
  const both=a.rememberMotion("D:\\Motion","intro.ecproj");
  assert.equal(both.video.projectPath,"C:\\film.fcproj");
  assert.equal(both.motion.basename,"intro.ecproj");
  assert.equal(a.load().motion.workspace,"D:\\Motion");
});
test("untrusted or corrupt stored bookmarks fail closed without opening native projects",()=>{
  const storage=memoryStore();
  storage.data.set(RECENT_PROJECTS_KEY,'{"version":1,"video":{"root":"../../etc","projectPath":"x.fcproj"}}');
  const a=createProjectSessionStore(storage);
  assert.equal(a.load(),null);
  storage.data.set(RECENT_PROJECTS_KEY,"not-json");assert.equal(a.load(),null);
  storage.data.set(RECENT_PROJECTS_KEY,"x".repeat(7000));assert.equal(a.load(),null);
  assert.throws(()=>a.rememberVideo("../escape","x.fcproj"),/absolute/);
  assert.throws(()=>a.rememberMotion("C:\\Owner","..\\bad.ecproj"),/basename/);
  assert.throws(()=>a.rememberMotion("C:\\Owner","video.mp4"),/basename/);
});
test("storage write errors propagate, never claim a persisted project",()=>{
  const a=createProjectSessionStore({
    getItem(){return null;},setItem(){throw Error("quota unavailable");},removeItem(){}
  });
  assert.throws(()=>a.rememberVideo("C:\\Owner","C:\\Owner\\movie.fcproj"),/quota unavailable/);
  assert.throws(()=>createProjectSessionStore(null),/unavailable/);
});
test("UNC native paths are allowed, relative paths and UI scripts are not",()=>{
  const a=createProjectSessionStore(memoryStore());
  assert.equal(a.rememberVideo("\\\\srv\\share","\\\\srv\\share\\a.fcproj").video.root,"\\\\srv\\share");
  assert.throws(()=>a.rememberVideo("C:/Owner","C:/Owner/a.fcproj"),/absolute/);
  assert.throws(()=>a.rememberVideo("C:\\bad\\..\\escape","C:\\bad\\..\\escape\\a.fcproj"),/absolute/);
});
test("EffectCraft keyframe readback only displays native count; never guessed time points",()=>{
  assert.deepEqual(keyframeReadback({keyframes:2}),{verified:true,count:2,label:"2 native keyframes · times unavailable"});
  assert.equal(keyframeReadback({keyframes:0}).count,0);
  assert.equal(keyframeReadback({keyframes:"8"}).verified,false);
  assert.equal(keyframeReadback({keyframes:undefined}).verified,false);
  assert.equal(keyframeReadback({keyframes:-1}).verified,false);
});
test("AI Video plan accepts only exact Video edit schema from trusted handoff",()=>{
  assert.deepEqual(checkedAiVideoActions([split]),[split]);
  assert.notEqual(checkedAiVideoActions([split])[0],split);
  for(const action of [
    {type:"undo"}, {type:"redo"}, {type:"createSequence",name:"AI",width:640,height:480,fps:30},
    {...split,command:"shell"}, {type:"split",clipId:7,seconds:Infinity},
    {type:"split",clipId:0,seconds:0},{type:"place",itemId:3,track:"V1",seconds:0,video:false,audio:false},
    {type:"move",clipId:7,track:"V17",seconds:2,insert:false},
    {type:"delete",clipId:7,ripple:"yes"}
  ])assert.throws(()=>checkedAiVideoActions([action]));
  assert.throws(()=>checkedAiVideoActions(Array(13).fill(split)),/1–12/);
  assert.throws(()=>checkedAiVideoActions([]),/1–12/);
});
test("AI plan also rejects extra prototype and __proto__ payload attempts",()=>{
  assert.throws(()=>checkedAiVideoActions([Object.assign(Object.create({type:"split"}),split)]),/Unapproved/);
  const attack=JSON.parse('{"type":"split","clipId":7,"seconds":1,"__proto__":{"polluted":true}}');
  assert.throws(()=>checkedAiVideoActions([attack]),/exact typed/);
});
test("approval diagnostics cannot authorize Motion or missing native project",()=>{
  const base={studio:"motion",motion:{},video:null,pendingApproval:null,needsReload:false,recoveryStudio:null,busy:false};
  assert.equal(describeApprovalState(base).eligible,false);
  assert.equal(describeApprovalState(base).nativeGuarded,false);
  assert.equal(describeApprovalState({...base,studio:"video"}).eligible,false);
  const video={projectPath:"C:\\x.fcproj",snapshot:{projectSha256:hash("1")}};
  const pendingApproval={id:"task-1",actions:[split],projectPath:"C:\\x.fcproj",expectedSha:hash("1")};
  const result=describeApprovalState({...base,studio:"video",video,pendingApproval});
  assert.equal(result.eligible,true);assert.equal(result.nativeGuarded,false);
  assert.equal(describeApprovalState({...base,studio:"video",video,pendingApproval,
    needsReload:true,recoveryStudio:"video"}).eligible,false);
  assert.equal(describeApprovalState({...base,studio:"video",video,
    pendingApproval:{...pendingApproval,expectedSha:hash("9")}}).eligible,false);
});
test("typed Video staging requires explicit approval and remains disk-SHA scoped",async()=>{
  let sha=hash("1"),editCalls=0;
  const bridge={
    async videoSnapshot(root,path){return {projectPath:path,projectSha256:sha,sessionRevision:1,
      project:{root:{children:[]}},sequence:{video:[{items:[{clip:7,item:3,start:0,duration:254016000000}]}]}};},
    async videoTimeline(r){editCalls++;assert.equal(r.expectedProjectSha256,hash("1"));
      sha=hash("2");return {projectSha256:sha,commands:[{ok:true}]};},
    async videoImport(){throw Error("not used");},async videoPreview(){throw Error("not used");},
    async videoExport(){throw Error("not used");},async videoRestore(){throw Error("not used");},
    async motion(){throw Error("not used");}
  };
  const c=createWorkspaceController(bridge);
  await c.refreshVideo("C:\\Owner","C:\\Owner\\x.fcproj");
  assert.throws(()=>c.stageAiVideoTask([{type:"undo"}],hash("1")),{code:"UNSUPPORTED_ACTION"});
  const task=c.stageAiVideoTask([split],hash("1"));
  assert.equal(task.selectedRoot,"C:\\Owner");
  assert.equal(editCalls,0);
  await assert.rejects(c.approveTask("not-matching"),{code:"APPROVAL_REQUIRED"});
  await c.approveTask(task.id);
  assert.equal(editCalls,1);
  assert.equal(c.getState().pendingApproval,null);
  assert.equal(c.getState().video.snapshot.projectSha256,hash("2"));
});
test("reopen clears a staged AI plan, requiring fresh owner review",async()=>{
  const bridge={
    async videoSnapshot(root,path){return {projectPath:path,projectSha256:hash("1"),sessionRevision:1,
      project:{root:{children:[]}},sequence:null};},
    async videoTimeline(){throw Error("do not mutate");},
    async videoImport(){},async videoPreview(){},async videoExport(){},async videoRestore(){},async motion(){}
  };
  const c=createWorkspaceController(bridge);
  await c.refreshVideo("C:\\Owner","C:\\Owner\\x.fcproj");
  const task=c.stageAiVideoTask([split],hash("1"));
  await c.refreshVideo("C:\\Owner","C:\\Owner\\x.fcproj");
  assert.equal(c.getState().pendingApproval,null);
  await assert.rejects(c.approveTask(task.id),{code:"APPROVAL_REQUIRED"});
});
test("U04 UI wires real local bookmarks, native readback and inspector diagnostics",()=>{
  const src=readFileSync(new URL("../src/desktop-ui/workspace.ts",import.meta.url),"utf8");
  for(const action of ["bookmark-remember","bookmark-restore","bookmark-forget"])
    assert.match(src,new RegExp('case "'+action+'"'));
  assert.match(src,/createProjectSessionStore\(window\.localStorage\)/);
  assert.match(src,/ctrl\.refreshVideo\(saved\.video\.root,saved\.video\.projectPath\)/);
  assert.match(src,/ctrl\.openMotion\(saved\.motion\.workspace,saved\.motion\.basename\)/);
  assert.match(src,/keyframeReadback\(inspector\?\.layer\)/);
  assert.match(src,/describeApprovalState\(state\)/);
});

test("failed native Motion disk reopen quarantines state rather than showing stale composition",async()=>{
  let nativeCalls=0;
  const bridge={
    async motion(request){
      nativeCalls++;
      if(request.action==="openProject")return {verifiedFromDisk:true,compositions:[{id:4,name:"Native"}]};
      if(request.action==="status")return {native:true,ready:true,projectRevision:1};
      if(request.action==="listLayers")throw Error("Native disk readback failed");
      throw Error("unexpected action");
    },
    async videoSnapshot(){},async videoTimeline(){},async videoImport(){},
    async videoPreview(){},async videoExport(){},async videoRestore(){}
  };
  const c=createWorkspaceController(bridge);
  await assert.rejects(c.openMotion("C:\\Owner","native.ecproj"),/readback failed/);
  assert.equal(c.getState().needsReload,true);
  assert.equal(c.getState().recoveryStudio,"motion");
  assert.equal(c.getState().motion.composition,null);
  assert.equal(c.getState().motion.ready,false);
  assert.ok(nativeCalls>=3);
});
test("native Motion save post-write status drift requires recovery",async()=>{
  let rev=1;
  const bridge={
    async motion(req){
      if(req.action==="createComposition")return {id:4,revision:rev,name:"Native"};
      if(req.action==="listLayers")return [];
      if(req.action==="saveProject"){rev=4;return {verifiedFromDisk:true,bytes:256};}
      if(req.action==="status")return {ready:true,native:true,projectRevision:rev,dirty:true};
      throw Error("unexpected action");
    },
    async videoSnapshot(){},async videoTimeline(){},async videoImport(){},
    async videoPreview(){},async videoExport(){},async videoRestore(){}
  };
  const c=createWorkspaceController(bridge);
  await c.createComposition({name:"Native",width:1280,height:720,fps:30,durationSeconds:4});
  await assert.rejects(c.saveMotion("C:\\Owner","native.ecproj"),{code:"REVISION_CONFLICT"});
  assert.equal(c.getState().needsReload,true);
  assert.equal(c.getState().recoveryStudio,"motion");
});
test("single-window Chat width control clamps and cleans up on dispose",()=>{
  const src=readFileSync(new URL("../src/desktop-ui/workspace.ts",import.meta.url),"utf8");
  assert.match(src,/data-field="chatWidth"/);
  assert.match(src,/Math\.max\(240,Math\.min\(420,width\)\)/);
  assert.match(src,/root\.addEventListener\("input",onInput\)/);
  assert.match(src,/root\.removeEventListener\("input",onInput\)/);
  assert.match(src,/root\.style\.removeProperty\("--chat-width"\)/);
});
