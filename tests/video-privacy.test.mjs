import {test} from "node:test";
import {strict as assert} from "node:assert";
import {canSubmitVideoAiRequest as can} from "../src/studios/video/privacy.mjs";
test("real model call requires explicit session-level share consent",()=>{
  assert.equal(can({mode:"openai",optedIn:true,prompt:"Split selected at two seconds"}),true);
  assert.equal(can({mode:"openai",optedIn:false,prompt:"Split"}),false);
  assert.equal(can({mode:"local",optedIn:true,prompt:"Split"}),false);
});
test("blank, maliciously long or binary prompt cannot trigger paid API request",()=>{
  for(const prompt of ["","  ","x".repeat(701),"split\0 delete"]){
    assert.equal(can({mode:"openai",optedIn:true,prompt}),false);
  }
});
