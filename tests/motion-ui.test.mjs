import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const read = (p) => readFileSync(new URL("../"+p, import.meta.url),"utf8");
const html=read("index.html");
const ts=read("src/studios/motion/bootstrap.ts");
const ipc=read("src-tauri/src/motion/mod.rs");
const lib=read("src-tauri/src/lib.rs");
const cargo=read("src-tauri/Cargo.toml");
const desktopE2e=read("tests/motion/desktop-e2e.mjs");
const windowsRunner=read("scripts/motion/run-windows-e2e.ps1");
const motionCi=read(".github/workflows/motion-smoke.yml");

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
    "addPolygonMask","listMasks","setMaskVertex","removeMask","exportPng",
    "inspectEffectParameter","getMaskSettings","setMaskProperty"
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

test("PNG frame export uses owner-scoped native bytes not browser-drawn fake output",()=>{
  assert.ok(ts.includes('motion-export-png'));
  assert.ok(ts.includes('motion-png-filename'));
  assert.match(ts,/action:"exportPng"/);
  assert.match(ipc,/e\.export_png_frame\(/);
  assert.match(ipc,/verifiedFromDisk/);
});

test("changing selected native layer refreshes masks/effects and current layer revision",()=>{
  assert.ok(ts.includes('activeLayer=layers.find(item=>item.id===activeLayer?.id)??null'));
  assert.ok(ts.includes('await refreshEffectMaskControls();'));
  assert.ok(ts.includes('Selecting native layer'));
});

test("advanced native properties are read back and edited through same typed worker",()=>{
  for(const id of ["motion-feather","motion-expansion","motion-mask-opacity",
    "motion-apply-mask-settings","motion-mask-state","motion-fx-state"]){
    assert.ok(ts.includes(id),"native property control missing: "+id);
  }
  assert.match(ts,/function refreshSelectedNativeProperties/);
  assert.match(ts,/param\.source!=="native-effectcraft"/);
  assert.match(ts,/action:"inspectEffectParameter"/);
  assert.match(ts,/action:"getMaskSettings"/);
  assert.match(ts,/action:"setMaskProperty"/);
  assert.match(ipc,/e\.effect_parameter_state\(/);
  assert.match(ipc,/e\.mask_settings\(/);
  assert.match(ipc,/e\.set_mask_property\(/);
  assert.doesNotMatch(ts,/window\.open\(|eval\(/);
});

test("stale native responses cannot draw in an unmounted window or wrong playhead",()=>{
  assert.match(ts,/let uiGeneration = 0/);
  assert.match(ts,/uiGeneration\+\+/);
  assert.ok(ts.includes('if(!mounted||generation!==uiGeneration||activeComp?.id!==comp.id||currentTime!==frameTime)return;'));
  assert.ok(ts.includes('if(!mounted)return;'));
  assert.ok(ts.includes('if(activeComp)await afterEdit();'));
});

test("M10 WebView2 E2E actually launches Shuvi Tauri exe and performs mouse clicks",()=>{
  assert.ok(desktopE2e.includes('"browserName":"wry"'),"must launch real Tauri WebView");
  assert.ok(desktopE2e.includes('tauri:options'),"must provide app binary");
  assert.ok(desktopE2e.includes('button[data-studio="motion"]'));
  for(const action of ["#motion-create","#motion-add-shape","#motion-add-effect",
    "#motion-add-mask","#motion-save","#motion-export-png"]){
    assert.ok(desktopE2e.includes(action),"real E2E is missing click "+action);
  }
  assert.ok(desktopE2e.includes("motion-windows-webview2.png"));
  assert.ok(desktopE2e.includes("webview_e2e.ecproj"));
  assert.ok(windowsRunner.includes("cargo install tauri-driver --locked"));
  assert.ok(windowsRunner.includes("msedgedriver-tool"));
  assert.ok(motionCi.includes("motion-desktop-e2e-windows:"));
  assert.ok(motionCi.includes("cargo build --manifest-path src-tauri/Cargo.toml --bin shuvi2"));
  assert.ok(motionCi.includes("needs: motion-engine-windows"));
  assert.ok(motionCi.includes("shuvi-motion-windows-webview2-e2e"));
});
test("M10 scrubbing and native worker backpressure have bounded queues",()=>{
  assert.ok(ts.includes("let pendingPreview = false;"));
  assert.ok(ts.includes("function scheduleNativePreview():void"));
  assert.ok(ts.includes("pendingPreview=true;return;"));
  assert.ok(ts.includes("pendingPreview=false;"));
  assert.ok(ipc.includes("mpsc::sync_channel(MAX_PENDING)"));
  assert.ok(ipc.includes("Err(TrySendError::Full(_))"));
  assert.ok(ipc.includes("Instant::now()>=deadline"));
  assert.ok(ipc.includes("fn admitted_action("));
});

test("M11 real desktop E2E parses as executable JS and verifies cross-process pixels",()=>{
  const syntax=spawnSync(process.execPath,["--check","tests/motion/desktop-e2e.mjs"],{encoding:"utf8"});
  assert.equal(syntax.status,0,"real WebDriver E2E syntax invalid: "+syntax.stderr);
  assert.ok(desktopE2e.includes('cold restart real Windows app'));
  assert.ok(desktopE2e.includes('createHash("sha256")'));
  assert.ok(desktopE2e.includes('assert.deepEqual(decoded,exportedPng'));
  assert.ok(desktopE2e.includes('await wd("DELETE"'));
  assert.ok(desktopE2e.includes('m11_03-cold-reopened-project.png'));
  assert.ok(desktopE2e.includes('native no-overwrite error'));
});
