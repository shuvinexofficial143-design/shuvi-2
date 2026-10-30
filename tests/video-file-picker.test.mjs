import {test} from "node:test";
import {strict as assert} from "node:assert";
import {shouldInvalidateVideoProjectOnFilePick as invalidate} from "../src/studios/video/file-picker.mjs";
test("Save MP4 As and Browse Media never discard the currently edited project",()=>{
  assert.equal(invalidate("output"),false);
  assert.equal(invalidate("source"),false);
});
test("new root or .fcproj selection must invalidate cached native project SHA",()=>{
  for(const action of ["folder","project","newProject"])assert.equal(invalidate(action),true);
});
test("unknown picker actions cannot silently retain stale project paths",()=>{
  assert.throws(()=>invalidate("delete"));
  assert.throws(()=>invalidate(""));
});
