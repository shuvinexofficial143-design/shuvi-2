import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL("../"+p, import.meta.url),"utf8");
const html=read("index.html");
const ts=read("src/studios/motion/bootstrap.ts");
const ipc=read("src-tauri/src/motion/mod.rs");
const lib=read("src-tauri/src/lib.rs");
const cargo=read("src-tauri/Cargo.toml");

test("Motion lives in existing Shuvi single window without injecting a second editor",()=>{
  assert.match(html, /src\/main\.ts/);
  assert.match(html, /src\/studios\/motion\/bootstrap\.ts/);
  assert.match(ts, /querySelector<HTMLButtonElement>\('button\[data-studio="motion"\]'\)/);
  assert.match(ts, /originalPreview = preview\.innerHTML/);
  assert.match(ts, /originalTimeline = timeline\.innerHTML/);
  assert.doesNotMatch(ts, /window\.open\(|iframe|WebSocket/);
});
test("native worker is actually registered in Tauri invoke handler and state",()=>{
  assert.match(lib, /mod motion;/);
  assert.match(lib, /\.manage\(motion::MotionHost::new\(\)\)/);
  assert.match(lib, /motion::motion_command/);
  assert.match(cargo, /shuvi-motion-bridge = \{ path = "\.\.\/crates\/shuvi-motion-bridge" \}/);
  assert.match(cargo, /hayro-syntax.*storytold\/craft-libs/);
  assert.match(ipc, /shuvi_motion_bridge::\{/);
  assert.match(ipc, /thread::Builder::new\(\)/);
});
test("all manual editing actions go through native Tauri command",()=>{
  const actions=[
    "status","createComposition","listLayers","addText","addShape",
    "setTransform","addKey","easeKeys","render","saveProject","openProject",
    "addEffect","listEffects","setEffectParameter","toggleEffect","removeEffect",
    "addPolygonMask","listMasks","setMaskVertex","removeMask"
  ];
  for(const action of actions){
    assert.ok(ts.includes('action:"'+action+'"'),"UI request not wired for "+action);
  }
  assert.match(ts, /invoke<T>\("motion_command"/);
  assert.match(ipc, /\.render_preview\(/);
  assert.match(ipc, /\.save_project\(/);
  assert.match(ipc, /\.open_project\(/);
  assert.match(ipc, /\.ease_transform_keys\(/);
  assert.match(ipc, /\.set_transform\(/);
});
test("UI rejects unverified native preview rather than drawing fake frame",()=>{
  assert.match(ts, /frame\.source !== "native-effectcraft"/);
  assert.match(ts, /"data:image\/png;base64,"\+frame\.pngBase64/);
  assert.match(ts, /Native Save\/Reopen did not verify/);
  assert.ok(ts.includes("el.dataset.failure = String(failed);"));
  assert.doesNotMatch(ts, /"data:image\/svg/);
});

test("M08 native effect and mask UI is visibly connected to typed IPC",()=>{
  for(const id of ["motion-effect-kind","motion-effect-list","motion-mask-list",
    "motion-add-effect","motion-set-effect","motion-toggle-effect",
    "motion-remove-effect","motion-add-mask","motion-edit-mask","motion-remove-mask"]){
    assert.ok(ts.includes(id),"missing Motion editor control "+id);
  }
  assert.match(ipc, /e\.add_effect\(/);
  assert.match(ipc, /e\.set_effect_numeric\(/);
  assert.match(ipc, /e\.new_polygon_mask\(/);
  assert.match(ipc, /e\.set_mask_vertex\(/);
  assert.match(ipc, /e\.remove_mask\(/);
  assert.match(ipc, /userPlugin/);
  assert.doesNotMatch(ts,/eval\(|window\.open\(/);
});
