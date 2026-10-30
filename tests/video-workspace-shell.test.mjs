import {test} from "node:test";
import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
const dir=resolve(import.meta.dirname,"..");
test("video shell hides legacy demo screen/tracks at author-CSS precedence",()=>{
  const source=readFileSync(resolve(dir,"src/styles.css"),"utf8");
  assert.match(source,/\.workspace\.video-workspace \.preview > \.screen/);
  assert.match(source,/\.workspace\.video-workspace \.timeline > \.track/);
  assert.match(source,/\.workspace\.video-workspace \.timeline > \.v-lanes/);
  const ui=readFileSync(resolve(dir,"src/main.ts"),"utf8");
  assert.match(ui,/classList\.toggle\("video-workspace",video\)/);
});
test("strict real Windows UI test rejects fake screen and fake timeline",()=>{
  const source=readFileSync(resolve(dir,"scripts/video/windows-desktop-e2e.mjs"),"utf8");
  assert.match(source,/Old 'Live Editor Integration Pending' placeholder still visible/);
  assert.match(source,/Old mock timeline track visible/);
  assert.match(source,/v-program \.v-monitor/);
});
