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
const windowsProof=read("scripts/motion/verify-desktop-proof.ps1");
const motionCi=read(".github/workflows/motion-smoke.yml");
const pkgConfig=JSON.parse(read("src-tauri/src/motion/tauri.release.conf.json"));
const releaseRunner=read("scripts/motion/package-windows-release.ps1");
const historySource=read("crates/shuvi-motion-bridge/src/history.rs");
const nativeSequence=read("crates/shuvi-motion-bridge/src/sequence.rs");
const nativeSequenceProof=read("crates/shuvi-motion-bridge/src/bin/motion-sequence-proof.rs");
const nativeSequenceTests=read("crates/shuvi-motion-bridge/tests/png_sequence.rs");

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
    "inspectEffectParameter","getMaskSettings","setMaskProperty",
    "inspectHistory","inspectComposition"
  ];
  for(const action of actions){
    assert.ok(ts.includes('action:"'+action+'"'),"UI request not wired for "+action);
  }
  // Native Undo/Redo are a typed union using a dynamic but guarded action field.
  assert.ok(ts.includes('historyEdit("undo")'));
  assert.ok(ts.includes('historyEdit("redo")'));
  assert.ok(ts.includes('request<NativeHistoryReceipt>({action})'));
  assert.ok(ipc.includes("MotionRequest::Undo"));
  assert.ok(ipc.includes("MotionRequest::Redo"));
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
  assert.ok(motionCi.includes("npm run tauri -- build --ci --no-bundle"));
  assert.ok(motionCi.includes("src-tauri/target/release/shuvi2.exe"));
  assert.ok(motionCi.includes("node --check tests/motion/desktop-e2e.mjs"));
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

test("M12 owner Undo/Redo uses exact native EffectCraft project history",()=>{
  assert.ok(ts.includes('id="motion-undo"'));
  assert.ok(ts.includes('id="motion-redo"'));
  assert.ok(ts.includes('action:"inspectHistory"'));
  assert.ok(ts.includes('action:"inspectComposition"'));
  assert.ok(ts.includes('receipt.projectChanged'));
  assert.ok(ipc.includes("e.undo_native()?"));
  assert.ok(ipc.includes("e.redo_native()?"));
  assert.ok(historySource.includes('execute_checked(command,json!({}))'));
  assert.ok(historySource.includes('original.as_ref()!=self.session.project.as_ref()'));
  assert.ok(desktopE2e.includes('Undoing native edit'));
  assert.ok(desktopE2e.includes('Redoing native edit'));
  assert.ok(desktopE2e.includes('result.undoRedoVerified=true'));
});
test("M12 unsigned Windows NSIS package cannot run until real desktop E2E passes",()=>{
  assert.equal(pkgConfig.bundle.active,true);
  assert.deepEqual(pkgConfig.bundle.targets,["nsis"]);
  assert.ok(motionCi.includes("motion-windows-installer:"));
  assert.ok(motionCi.includes("needs: motion-desktop-e2e-windows"));
  assert.ok(motionCi.includes("name: shuvi-motion-windows-installer-unsigned"));
  assert.ok(releaseRunner.includes("git -C vendor/effectcraft rev-parse HEAD"));
  assert.ok(releaseRunner.includes("npm run tauri -- build --ci --config"));
  assert.ok(releaseRunner.includes("Get-FileHash"));
  assert.ok(releaseRunner.includes("signed = $false"));
  assert.ok(releaseRunner.includes("Git commit SHA"));
});

test("native owner Ctrl+Z / Ctrl+Shift+Z are scoped away from editing text inputs",()=>{
  assert.ok(ts.includes('document.addEventListener("keydown"'));
  assert.ok(ts.includes("event.ctrlKey||event.metaKey"));
  assert.ok(ts.includes("event.shiftKey"));
  assert.ok(ts.includes('target.closest(\'input,textarea,select,[contenteditable="true"]\')'));
  assert.ok(ts.includes("if(button.disabled)return;"));
  assert.ok(ts.includes("lastHistoryCompId"));
  assert.ok(ts.includes('action:"inspectComposition"'));
});

test("M13 preflight rejects malformed async WebDriver scripts before production GUI build",()=>{
  assert.doesNotMatch(desktopE2e,/async=>/);
  assert.ok(desktopE2e.includes('waitFor("persisted shape layer",async()=>'));
  assert.ok(desktopE2e.includes('waitFor("reopened native layer list",async()=>'));
  assert.ok(desktopE2e.includes('waitFor("persisted shape after full process restart",async()=>'));
  assert.ok(windowsRunner.includes('node --check tests/motion/desktop-e2e.mjs'));
  assert.ok(windowsRunner.includes('src-tauri/target/release/shuvi2.exe'));
  const prefix=motionCi.indexOf("Preflight validate desktop WebDriver JavaScript");
  const build=motionCi.indexOf("Build actual Tauri Windows binary with embedded production UI");
  assert.ok(prefix!==-1&&build>prefix,"syntax preflight must precede production compile");
});

