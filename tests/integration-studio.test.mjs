import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const lib=read("src-tauri/src/lib.rs"),cargo=read("src-tauri/Cargo.toml");
const html=read("index.html"),motion=read("src/studios/motion/bootstrap.ts");
test("Video and Motion commands coexist in one Tauri Windows host",()=>{
  for(const item of ["mod video;","mod motion;","motion::motion_command","video_export_mp4","video_preview_frame","video_import_media","video_history_restore","motion::MotionHost::new()"])
    assert.ok(lib.includes(item),"Missing: "+item);
  for(const item of ["sha2","tauri-plugin-dialog","shuvi-motion-bridge","base64","hayro-jbig2"])
    assert.ok(cargo.includes(item),"Missing dependency: "+item);
});
test("both studios mount into the SAME window and Video DOM survives switching",()=>{
  assert.match(html,/src\/entry\.ts/); assert.ok(read("src/entry.ts").includes('await import("./main")'));
  assert.ok(read("src/entry.ts").includes('await import("./studios/motion/bootstrap")'));
  assert.match(motion,/originalPreviewNodes = Array\.from\(preview\.childNodes\)/);
  assert.match(motion,/originalTimelineNodes = Array\.from\(timeline\.childNodes\)/);
  assert.match(motion,/preview\.replaceChildren\(\.\.\.originalPreviewNodes\)/);
  assert.match(motion,/timeline\.replaceChildren\(\.\.\.originalTimelineNodes\)/);
});
