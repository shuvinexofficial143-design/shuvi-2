// Real installed Shuvi -> WebDriver clicks -> FilmCraft -> physical output/readback.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, copyFile, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DesktopDriver, FatalUiError, until} from './webdriver.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const proof = path.resolve('proof/video-desktop');
const app = process.env.SHUVI_MOTION_EXE;
const driver = new DesktopDriver(process.env.SHUVI_MOTION_WEBDRIVER);
const result = {schemaVersion:1, ok:false, sha:process.env.GITHUB_SHA, driver:'tauri-driver',
  application:app, steps:[], coldRestartVerified:false, screenshots:[]};
let activeStep = 'prerequisites';
const status = '.v-editor [data-v="status"]';
const field = name => `[data-v="${name}"]`;
async function step(name, work) {
  activeStep = name;
  await writeFile(path.join(proof,'progress.json'), JSON.stringify({...result,activeStep},null,2));
  await work(); result.steps.push(name);
}
async function ready(expected, timeout=180000) {
  return until(expected, async () => {
    const message = await driver.text(status);
    if (await driver.property(status,'className').then(s=>s.includes('error'))) throw new FatalUiError(message);
    return message.includes(expected) && message;
  }, timeout);
}
async function action(name, expected, timeout) {
  await driver.click(`[data-action="${name}"]`);
  await ready(expected, timeout);
}
async function screenshot(name) {
  await driver.screenshot(path.join(proof,name)); result.screenshots.push(name);
}
async function selectVideo() {
  await until('Video tab',()=>driver.element('button[data-studio="video"]'));
  await driver.click('button[data-studio="video"]');
  await until('real Video editor',()=>driver.element('.v-editor'));
}
try {
  await mkdir(proof,{recursive:true});
  assert.equal(process.platform,'win32','Real Windows is required');
  assert.ok(app && path.isAbsolute(app),'Installed EXE required');
  result.applicationSha256 = sha256(await readFile(app));
  const install = JSON.parse((await readFile('src-tauri/target/release/installed-smoke.json','utf8')).replace(/^\uFEFF/,''));
  assert.equal(path.resolve(app).toLowerCase(),path.resolve(install.installedBinaryPath).toLowerCase());
  assert.equal(result.applicationSha256,install.installedBinarySha256);
  assert.equal(result.sha,install.checkpoint);
  const root = await mkdtemp(path.join(tmpdir(),'shuvi-installed-video-'));
  const project = path.join(root,'studio.fcproj'), media = path.join(root,'fixture.mp4'), output = path.join(root,'output.mp4');
  result.project = project; result.output = output;
  await copyFile('tests/video/blue-64x64-12fps.mp4',media);
  await step('launch installed app',async()=>{await driver.start(app);await selectVideo();});
  await step('import real MP4',async()=>{
    for (const [name,value] of Object.entries({root,project,source:media,output,width:64,height:64,fps:12})) await driver.fill(field(name),value);
    await action('import','Imported real media');
    assert.ok((await stat(project)).size>100);
  });
  await step('create sequence and place native media',async()=>{
    await action('sequence','Verified createSequence');
    assert.ok((await driver.elements('[data-v="media"] option')).length>=2);
    // Keyboard selection emits the actual native select/change event.
    await driver.keys(field('media'),'\uE010\uE007');
    assert.ok(Number(await driver.property(field('media'),'value'))>0);
    await driver.fill(field('track'),'V1');await driver.fill(field('seconds'),'0');
    await action('place','Verified place');
    assert.equal((await driver.elements('.v-lanes .v-clip')).length,1);
  });
  await step('persistent native undo and redo',async()=>{
    await action('undo','Verified persistent FilmCraft undo');
    assert.equal((await driver.elements('.v-lanes .v-clip')).length,0);
    await action('redo','Verified persistent FilmCraft redo');
    assert.equal((await driver.elements('.v-lanes .v-clip')).length,1);
  });
  await step('native decoded preview and scrub',async()=>{
    await driver.fill(field('seconds'),'0.25');await action('preview','Verified real FilmCraft frame');
    await until('decoded native PNG',async()=>Number(await driver.property('.v-monitor img','naturalWidth'))>0);
    result.previewWidth = await driver.property('.v-monitor img','naturalWidth');
    result.previewHeight = await driver.property('.v-monitor img','naturalHeight');
    // Home and Right move the real range control through its keyboard UI.
    await driver.keys(field('scrub'),'\uE011\uE014');
    await ready('Verified real FilmCraft frame');
    const scrubTime=Number(await driver.property(field('scrub'),'value'));
    assert.ok(scrubTime>0,'Range keyboard did not move playhead');
    await until('scrub frame matches chosen time',async()=>{
      const label=await driver.text(status);
      const milliseconds=Math.round(scrubTime*1000).toString().padStart(3,'0');
      return label.includes('00:00:00.'+milliseconds);
    });
    await screenshot('video-native-timeline.png');
  });
  await step('export H264 and preserve existing output',async()=>{
    if (await driver.property(field('audio'),'checked')) await driver.click(field('audio'));
    await action('export','Verified MP4',300000);
    const bytes=await readFile(output);assert.equal(bytes.subarray(4,8).toString(),'ftyp');
    result.outputSha256=sha256(bytes);result.outputBytes=bytes.length;
    const probe=JSON.parse(execFileSync(install.installedSidecarPath,['--compact','probe',output],{encoding:'utf8',timeout:120000}));
    assert.match(probe.video.codec,/264/i);assert.ok(probe.duration>0 && probe.video.width>0 && probe.video.height>0);
    result.outputProbe=probe;
    await driver.click('[data-action="export"]');
    await until('no overwrite error',async()=>{
      const message=await driver.text(status);
      return /exist|overwrite/i.test(message) && !message.includes('Running native');
    });
    assert.equal(sha256(await readFile(output)),result.outputSha256);result.noOverwriteVerified=true;
    await screenshot('video-export.png');
  });
  await step('same window retains video state after Motion',async()=>{
    await driver.click('button[data-studio="motion"]');
    await until('native Motion mounted',()=>driver.element('#motion-create'));
    await selectVideo();assert.equal((await driver.elements('.v-lanes .v-clip')).length,1);
    assert.equal(await driver.property(field('project'),'value'),project);
  });
  await step('cold restart and native saved project readback',async()=>{
    const before=sha256(await readFile(project));
    await driver.close();await driver.start(app);await selectVideo();
    await driver.fill(field('root'),root);await driver.fill(field('project'),project);
    await action('open','Verified FilmCraft project snapshot');
    assert.equal((await driver.elements('.v-lanes .v-clip')).length,1);
    assert.equal(sha256(await readFile(project)),before);
    result.projectSha256=before;result.coldRestartVerified=true;
    await driver.fill(field('seconds'),'0.25');await action('preview','Verified real FilmCraft frame');
    await until('reopened native PNG',async()=>Number(await driver.property('.v-monitor img','naturalWidth'))>0);
    await screenshot('video-cold-reopen.png');
  });
  await driver.close();
  assert.equal(sha256(await readFile(app)),result.applicationSha256);
  result.ok=true;
} catch(error) {
  result.failedStep=activeStep;result.error=String(error.stack??error);process.exitCode=1;
  try{await driver.screenshot(path.join(proof,'failed.png'));}catch{}
  try{await writeFile(path.join(proof,'failed.html'),await driver.source());}catch{}
  console.error(result.error);
} finally {
  try{await driver.close();}catch(error){result.ok=false;result.cleanupError=String(error);process.exitCode=1;}
  await mkdir(proof,{recursive:true});
  await writeFile(path.join(proof,'receipt.json'),JSON.stringify(result,null,2));
}
