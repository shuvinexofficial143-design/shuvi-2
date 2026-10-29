import { test } from "node:test";
import { strict as assert } from "node:assert";
import {mediaItems,timelineClips,sequenceDuration,formatTimecode,localWindowsPath,requireNumber,TICKS_PER_SECOND} from "../src/studios/video/model.mjs";

test("FilmCraft project bins yield unique actual media ids, not sequence ids",()=>{
  const pr={root:{children:[{item:10,name:"clip.mp4",type:"Video"},{name:"Bin",children:[{item:10,name:"duplicate",type:"Video"},{item:14,name:"speech.wav",type:"Audio"}]},{item:18,name:"Sequence",type:"Sequence"}]}};
  assert.deepEqual(mediaItems(pr),[{itemId:10,name:"clip.mp4",type:"Video"},{itemId:14,name:"speech.wav",type:"Audio"}]);
  assert.deepEqual(mediaItems(null),[]);
});
test("FilmCraft real sequence.inspect video/audio track shapes map to timeline seconds",()=>{
  const seq={duration:2*TICKS_PER_SECOND,
    video:[{name:"V1",items:[{clip:100,item:10,name:"clip",start:0,duration:TICKS_PER_SECOND,startFrame:0,durationFrames:12}]}],
    audio:[{name:"A1",items:[{clip:101,item:11,name:"voice",start:TICKS_PER_SECOND,duration:TICKS_PER_SECOND,startFrame:12,durationFrames:12}]}]};
  assert.equal(sequenceDuration(seq),2);
  assert.deepEqual(timelineClips(seq).map(c=>[c.clipId,c.track,c.kind,c.start,c.duration]),[[100,"V1","video",0,1],[101,"A1","audio",1,1]]);
});
test("no fabricated timeline, invalid values ignored and expected timecode",()=>{
  assert.deepEqual(timelineClips({video:[{items:[{clip:0,item:2,start:0,duration:NaN}]}]}),[]);
  assert.equal(formatTimecode(65.025),"00:01:05.025");
  assert.equal(formatTimecode(-1),"—");
  assert.equal(localWindowsPath("C:\\Media\\project.fcproj"),true);
  assert.equal(localWindowsPath("\\\\server\\share\\movie.mp4"),true);
  assert.equal(localWindowsPath("../movie.mp4"),false);
  assert.equal(localWindowsPath("C:movie.mp4"),false);
  assert.equal(requireNumber("1.25",0,10),1.25);
  assert.throws(()=>requireNumber("Infinity",0,10));
  assert.throws(()=>requireNumber("",0,10));
});
