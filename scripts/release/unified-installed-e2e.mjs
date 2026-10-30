// Real installed EXE/WebView2 click path; never mock IPC, keys, editor or pixels.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DesktopDriver,FatalUiError,until} from './webdriver.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const out=path.resolve('proof/unified-desktop'),app=process.env.SHUVI_MOTION_EXE;
const driver=new DesktopDriver(process.env.SHUVI_MOTION_WEBDRIVER);
const receipt={schemaVersion:1,ok:false,sha:process.env.GITHUB_SHA,driver:'tauri-driver',
 application:app,steps:[],screenshots:[],coldRestartVerified:false,
 videoNativeReadbackVerified:false,nativeMotionRenderVerified:false};
let activeStep='prerequisites';
const field=n=>'[data-field="'+n+'"]',action=n=>'[data-act="'+n+'"]';
async function step(name,fn){
 activeStep=name;
 await writeFile(path.join(out,'progress.json'),JSON.stringify({...receipt,activeStep:name},null,2));
 await fn();receipt.steps.push(name);
}
async function completed(label,timeout=120000){
 await until(label,async()=>{
  if(!(await driver.property('[data-ui="error"]','hidden'))){
   const error=await driver.text('[data-ui="error"]');
   if(error)throw new FatalUiError('Native UI error: '+error);
  }
  const status=await driver.text('[data-ui="progress"]');
  return status.includes(label)&&status.includes('native readback verified')&&status;
 },timeout);
}
async function clickAction(name,label,timeout){
 await driver.click(action(name));await completed(label,timeout);
}
async function screenshot(name){await driver.screenshot(path.join(out,name));receipt.screenshots.push(name);}
async function openUnified(){
 await until('installed classic shell',()=>driver.element('#open-unified-workspace'),90000);
 await driver.click('#open-unified-workspace');
 await until('real Unified Tauri WebView',()=>driver.element('#native-unified-workspace[data-shuvi-workspace="mounted"]'),90000);
 assert.match(await driver.text('.su-head'),/SHUVI 2/);
}
async function nativeFrame(){
 await until('native image pixels',async()=>Number(await driver.property('[data-ui="frame"]','naturalWidth'))>0);
 const width=Number(await driver.property('[data-ui="frame"]','naturalWidth'));
 const height=Number(await driver.property('[data-ui="frame"]','naturalHeight'));
 assert.ok(width>0&&height>0);return {width,height};
}
try{
 await mkdir(out,{recursive:true});
 assert.equal(process.platform,'win32','Real Windows required');
 assert.ok(app&&path.isAbsolute(app),'Exact installed EXE required');
 receipt.applicationSha256=hash(await readFile(app));
 const installed=JSON.parse((await readFile('src-tauri/target/release/installed-smoke.json','utf8')).replace(/^\uFEFF/,''));
 assert.equal(installed.ok,true);
 assert.equal(installed.checkpoint,receipt.sha);
 assert.equal(installed.installedBinarySha256,receipt.applicationSha256);
 assert.equal(path.resolve(app).toLowerCase(),path.resolve(installed.installedBinaryPath).toLowerCase());
 const video=JSON.parse(await readFile('proof/video-desktop/receipt.json','utf8'));
 assert.equal(video.ok,true,'Installed classic FilmCraft E2E must pass first');
 assert.equal(video.sha,receipt.sha);
 assert.equal(video.applicationSha256,receipt.applicationSha256);
 const workspace=await mkdtemp(path.join(tmpdir(),'shuvi-unified-native-'));
 const nativeProject=path.join(workspace,'unified-integration.ecproj');
 const nativePng=path.join(workspace,'native-proof.png');
 receipt.motionProject=nativeProject;receipt.motionPng=nativePng;
 await step('click real installed Windows Unified entrypoint',async()=>{
  await driver.start(app);await openUnified();await screenshot('unified-01-single-window.png');
 });
 await step('open actual prior FilmCraft project and decode native Video frame',async()=>{
  await driver.fill(field('root'),path.dirname(video.project));
  await driver.fill(field('project'),video.project);
  await clickAction('video-open','Inspecting native FilmCraft project');
  await until('FilmCraft saved native clip',async()=>(await driver.elements('[data-clip]')).length>0);
  receipt.videoProjectSha256=hash(await readFile(video.project));
  assert.equal(receipt.videoProjectSha256,video.projectSha256);
  receipt.videoNativeReadbackVerified=true;
  await driver.fill(field('videoTime'),'0.25');
  await clickAction('video-preview','Rendering native FilmCraft frame');
  receipt.videoPreview=await nativeFrame();
  await screenshot('unified-02-filmcraft-native-timeline.png');
 });
 await step('read real EffectCraft worker state and create a native composition',async()=>{
  await driver.click('[data-tab="motion"]');
  await clickAction('motion-status','Refreshing live EffectCraft');
  assert.match(await driver.text('[data-ui="health"]'),/EffectCraft native ready/);
  await driver.fill(field('compName'),'Shuvi Integrated Native Motion');
  await driver.fill(field('width'),'640');await driver.fill(field('height'),'360');
  await driver.fill(field('fps'),'30');await driver.fill(field('duration'),'5');
  await clickAction('motion-create','Creating real EffectCraft');
  assert.match(await driver.text('[data-ui="revision"]'),/Composition .* revision/);
 });
 await step('create native shape, render pixels, save .ecproj and export actual PNG',async()=>{
  await driver.fill(field('shapeName'),'Integration Native Shape');
  await clickAction('motion-shape','Applying EffectCraft native edit');
  await until('native layer readback',async()=>(await driver.text('[data-ui="layers"]')).includes('Integration Native Shape'));
  await clickAction('motion-render','Rendering native EffectCraft');
  receipt.motionPreview=await nativeFrame();
  assert.match(await driver.property('[data-ui="frame"]','src'),/^data:image\/png;base64,/);
  receipt.nativeMotionRenderVerified=true;
  await screenshot('unified-03-effectcraft-native-render.png');
  await driver.fill(field('motionRoot'),workspace);
  await driver.fill(field('motionFile'),'unified-integration.ecproj');
  await clickAction('motion-save','Saving real EffectCraft project');
  assert.ok((await stat(nativeProject)).size>100);
  receipt.motionProjectSha256=hash(await readFile(nativeProject));
  await driver.fill(field('png'),'native-proof.png');
  await clickAction('motion-export','Exporting native EffectCraft PNG');
  const png=await readFile(nativePng);
  assert.ok(png.length>100&&png.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')));
  receipt.motionPngSha256=hash(png);
 });
 await step('cold restart installed app, reopen native Motion from disk, compare PNG pixels',async()=>{
  await driver.close();await driver.start(app);await openUnified();
  await driver.click('[data-tab="motion"]');
  await driver.fill(field('motionRoot'),workspace);
  await driver.fill(field('motionFile'),'unified-integration.ecproj');
  await clickAction('motion-open','Opening EffectCraft from disk');
  await until('reopened native shape',async()=>(await driver.text('[data-ui="layers"]')).includes('Integration Native Shape'));
  assert.equal(hash(await readFile(nativeProject)),receipt.motionProjectSha256);
  await clickAction('motion-render','Rendering native EffectCraft');await nativeFrame();
  const src=await driver.property('[data-ui="frame"]','src');
  assert.match(src,/^data:image\/png;base64,/);
  const reopened=Buffer.from(src.slice('data:image/png;base64,'.length),'base64');
  assert.ok(reopened.length>100&&reopened.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')));
  receipt.reopenedPngSha256=hash(reopened);
  assert.equal(receipt.reopenedPngSha256,receipt.motionPngSha256,'Cold-open native PNG differs from exported PNG');
  receipt.coldRestartVerified=true;
  await screenshot('unified-04-effectcraft-cold-reopened.png');
 });
 await driver.close();
 assert.equal(hash(await readFile(app)),receipt.applicationSha256);
 receipt.ok=true;
}catch(error){
 receipt.failedStep=activeStep;receipt.error=String(error.stack??error);process.exitCode=1;
 try{await driver.screenshot(path.join(out,'failed.png'));}catch{}
 try{await writeFile(path.join(out,'failed.html'),await driver.source());}catch{}
 console.error(receipt.error);
}finally{
 try{await driver.close();}catch(error){receipt.ok=false;receipt.cleanupError=String(error);process.exitCode=1;}
 await mkdir(out,{recursive:true});
 await writeFile(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));
}
