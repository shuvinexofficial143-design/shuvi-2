import {test} from "node:test";
import {strict as assert} from "node:assert";
import {mediaBinView,mediaBinKind} from "../src/studios/video/media-bin.mjs";
test("actual FilmCraft items can be searched without fabricating media",()=>{
  const items=[{itemId:1,name:"Interview.MP4",type:"video"},{itemId:2,name:"Hindi Voice.wav",type:"audio"},{itemId:3,name:"Road.mp4",type:"video"}];
  const search=mediaBinView(items,"hindi");
  assert.equal(search.total,3);assert.equal(search.matching,1);
  assert.deepEqual(search.items.map(x=>x.itemId),[2]);
  assert.deepEqual(mediaBinView(items,"video").items.map(x=>x.itemId),[1,3]);
  assert.deepEqual(mediaBinView(items,"2").items.map(x=>x.itemId),[2]);
});
test("bin browser is bounded, read-only, and does not treat unknown IDs as files",()=>{
  const items=[{itemId:0,name:"fake",type:"video"},{itemId:1,name:"safe <img src=x onerror=alert(1)>",type:"video"}];
  assert.equal(mediaBinView(items).total,1);
  assert.equal(mediaBinView(items,"not found").matching,0);
  assert.equal(mediaBinView(Array.from({length:600},(_,i)=>({itemId:i+1,name:"f"+i,type:"video"}))).items.length,120);
  assert.deepEqual(items[1],{itemId:1,name:"safe <img src=x onerror=alert(1)>",type:"video"});
  assert.equal(mediaBinView(null).total,0);
  assert.equal(mediaBinKind({type:"Audio",itemId:2,name:"Voice"}),"Audio");
  assert.equal(mediaBinKind({type:"Video",itemId:3,name:"Clip"}),"Video");
  assert.equal(mediaBinKind({type:"Other",itemId:4,name:"Data"}),"Media");
});
test("invalid filter bounds are refused and never enumerate whole desktop",()=>{
  const items=[{itemId:1,name:"a",type:"video"}];
  assert.deepEqual(mediaBinView(items,"",999),{total:0,matching:0,items:[]});
  assert.deepEqual(mediaBinView(items,null),{total:0,matching:0,items:[]});
});
