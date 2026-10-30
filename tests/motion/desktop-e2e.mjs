// Real Windows Tauri WebView2 E2E; requires running tauri-driver 2.x and EdgeDriver.
// Uses W3C WebDriver HTTP, no test-side native IPC shortcuts and no mocks.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const endpoint = process.env.SHUVI_MOTION_WEBDRIVER ?? "http://127.0.0.1:4444";
const application = process.env.SHUVI_MOTION_EXE;
const artifacts = path.resolve(process.env.SHUVI_MOTION_E2E_ARTIFACTS ?? "proof/motion-desktop");
const KEY = "element-6066-11e4-a52e-4f735466cecf";
let session;
let lastStep="starting";
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class FatalNativeUiError extends Error {}
async function wd(method,route,data) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),25000);
  try {
    const response=await fetch(endpoint+route,{method,headers:{"content-type":"application/json"},
      ...(data===undefined?{}:{body:JSON.stringify(data)}),signal:controller.signal});
    const payload=await response.json();
    if(!response.ok||payload.value?.error)
      throw new Error(method+" "+route+" "+(payload.value?.message??response.status));
    return payload.value;
  }finally{clearTimeout(timer)}
}
async function waitFor(label,fn,timeout=40000){
  const start=Date.now();let lastError;
  while(Date.now()-start<timeout){
    try{const result=await fn();if(result)return result}catch(e){
      if(e instanceof FatalNativeUiError)throw e;
      lastError=e;
    }
    await delay(400);
  }
  throw new Error("Timeout waiting for "+label+": "+String(lastError??"not available"));
}
async function find(selector){
  const el=await wd("POST",`/session/${session}/element`,{using:"css selector",value:selector});
  return el[KEY];
}
async function attr(selector,name){
  const el=await find(selector);
  return wd("GET",`/session/${session}/element/${el}/attribute/${encodeURIComponent(name)}`);
}
async function text(selector){
  const el=await find(selector);
  return wd("GET",`/session/${session}/element/${el}/text`);
}
async function click(selector){
  const el=await find(selector);
  await wd("POST",`/session/${session}/element/${el}/click`,{});
}
async function fill(selector,input){
  const el=await find(selector);
  await wd("POST",`/session/${session}/element/${el}/clear`,{});
  const str=String(input);
  await wd("POST",`/session/${session}/element/${el}/value`,{
    text:str,value:Array.from(str)
  });
}
async function ready(message,timeout=40000){
  await waitFor(message,async()=>{
    const t=await text("#motion-status");
    if(t.startsWith("FAIL:"))throw new FatalNativeUiError("Native editor error: "+t);
    return t.includes(message)?t:null;
  },timeout);
}
async function screenshot(name){
  const base64=await wd("GET",`/session/${session}/screenshot`);
  await writeFile(path.join(artifacts,name),Buffer.from(base64,"base64"));
}
async function test(){
  assert.ok(application,"SHUVI_MOTION_EXE must be the real built Tauri .exe path");
  await stat(application);
  await mkdir(artifacts,{recursive:true});
  const root=await mkdtemp(path.join(tmpdir(),"shuvi-motion-e2e-"));
  // Verify native Tauri actually launches a WebView, not a Vite-only browser.
  let created;
  try{
    created=await wd("POST","/session",{
      capabilities:{alwaysMatch:{"browserName":"wry","tauri:options":{application:path.resolve(application)}}}
    });
  }catch(error){
    await writeFile(path.join(artifacts,"receipt.json"),JSON.stringify({
      ok:false,failedStep:"start-real-webview2-session",
      driver:"tauri-driver",application:path.resolve(application),error:String(error)
    },null,2));
    throw error;
  }
  session=created.sessionId;
  assert.ok(session,"tauri-driver did not create a real desktop session");
  const result={driver:"tauri-driver",window:"real-windows-webview2",
    projectDir:root,steps:[],nativeScreenshot:null};
  async function step(name,fn){lastStep=name;await fn();result.steps.push(name)}
  try{
    await step("click Motion Studio tab",async()=>{
      await waitFor("Motion Studio tab",()=>find('button[data-studio="motion"]'));
      await click('button[data-studio="motion"]');
      await ready("Native Windows engine connected",60000);
    });
    await step("create real native composition",async()=>{
      await fill("#motion-name","Shuvi Windows E2E Project");
      await click("#motion-create");
      await ready("Creating composition · native verification complete",60000);
      assert.match(await text("#motion-frame-info"),/drawn pixels/);
    });
    await step("create real editable shape and verify PNG preview",async()=>{
      await fill("#motion-layer-name","WebDriver Shape");
      await click("#motion-add-shape");
      await ready("Creating shape · native verification complete",60000);
      assert.match(await attr("#motion-native-frame","src"),/^data:image\/png;base64,/);
      const listed=await text("#motion-layer-list");
      assert.match(listed,/WebDriver Shape/);
    });
    await step("effect parameters and polygon mask visibly change real rendered PNG",async()=>{
      const original=await attr("#motion-native-frame","src");
      assert.match(original,/^data:image\/png;base64,/);
      await click("#motion-add-effect");
      await ready("Applying native effect · native verification complete",60000);
      assert.match(await text("#motion-effect-list"),/Gaussian Blur/);
      await fill("#motion-fx-value","28");
      await click("#motion-set-effect");
      await ready("Editing native effect parameter · native verification complete",60000);
      const blurred=await attr("#motion-native-frame","src");
      assert.match(blurred,/^data:image\/png;base64,/);
      assert.notEqual(blurred,original,"Gaussian Blur failed to change real native preview bytes");
      await click("#motion-add-mask");
      await ready("Creating native polygon mask · native verification complete",60000);
      assert.match(await text("#motion-mask-list"),/Mask 1/);
      const masked=await attr("#motion-native-frame","src");
      assert.match(masked,/^data:image\/png;base64,/);
      assert.notEqual(masked,blurred,"Polygon mask did not change native pixels");
      result.frames={originalBytes:original.length,blurredBytes:blurred.length,maskedBytes:masked.length};
    });
    await step("save persistent .ecproj and export real PNG to owner temp workspace",async()=>{
      await fill("#motion-workspace",root);
      await fill("#motion-filename","webview_e2e.ecproj");
      await click("#motion-save");
      await ready("Saving native project · native verification complete",60000);
      const project=await stat(path.join(root,"webview_e2e.ecproj"));
      assert.ok(project.size>100,"Native project missing or empty");
      await fill("#motion-png-filename","webview_e2e.png");
      await click("#motion-export-png");
      await ready("Exporting native PNG · native verification complete",60000);
      const png=await readFile(path.join(root,"webview_e2e.png"));
      assert.ok(png.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex")),
        "Exported frame was not an actual PNG");
      assert.ok(png.length>100,"PNG is empty");
      result.pngBytes=png.length;
      result.projectBytes=project.size;
      // Native owner-owned export must refuse overwriting a real existing file.
      await click("#motion-export-png");
      await waitFor("native no-overwrite error",async()=>{
        const status=await text("#motion-status");
        return status.startsWith("FAIL:")&&status.includes("cannot create new PNG")?status:null;
      });
      assert.deepEqual(await readFile(path.join(root,"webview_e2e.png")),png,
        "Second PNG export unexpectedly overwrote the owner file");
    });
    await step("open saved native project from disk and restore effects and masks",async()=>{
      await click("#motion-open");
      await ready("Opening native project · native verification complete",60000);
      await waitFor("persisted shape layer",async=>
        (await text("#motion-layer-list")).includes("WebDriver Shape"));
      await click("#motion-layer-list .motion-layer");
      await ready("Selecting native layer · native verification complete",60000);
      assert.match(await text("#motion-effect-list"),/Gaussian Blur/);
      assert.match(await text("#motion-mask-list"),/Mask 1/);
      assert.match(await attr("#motion-native-frame","src"),/^data:image\/png;base64,/);
    });
    await step("switch Video -> Motion and keep native state",async()=>{
      await click('button[data-studio="video"]');
      await waitFor("Video Studio",async()=>await text("#studio-title")==="Video Studio");
      await click('button[data-studio="motion"]');
      await ready("Native Windows engine connected",60000);
      await waitFor("reopened native layer list",async=>
        (await text("#motion-layer-list")).includes("WebDriver Shape"));
      assert.match(await attr("#motion-native-frame","src"),/^data:image\/png;base64,/);
    });
    await step("cold restart real Windows app and reopen persisted EffectCraft project",async()=>{
      await wd("DELETE",`/session/${session}`);
      session=undefined;
      await delay(1200);
      const relaunched=await wd("POST","/session",{
        capabilities:{alwaysMatch:{"browserName":"wry","tauri:options":{application:path.resolve(application)}}}
      });
      session=relaunched.sessionId;
      assert.ok(session,"Windows driver failed to relaunch real application");
      await waitFor("Motion Studio after fresh process",()=>find('button[data-studio="motion"]'));
      await click('button[data-studio="motion"]');
      await ready("Native Windows engine connected",60000);
      await fill("#motion-workspace",root);
      await fill("#motion-filename","webview_e2e.ecproj");
      await click("#motion-open");
      await ready("Opening native project · native verification complete",60000);
      await waitFor("persisted shape after full process restart",async=>
        (await text("#motion-layer-list")).includes("WebDriver Shape"));
      await click("#motion-layer-list .motion-layer");
      await ready("Selecting native layer · native verification complete",60000);
      assert.match(await text("#motion-effect-list"),/Gaussian Blur/);
      assert.match(await text("#motion-mask-list"),/Mask 1/);
      const frame=await attr("#motion-native-frame","src");
      assert.match(frame,/^data:image\/png;base64,/);
      const decoded=Buffer.from(frame.split(",",2)[1],"base64");
      assert.ok(decoded.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex")),
        "Relaunched application failed to return a real EffectCraft PNG preview");
      result.coldRestartVerified=true;
    });
    await step("native desktop screenshot",async()=>{
      await screenshot("motion-windows-webview2.png");
      result.nativeScreenshot="motion-windows-webview2.png";
    });
    result.ok=true;
    result.proof="clicked-webview2-native-effects-masks-pixel-diffs-save-open-no-overwrite";
    await writeFile(path.join(artifacts,"receipt.json"),JSON.stringify(result,null,2));
    process.stdout.write(JSON.stringify(result)+"\n");
  }catch(error){
    result.ok=false;result.failedStep=lastStep;result.error=String(error);
    try{await screenshot("motion-failed.png")}catch{}
    await writeFile(path.join(artifacts,"receipt.json"),JSON.stringify(result,null,2));
    throw error;
  }finally{
    if(session){await wd("DELETE",`/session/${session}`).catch(()=>{});}
  }
}
test().catch(e=>{console.error("REAL WINDOWS MOTION WEBVIEW2 E2E FAILED",e);process.exitCode=1});
