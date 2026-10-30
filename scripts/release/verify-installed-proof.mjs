// Fail-closed evidence gate. Unit tests use synthetic receipts; only Windows CI
// invokes the CLI over actual installed executables, rendered images and media.
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const SHA = /^[0-9a-f]{64}$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const PINS = {filmcraft:'c49efe070fab862df6c21d61a503605eb6f07105',effectcraft:'fa9cf47175834162806b6b03d83fb2f4bdaeeafa'};
const samePath = (a,b) => typeof a==='string' && typeof b==='string' && path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
export function validateReceipts({install, video, motion}, sha) {
  assert.match(sha??'',/^[0-9a-f]{40}$/,'Exact commit SHA required');
  assert.equal(install.ok,true,'Installation did not pass');
  assert.equal(install.checkpoint,sha,'Stale install receipt');
  assert.equal(install.installExitCode,0);
  assert.equal(install.installedProcessLaunched,true);
  assert.deepEqual(install.enginePins,PINS,'Native engine pins differ');
  for(const key of ['installerSha256','installedBinarySha256','installedSidecarSha256']) assert.match(install[key]??'',SHA,key);
  for (const [name,receipt] of Object.entries({video,motion})) {
    assert.equal(receipt.ok,true,`${name} did not pass`);
    assert.equal(receipt.sha,sha,`${name} proof belongs to a different commit`);
    assert.equal(receipt.driver,'tauri-driver',`${name} did not use native driver`);
    assert.ok(samePath(receipt.application,install.installedBinaryPath),`${name} did not test installed EXE`);
    assert.equal(receipt.applicationSha256,install.installedBinarySha256,`${name} tested other binary bytes`);
    assert.equal(receipt.coldRestartVerified,true,`${name} cold restart missing`);
    assert.equal(receipt.noOverwriteVerified,true,`${name} no-overwrite missing`);
    assert.ok(Array.isArray(receipt.steps) && receipt.steps.length>0,`${name} empty proof`);
  }
  assert.match(video.outputSha256??'',SHA);assert.match(video.projectSha256??'',SHA);
  assert.ok(video.outputBytes>100 && video.previewWidth>0 && video.previewHeight>0);
  assert.match(video.outputProbe?.video?.codec??'',/264/i,'Native H264 probe missing');
  assert.ok(video.outputProbe.duration>0 && video.outputProbe.video.width>0 && video.outputProbe.video.height>0);
  assert.match(motion.pngSha256??'',SHA);
  assert.equal(motion.pngSha256,motion.reopenedPngSha256,'Motion pixels differ after restart');
  return {schemaVersion:1,sha,editingSliceVerified:true,releaseReady:false,aiProviderEditVerified:false,
    unsigned:true,installerSha256:install.installerSha256,installedBinarySha256:install.installedBinarySha256,
    enginePins:install.enginePins,remaining:['Provider-backed approved AI edit','Unified Workspace/AI contracts integration','Owner acceptance']};
}
export async function verifyFiles({install,video,motion}, videoDir, motionDir) {
  for (const [filename,expected] of [
    [install.installerPath,install.installerSha256], [install.installedBinaryPath,install.installedBinarySha256],
    [install.installedSidecarPath,install.installedSidecarSha256], [video.output,video.outputSha256],
    [video.project,video.projectSha256], [path.join(motion.projectDir,'webview_e2e.png'),motion.pngSha256]
  ]) assert.equal(hash(await readFile(filename)),expected,`Evidence bytes changed: ${filename}`);
  for (const [dir,names] of [[videoDir,['video-native-timeline.png','video-export.png','video-cold-reopen.png']],
    [motionDir,['m11_01-native-shape.png','m11_02-effect-mask.png','m11_03-cold-reopened-project.png','motion-windows-webview2.png']]]) {
    for(const name of names) {
      const png=await readFile(path.join(dir,name));
      assert.ok(png.length>100 && png.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')),`Missing/invalid GUI PNG: ${name}`);
    }
  }
}
async function main() {
  const output='proof/release/installed-editing-slice.json';
  await mkdir(path.dirname(output),{recursive:true});
  let result={schemaVersion:1,sha:process.env.GITHUB_SHA,editingSliceVerified:false,releaseReady:false};
  try {
    assert.equal(process.platform,'win32','Installed proof must run on Windows');
    const json=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
    const receipts={install:await json('src-tauri/target/release/installed-smoke.json'),
      video:await json('proof/video-desktop/receipt.json'),motion:await json('proof/motion-desktop/receipt.json')};
    const verified=validateReceipts(receipts,process.env.GITHUB_SHA);
    await verifyFiles(receipts,'proof/video-desktop','proof/motion-desktop');
    result=verified;
  } catch(error) {result.error=String(error.stack??error);process.exitCode=1;}
  await writeFile(output,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
