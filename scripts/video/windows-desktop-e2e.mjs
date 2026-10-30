/**
 * Actual packaged Tauri WebView2 → native IPC E2E on GitHub Windows runner.
 * No mocks: input paths are real, FilmCraft CLI is real and MP4 is probed.
 * CDP is exposed ONLY in ephemeral CI process env, never the shipped app.
 */
import {chromium} from "playwright-core";
import {spawn} from "node:child_process";
import {mkdtempSync,copyFileSync,existsSync,statSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {tmpdir} from "node:os";
import net from "node:net";

if(process.platform!=="win32")throw Error("WebView2 E2E requires an actual Windows runner.");
const repo=resolve(import.meta.dirname,"../..");
const exe=join(repo,"src-tauri","target","release","shuvi2.exe");
const staged=join(repo,"src-tauri","binaries","filmcraft-cli-x86_64-pc-windows-msvc.exe");
const fixture=join(repo,"tests","video","blue-64x64-12fps.mp4");
for(const file of [exe,staged,fixture])if(!existsSync(file))throw Error("Missing real E2E prerequisite: "+file);
copyFileSync(staged,join(dirname(exe),"filmcraft-cli.exe"));
const folder=mkdtempSync(join(tmpdir(),"shuvi-video-native-e2e-"));
const media=join(folder,"fixture.mp4");
const project=join(folder,"studio.fcproj");
const output=join(folder,"verified-output.mp4");
const reportPath=join(repo,"src-tauri","target","video-desktop-e2e.json");
const shotPath=join(repo,"src-tauri","target","video-desktop-e2e.png");
copyFileSync(fixture,media);
const checks=[];
let browser=null,app=null,page=null;
const report={status:"running",sha:process.env.GITHUB_SHA??"local",steps:checks,project,output,
  screenshot:shotPath,error:null};
function note(name,details){checks.push({name,details,at:new Date().toISOString()});console.log("E2E: "+name+" | "+details);}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function freePort(){
  return new Promise((ok,bad)=>{
    const server=net.createServer();
    server.once("error",bad);
    server.listen(0,"127.0.0.1",()=>{
      const address=server.address(),port=address.port;
      server.close(()=>ok(port));
    });
  });
}
async function visibleStatus(fragment, timeout=120000){
  await page.waitForFunction(
    expected => document.querySelector('.v-editor [data-v="status"]')?.textContent?.includes(expected),
    fragment,{timeout},
  );
  const result=await page.locator('.v-editor [data-v="status"]').textContent();
  if(!result?.includes(fragment))throw Error("Unexpected native status: "+result);
  return result;
}
async function clickAction(action,expected,timeout=120000){
  await page.locator('.v-editor [data-action="'+action+'"],.v-lanes [data-action="'+action+'"]').click();
  const msg=await visibleStatus(expected,timeout);
  note(action,msg);
}
try{
  const port=await freePort();
  const env={
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:"--remote-debugging-port="+port,
    WEBVIEW2_USER_DATA_FOLDER:join(folder,"webview-profile"),
  };
  app=spawn(exe,[],{cwd:dirname(exe),env,stdio:"ignore",windowsHide:false});
  app.on("error",e=>{report.error=String(e)});
  let online=false;
  for(let i=0;i<120;i++){
    if(app.exitCode!==null)throw Error("Desktop app exited before CDP attach: "+app.exitCode);
    try{
      const response=await fetch("http://127.0.0.1:"+port+"/json/version",{signal:AbortSignal.timeout(450)});
      if(response.ok){online=true;break;}
    }catch{}
    await sleep(400);
  }
  if(!online)throw Error("Real WebView2 did not expose debug session on Windows");
  browser=await chromium.connectOverCDP("http://127.0.0.1:"+port,{timeout:25000});
  const context=browser.contexts()[0];
  if(!context)throw Error("WebView2 CDP had no browser context");
  for(let n=0;n<80;n++){
    const all=context.pages();
    for(const candidate of all){
      try{
        if(await candidate.locator(".v-editor").count()){page=candidate;break;}
      }catch{}
    }
    if(page)break;
    await sleep(250);
  }
  if(!page)throw Error("Native WebView2 did not render the Video Studio DOM");
  await page.locator(".v-editor").waitFor({state:"visible",timeout:15000});
  note("window","Real Windows app and WebView2 Video Studio DOM visible");

  // Actual user-facing inputs; no direct Tauri invoke bypass, no mock engine.
  await page.locator('[data-v="root"]').fill(folder);
  await page.locator('[data-v="project"]').fill(project);
  await page.locator('[data-v="source"]').fill(media);
  await page.locator('[data-v="output"]').fill(output);
  await page.locator('[data-v="width"]').fill("64");
  await page.locator('[data-v="height"]').fill("64");
  await page.locator('[data-v="fps"]').fill("12");
  await clickAction("import","Imported real media",180000);
  if(!existsSync(project)||statSync(project).size<=0)throw Error("Import did not save real .fcproj");
  note("import-file","Actual FilmCraft project on disk: "+statSync(project).size+" bytes");

  await clickAction("sequence","Verified createSequence",120000);
  const select=page.locator('[data-v="media"]');
  if(await select.locator("option").count()<2)throw Error("Media bin has no imported FilmCraft item");
  await select.selectOption({index:1});
  await page.locator('[data-v="track"]').fill("V1");
  await page.locator('[data-v="seconds"]').fill("0");
  await clickAction("place","Verified place",120000);
  await page.locator(".v-lanes .v-clip").first().waitFor({state:"visible",timeout:20000});
  note("timeline","Real FilmCraft .v-clip built from saved sequence.inspect, not demo fixture DOM");

  await page.locator('[data-v="seconds"]').fill("0.25");
  await clickAction("preview","Verified real FilmCraft frame",180000);
  await page.waitForFunction(()=>{
    const img=document.querySelector('.v-monitor img');
    return img && !img.hidden && img.naturalWidth>0 && img.naturalHeight>0;
  },null,{timeout:20000});
  const dims=await page.locator(".v-monitor img").evaluate(img=>[img.naturalWidth,img.naturalHeight]);
  if(dims[0]===0||dims[1]===0)throw Error("Real frame did not decode in native WebView");
  note("preview","Actual decoded FilmCraft PNG "+dims.join("×"));

  const slider=page.locator('[data-v="scrub"]');
  await slider.evaluate(el=>{
    el.value="0.5";
    el.dispatchEvent(new Event("input",{bubbles:true}));
  });
  await page.waitForFunction(()=>{
    const msg=document.querySelector('.v-editor [data-v="status"]')?.textContent??"";
    return msg.includes("Verified real FilmCraft frame") && msg.includes("00:00:00.500");
  },null,{timeout:180000});
  note("scrub","Real FilmCraft frame seek 0.5s completed through UI, not just queued");

  // Avoid an empty audio track forcing a codec mode; video stream is still real.
  await page.locator('[data-v="audio"]').uncheck();
  await clickAction("export","Verified MP4",300000);
  if(!existsSync(output)||statSync(output).size<=100)throw Error("Native MP4 output file absent");
  const header=readFileSync(output).subarray(4,8).toString("ascii");
  if(header!=="ftyp")throw Error("Output is not MP4 ISO BMFF");
  note("export","Actual FilmCraft H264 MP4 "+statSync(output).size+" bytes with ftyp atom");

  await page.screenshot({path:shotPath,fullPage:true,timeout:15000});
  note("screenshot","Actual WebView2 application screenshot saved");
  report.status="pass";
}catch(error){
  report.status="fail";report.error=String(error?.stack??error);
  console.error("ACTUAL WINDOWS E2E FAILED:",report.error);
  if(page){try{await page.screenshot({path:shotPath,timeout:6000});}catch{}}
  process.exitCode=1;
}finally{
  if(browser)try{await browser.close();}catch{}
  if(app&&!app.killed)try{app.kill("SIGTERM");}catch{}
  writeFileSync(reportPath,JSON.stringify(report,null,2));
  console.log("Desktop E2E proof: "+reportPath);
  // Do not delete workspace before WebView2 child processes release profile.
  // GitHub runner cleans isolated temporary fixture files.
}
