import {test} from "node:test";
import {strict as assert} from "node:assert";
import {shouldRefreshVideoProjectAfterActionError as must} from "../src/studios/video/error-policy.mjs";
test("failed native edits must refresh actual saved project before next operation",()=>{
  for(const type of ["open","import","sequence","place","split","trim","move","delete","undo","redo","recover"]){
    assert.equal(must(type),true,type);
  }
});
test("rendering, probe and exporting do not imply changed .fcproj bytes",()=>{
  for(const type of ["preview","probe","export","unknown",""]){
    assert.equal(must(type),false,type);
  }
});
