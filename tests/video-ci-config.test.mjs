import {test} from "node:test";
import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const root=resolve(import.meta.dirname,"..");
const read=(path)=>JSON.parse(readFileSync(resolve(root,path),"utf8"));
test("production Shuvi windows must never ship remote debugging flags",()=>{
  for(const filename of ["src-tauri/tauri.conf.json","src-tauri/tauri.video.conf.json"]){
    const config=read(filename);
    assert.ok(!JSON.stringify(config).includes("remote-debugging-port"),filename);
    for(const window of config.app?.windows??[])
      assert.equal(window.additionalBrowserArgs,undefined,filename);
  }
});
test("WebView2 CDP is enabled ONLY in explicit CI no-bundle overlay",()=>{
  const testConfig=read("src-tauri/tauri.video.e2e.conf.json");
  const windows=testConfig.app.windows;
  assert.equal(windows.length,1);
  assert.ok(windows[0].additionalBrowserArgs.includes("--remote-debugging-port=9222"));
  assert.ok(windows[0].dataDirectory.includes("ci"));
  assert.equal(testConfig.bundle,undefined);
});
