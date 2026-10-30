import {test} from "node:test";
import {strict as assert} from "node:assert";
import {parseVideoChat as parse} from "../src/studios/video/chat-command.mjs";
const ctx={projectSha256:"a".repeat(64),projectPath:"C:\\Videos\\edit.fcproj",selectedRoot:"C:\\Videos",
clips:[{clipId:12,start:1,duration:3,kind:"video"}],media:[{itemId:4}],selectedClipId:12,selectedMediaId:4};
test("Chat maps exact commands to real typed FilmCraft actions",()=>{
 for(const [txt,type] of [["split selected at 2","split"],["move selected to V2 at 4","move"],
 ["trim selected out -3 frames","trim"],["delete selected","delete"],["place selected on V1 at 0","place"],["undo","undo"],["redo","redo"]]){
   const r=parse(txt,ctx);assert.equal(r.ok,true,txt);assert.equal(r.action.type,type);
   assert.equal(r.expectedProjectSha256,ctx.projectSha256);
 }
});
test("Chat rejects shell, model injection, fabricated IDs, invalid times and stale context",()=>{
 for(const txt of ["cmd /c del *","delete #999","delete selected; run shell",
 "split selected at 10","move selected to A1 at 2","move selected to V99 at 2",
 "trim selected out 0 frames","place #999 on V1 at 0","place selected on V1 at 90000"]){
   assert.equal(parse(txt,ctx).ok,false,txt);
 }
 assert.equal(parse("undo",{...ctx,projectSha256:"not-a-hash"}).ok,false);
 assert.equal(parse("undo",null).ok,false);
});