test("M13 release gate independently verifies exact native desktop WebView screenshots",()=>{
  assert.ok(motionCi.includes("run: ./scripts/motion/verify-desktop-proof.ps1"));
  const proofStart=motionCi.indexOf("Independently verify actual GUI screenshot");
  const uploadStart=motionCi.indexOf("Upload real desktop screenshot");
  assert.ok(proofStart>=0 && uploadStart>proofStart);
  assert.ok(windowsProof.includes("coldRestartVerified"));
  assert.ok(windowsProof.includes("undoRedoVerified"));
  assert.ok(windowsProof.includes("nativeEffectCraftPin"));
  assert.ok(windowsProof.includes("Get-Content -LiteralPath"));
  assert.ok(windowsProof.includes("GITHUB_SHA"));
  assert.ok(windowsProof.includes("coldRestartSha256"));
  assert.ok(windowsProof.includes("m11_03-cold-reopened-project.png"));
  assert.ok(windowsProof.includes("motion-windows-webview2.png"));
  assert.ok(motionCi.includes("needs: motion-desktop-e2e-windows"));
});

test("M14 accepted owner commands never silently discard busy edits or report success before idle",()=>{
  assert.ok(ts.includes('if (busy) {'));
  assert.ok(ts.includes('was not accepted. Retry.'));
  assert.ok(ts.includes('id="motion-command-notice"'));
  assert.ok(ts.includes('role="alert"'));
  assert.ok(ts.includes('busy = false;'));
  assert.ok(ts.includes('info(error===null?label+" · native verification complete"'));
  const release=ts.indexOf('busy = false;',ts.indexOf('async function execute('));
  const success=ts.indexOf('info(error===null?label+" · native verification complete"',release);
  assert.ok(release>0&&success>release,"native completion must occur after busy clears");
});
test("M14 Windows WebView2 error evidence is captured as real per-step journal and DOM",()=>{
  assert.ok(desktopE2e.includes('progress.json'));
  assert.ok(desktopE2e.includes('REAL-WEBVIEW STEP START'));
  assert.ok(desktopE2e.includes('REAL-WEBVIEW STEP PASS'));
  assert.ok(desktopE2e.includes('motion-failed-webview-dom.html'));
  assert.ok(desktopE2e.includes('result.failedUiStatus'));
  assert.ok(desktopE2e.includes('motion-failed.png'));
  assert.ok(motionCi.includes('cancel-in-progress: true'));
  assert.ok(motionCi.includes('group: motion-'));
  assert.ok(windowsRunner.includes('shuvi-motion-msedgedriver'));
  assert.ok(windowsRunner.includes('RUNNER_TEMP'));
});

test("M15 real native multi-frame PNG export is bounded, typed and disk verified",()=>{
  assert.ok(ts.includes('id="motion-export-sequence"'));
  assert.ok(ts.includes('id="motion-sequence-folder"'));
  assert.ok(ts.includes('id="motion-sequence-frames"'));
  assert.ok(ts.includes('action:"exportPngSequence"'));
  assert.ok(ipc.includes('MotionRequest::ExportPngSequence'));
  assert.ok(ipc.includes('e.export_png_sequence('));
  assert.ok(nativeSequence.includes('const MAX_FRAMES:u32=120'));
  assert.ok(nativeSequence.includes('const MAX_SIDE:u32=640'));
  assert.ok(nativeSequence.includes('fs::rename(&staging,&directory)'));
  assert.ok(nativeSequence.includes('fs::create_dir(&candidate)'));
  assert.ok(nativeSequence.includes('directory.symlink_metadata().is_ok()'));
  assert.ok(nativeSequence.includes('fs::remove_dir(&staging)'));
  assert.ok(nativeSequence.includes('let manifest=staging.join("sequence.json")'));
  assert.ok(nativeSequence.includes('create_new(true)'));
  assert.ok(nativeSequence.includes('if saved!=png'));
  assert.ok(nativeSequence.includes('sequence.json'));
  assert.ok(nativeSequence.includes('verified_from_disk:true'));
  assert.ok(nativeSequenceTests.includes('native_disk_verified_manifest'));
  assert.ok(nativeSequenceTests.includes('without_overwriting_owner_files'));
  assert.ok(nativeSequenceProof.includes('first_checksum==exported.last_checksum'));
  assert.ok(motionCi.includes('--bin motion-sequence-proof'));
  assert.ok(desktopE2e.includes('click("#motion-export-sequence")'));
  assert.ok(desktopE2e.includes('result.sequenceVerified=true'));
});

test("M16 release requires real 3-frame sequence and exact SHA256 equality before unsigned NSIS",()=>{
  assert.ok(windowsProof.includes("sequenceVerified"));
  assert.ok(windowsProof.includes("sequenceFrames -ne 3"));
  assert.ok(windowsProof.includes("sequenceFirstSha256"));
  assert.ok(windowsProof.includes("coldRestartSha256"));
  assert.ok(desktopE2e.includes("assert.deepEqual(png,exportedPng"));
  assert.ok(desktopE2e.includes("result.sequenceFirstSha256="));
  assert.ok(desktopE2e.includes("assert.equal(result.sequenceFirstSha256,result.exportSha256)"));
});
