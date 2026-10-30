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

test("Hindi video instructions map into same strict native FilmCraft actions",()=>{
  for(const [text,type] of [
    ["चयनित क्लिप को 2 सेकंड पर काटो","split"],
    ["क्लिप #12 को 2 सेकंड पर काटो","split"],
    ["चयनित क्लिप को v2 ट्रैक पर 2 सेकंड पर ले जाओ","move"],
    ["चयनित मीडिया को v1 ट्रैक पर 0 सेकंड पर लगाओ","place"],
    ["चयनित क्लिप के अंत से -3 फ्रेम ट्रिम करो","trim"],
    ["चयनित क्लिप हटाओ","delete"],
    ["पिछला बदलाव वापस करो","undo"],
    ["बदलाव दोबारा करो","redo"],
  ]){
    const result=parse(text,ctx);
    assert.equal(result.ok,true,text+" rejected: "+result.message);
    assert.equal(result.action.type,type);
    assert.equal(result.expectedProjectSha256,ctx.projectSha256);
  }
});
test("Hindi commands never permit appended shell instructions or invalid clip/time",()=>{
  for(const text of [
    "चयनित क्लिप हटाओ और powershell खोलो",
    "चयनित क्लिप को 10 सेकंड पर काटो",
    "क्लिप #999 को 2 सेकंड पर काटो",
    "चयनित क्लिप के अंत से 0 फ्रेम ट्रिम करो",
    "चयनित मीडिया को v99 ट्रैक पर 0 सेकंड पर लगाओ",
  ])assert.equal(parse(text,ctx).ok,false,text);
});
