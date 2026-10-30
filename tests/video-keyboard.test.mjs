import {test} from "node:test";
import {strict as assert} from "node:assert";
import {videoKeyboardCommand as cmd} from "../src/studios/video/keyboard.mjs";
test("Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y map to real history actions",()=>{
  assert.equal(cmd({key:"z",ctrlKey:true},false),"undo");
  assert.equal(cmd({key:"Z",ctrlKey:true,shiftKey:true},false),"redo");
  assert.equal(cmd({key:"y",ctrlKey:true},false),"redo");
});
test("Arrow frames activate only when not editing a text field",()=>{
  assert.equal(cmd({key:"ArrowLeft"},false),"back");
  assert.equal(cmd({key:"ArrowRight"},false),"forward");
  assert.equal(cmd({key:"ArrowRight"},true),null);
});
test("Never steal browser input undo, IME or system shortcuts",()=>{
  assert.equal(cmd({key:"z",ctrlKey:true},true),null);
  assert.equal(cmd({key:"z",metaKey:true},false),null);
  assert.equal(cmd({key:"z",ctrlKey:true,isComposing:true},false),null);
  assert.equal(cmd({key:"z",ctrlKey:true,altKey:true},false),null);
  assert.equal(cmd({key:"ArrowRight",shiftKey:true},false),null);
});
