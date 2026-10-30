// Synthetic receipt tests for rejection behavior; NOT real Windows E2E evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {validateReceipts,verifyFiles} from '../scripts/release/verify-installed-proof.mjs';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
const sha='a'.repeat(40), hash='b'.repeat(64);
function fixture() {
  const shared={ok:true,sha,driver:'tauri-driver',application:'/installed/shuvi2.exe',applicationSha256:hash,
    coldRestartVerified:true,noOverwriteVerified:true,steps:['synthetic-check']};
  return {install:{ok:true,checkpoint:sha,installExitCode:0,installedProcessLaunched:true,
    installedBinaryPath:shared.application,builtBinarySha256:hash,installedBinarySha256:hash,
    stagedSidecarSha256:hash,installedSidecarSha256:hash,installerSha256:hash,
    binaryHashMatched:true,sidecarHashMatched:true,
    enginePins:{filmcraft:'c49efe070fab862df6c21d61a503605eb6f07105',effectcraft:'fa9cf47175834162806b6b03d83fb2f4bdaeeafa'}},
    video:{...shared,outputSha256:hash,projectSha256:hash,outputBytes:500,previewWidth:64,previewHeight:64,
      outputProbe:{duration:120,video:{codec:'h264',width:64,height:64}}},
    motion:{...shared,pngSha256:hash,reopenedPngSha256:hash},
    unified:{...shared,steps:['synthetic-ui-click','synthetic-native-project','synthetic-motion-create',
      'synthetic-native-save','synthetic-cold-reopen'],videoNativeReadbackVerified:true,nativeMotionRenderVerified:true,
      videoProjectSha256:hash,motionProjectSha256:hash,motionPngSha256:hash,reopenedPngSha256:hash,
      videoPreview:{width:64,height:64},motionPreview:{width:360,height:360}}};
}
test('complete editing receipts never imply provider AI or full release readiness',()=>{
  const result=validateReceipts(fixture(),sha);
  assert.equal(result.editingSliceVerified,true);assert.equal(result.releaseReady,false);
  assert.equal(result.aiProviderEditVerified,false);
  assert.equal(result.unifiedNativeReadbackVerified,true);
});
for(const [label,change] of [
  ['stale install',f=>f.install.checkpoint='c'.repeat(40)],
  ['failed Motion',f=>f.motion.ok=false],
  ['other commit',f=>f.video.sha='c'.repeat(40)],
  ['test binary',f=>f.video.application='/target/debug/shuvi2.exe'],
  ['other executable bytes',f=>f.motion.applicationSha256='c'.repeat(64)],
  ['unfinished restart',f=>f.video.coldRestartVerified=false],
  ['changed native PNG',f=>f.motion.reopenedPngSha256='c'.repeat(64)],
  ['missing no overwrite',f=>delete f.video.noOverwriteVerified],
  ['non-H264 output',f=>f.video.outputProbe.video.codec='vp9'],
  ['changed engine pin',f=>f.install.enginePins.effectcraft='c'.repeat(40)],
  ['missing Unified proof',f=>delete f.unified],
  ['failed Unified native Motion readback',f=>f.unified.nativeMotionRenderVerified=false],
  ['different Unified Video project',f=>f.unified.videoProjectSha256='c'.repeat(64)],
  ['changed Unified cold restart PNG',f=>f.unified.reopenedPngSha256='c'.repeat(64)],
  ['missing Unified cold process restart',f=>f.unified.coldRestartVerified=false],
  ['different compiled EXE',f=>f.install.builtBinarySha256='c'.repeat(64)],
  ['different staged sidecar',f=>f.install.stagedSidecarSha256='c'.repeat(64)],
  ['failed executable integrity assertion',f=>f.install.binaryHashMatched=false],
  ['failed sidecar integrity assertion',f=>f.install.sidecarHashMatched=false],
  ['empty steps',f=>f.video.steps=[]]
]) test(`release proof rejects ${label}`,()=>{const f=fixture();change(f);assert.throws(()=>validateReceipts(f,sha));});
test('both GUI programs parse before any expensive Windows build',()=>{
  for(const script of ['tests/motion/desktop-e2e.mjs','scripts/release/video-installed-e2e.mjs',
    'scripts/release/webdriver.mjs','scripts/release/verify-installed-proof.mjs',
    'scripts/release/unified-installed-e2e.mjs']) {
    const result=spawnSync(process.execPath,['--check',script],{encoding:'utf8'});
    assert.equal(result.status,0,script+'\n'+result.stderr);
  }
});
test('evidence verifier rejects altered media and missing screenshots on physical disk',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'release-gate-test-'));
  try {
    const f=fixture(),data=Buffer.from('synthetic binary/media bytes'),fingerprint=createHash('sha256').update(data).digest('hex');
    const file=path.join(root,'bytes');await writeFile(file,data);
    f.install.installerPath=file;f.install.installerSha256=fingerprint;
    f.install.installedBinaryPath=file;f.install.installedBinarySha256=fingerprint;
    f.install.installedSidecarPath=file;f.install.installedSidecarSha256=fingerprint;
    f.video.output=file;f.video.outputSha256=fingerprint;f.video.project=file;f.video.projectSha256=fingerprint;
    f.motion.projectDir=root;f.motion.pngSha256=fingerprint;await writeFile(path.join(root,'webview_e2e.png'),data);
    f.unified.motionProject=file;f.unified.motionProjectSha256=fingerprint;
    f.unified.motionPng=file;f.unified.motionPngSha256=fingerprint;
    f.unified.reopenedPngSha256=fingerprint;
    await assert.rejects(()=>verifyFiles(f,root,root,root),/ENOENT/);
    const png=Buffer.alloc(120);Buffer.from('89504e470d0a1a0a','hex').copy(png);
    for(const name of ['video-native-timeline.png','video-export.png','video-cold-reopen.png',
      'm11_01-native-shape.png','m11_02-effect-mask.png','m11_03-cold-reopened-project.png','motion-windows-webview2.png',
      'unified-01-single-window.png','unified-02-filmcraft-native-timeline.png',
      'unified-03-effectcraft-native-render.png','unified-04-effectcraft-cold-reopened.png']) await writeFile(path.join(root,name),png);
    await verifyFiles(f,root,root,root);
    await writeFile(file,'tampered');
    await assert.rejects(()=>verifyFiles(f,root,root,root),/Evidence bytes changed/);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('CI must refuse silent Tauri binary patching and retain strict installed hash gate',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/release-integration.yml',import.meta.url),'utf8');
  const install=readFileSync(new URL('../scripts/release/windows-installed-smoke.ps1',import.meta.url),'utf8');
  assert.match(workflow,/--no-binary-patching/);
  assert.match(workflow,/Pinned Tauri CLI cannot build without executable patching/);
  assert.match(install,/binaryHashMatched/);
  assert.match(install,/sidecarHashMatched/);
  assert.match(install,/Release BLOCKED/);
});

