// M14: Validate the actual desktop WebDriver click contract before an expensive Windows native build.
// Static contract only: true UI interaction still requires Windows WebView2 CI.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=(p)=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const ui=read("src/studios/motion/bootstrap.ts");
const e2e=read("tests/motion/desktop-e2e.mjs");
const actionMap=[
  ["#motion-create","Creating composition"],
  ["#motion-add-shape","Creating shape"],
  ["#motion-add-effect","Applying native effect"],
  ["#motion-set-effect","Editing native effect parameter"],
  ["#motion-add-mask","Creating native polygon mask"],
  ["#motion-undo","Undoing native edit"],
  ["#motion-redo","Redoing native edit"],
  ["#motion-save","Saving native project"],
  ["#motion-export-png","Exporting native PNG"],
  ["#motion-open","Opening native project"],
];
test("WebDriver controls are actually mounted by real Motion pane",()=>{
  const buttons=[...e2e.matchAll(/(?:click|fill|attr|text)\(["'](#motion-[a-z-]+)/g)]
    .map(match=>match[1]).filter(x=>x!=="#motion-status");
  assert.ok(buttons.length>=15,"Expected broad native editing controls in Windows WebDriver");
  for(const id of new Set(buttons)){
    assert.ok(ui.includes('id="'+id.slice(1)+'"'),
      "Windows WebDriver calls a control missing in actual Motion UI: "+id);
  }
});
test("Windows WebDriver waits for exact completion of real native action labels",()=>{
  for(const [selector,label] of actionMap){
    assert.ok(e2e.includes('click("'+selector+'")'),"E2E does not click "+selector);
    assert.ok(e2e.includes('ready("'+label+' · native verification complete"'),
      "Missing expected native completion wait: "+label);
    assert.ok(ui.includes('bindClick("'+selector+'","'+label+'"'),
      "Real Motion UI does not bind exact completion label "+label);
  }
  assert.ok(e2e.includes('ready("Selecting native layer · native verification complete"'));
  assert.ok(ui.includes('void execute("Selecting native layer"'));
});
test("GUI evidence cannot be accepted through timeout, syntax errors or fake frames",()=>{
  assert.doesNotMatch(e2e,/async=>/);
  assert.match(e2e,/new FatalNativeUiError/);
  assert.match(e2e,/native no-overwrite error/);
  assert.match(e2e,/assert\.deepEqual\(decoded,exportedPng/);
  assert.match(e2e,/progress\.json/);
  assert.match(e2e,/receipt\.json/);
  assert.match(e2e,/motion-failed-webview-dom\.html/);
  assert.match(e2e,/coldRestartVerified=true/);
  assert.doesNotMatch(e2e,/page\.evaluate|mockInvoke|fakeRender/);
});
