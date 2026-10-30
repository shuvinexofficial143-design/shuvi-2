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

test("native Windows canonical FilmCraft readback is used for edits and static M0 splash is removed",()=>{
  const view=read("src/studios/video/view.ts");
  const shell=read("src/main.ts");
  const installed=read("scripts/release/video-installed-e2e.mjs");
  const rust=read("src-tauri/src/video/timeline.rs");
  assert.match(rust,/fs::canonicalize\(file\)/);
  assert.match(view,/value\("project"\)!==p\.projectPath/);
  assert.match(view,/value\("root"\)!==p\.selectedRoot/);
  assert.match(view,/e<HTMLInputElement>\("project"\)\.value=found\.projectPath/);
  assert.match(view,/snapshot=found;history=h;clearFrame\(\);draw\(\);return found/);
  assert.match(installed,/canonicalProjectPath=await driver\.property/);
  assert.match(installed,/result\.canonicalProjectPath/);
  assert.match(shell,/\.preview > \.screen/);
  assert.match(shell,/Native editing · AI offline/);
});

test("Rust native FilmCraft Tauri action deserializer accepts every frontend camelCase field",()=>{
  const rust=read("src-tauri/src/video/timeline.rs");
  const ts=read("src/studios/video/timeline.ts");
  assert.match(rust,/rename_all_fields = "camelCase"/);
  for(const field of ["itemId","clipId","deltaFrames"]) {
    assert.ok(ts.includes(field),"missing typed browser action field "+field);
    assert.ok(rust.includes('"'+field+'"'),"missing exact Rust serde regression fixture for "+field);
  }
  assert.match(rust,/browser_camelcase_actions_deserialize_into_real_native_timeline_commands/);
  const e2e=read("scripts/release/video-installed-e2e.mjs");
  assert.match(e2e,/real owner-click FilmCraft split with native disk readback/);
  assert.match(e2e,/assert\.notEqual\(after,before/);
  assert.match(e2e,/nativeSplitVerified=true/);
  assert.match(e2e,/both actual split clips must survive disk reopen/);
  assert.match(e2e,/video-native-split\.png/);
});