test('Windows installed WebView2 CI pins a runner with working native CDP and records diagnostics',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/release-integration.yml',import.meta.url),'utf8');
  const runner=readFileSync(new URL('../scripts/motion/run-windows-e2e.ps1',import.meta.url),'utf8');
  assert.match(workflow,/runs-on:\s*windows-2022/);
  assert.doesNotMatch(workflow,/runs-on:\s*windows-latest/);
  assert.match(runner,/driver-prerequisites\.json/);
  assert.match(runner,/webview2Version/);
  assert.match(runner,/edgeDriverVersion/);
  assert.match(runner,/Installed WebView2 suite failure:/);
});

test('installed WebView2 driver version is matched to actual native runtime, not full Edge browser',()=>{
  const source=readFileSync(new URL('../scripts/motion/run-windows-e2e.ps1',import.meta.url),'utf8');
  assert.match(source,/Microsoft\\EdgeUpdate\\Clients/);
  assert.match(source,/msedgedriver\.microsoft\.com\/\$webviewVersion\/edgedriver_win64\.zip/);
  assert.match(source,/Get-AuthenticodeSignature/);
  assert.match(source,/if \(\$driverBuild -ne \$runtimeBuild\)/);
  assert.match(source,/WebView2.*EdgeDriver.*build mismatch/);
  assert.match(source,/edgeDriverBuildMatched/);
  assert.match(source,/edgeDriverSha256/);
  assert.doesNotMatch(source,/cargo install --git https:\/\/github\.com\/chippers\/msedgedriver-tool/);
});
