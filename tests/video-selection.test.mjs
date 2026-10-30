import {test} from "node:test";
import {strict as assert} from "node:assert";
import {matchingVideoSelection as matches} from "../src/studios/video/selection.mjs";
test("original Windows short-path project spelling is stable across native canonicalization",()=>{
 const selected={selectedRoot:"C:\\Users\\RUNNER~1\\AppData\\Temp",
  projectPath:"C:\\Users\\RUNNER~1\\AppData\\Temp\\edit.fcproj"};
 const nativeCanonical={selectedRoot:"C:\\Users\\runneradmin\\AppData\\Temp",
  projectPath:"C:\\Users\\runneradmin\\AppData\\Temp\\edit.fcproj"};
 assert.equal(matches(selected,selected),true);
 assert.equal(matches(selected,nativeCanonical),false,
  "Never assume text aliases are equal; instead retain the original selected spelling");
 assert.equal(matches({...selected,projectPath:"C:/Users/RUNNER~1/AppData/Temp/edit.fcproj"},selected),true);
});
test("switching roots/projects must force explicit fresh FilmCraft inspect",()=>{
 const opened={selectedRoot:"C:\\Videos",projectPath:"C:\\Videos\\a.fcproj"};
 assert.equal(matches({...opened,projectPath:"C:\\Videos\\b.fcproj"},opened),false);
 assert.equal(matches({...opened,selectedRoot:"D:\\Videos"},opened),false);
 assert.equal(matches(null,opened),false);
 assert.equal(matches(opened,null),false);
 assert.equal(matches({selectedRoot:"",projectPath:""},opened),false);
});
