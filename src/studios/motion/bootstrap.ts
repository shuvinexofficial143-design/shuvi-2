/**
 * Motion Studio lives inside the existing one-window Shuvi shell.
 * All changes invoke the registered Tauri worker; browser-only mode is NOT a fake editor.
 */
import { invoke } from "@tauri-apps/api/core";
import "./motion.css";

type RecordJson = Record<string, unknown>;
type Comp = { id:number;name:string;width:number;height:number;fps:number;durationSeconds:number };
type Layer = { id:number;name:string;kind:string;opacity:number;rotation:number;keyframes:number };
type Effect = { uid:number;id:string;name:string;enabled:boolean };
type Mask = { uid:number;name:string;closed:boolean;vertices:[number,number][] };
const preview = document.querySelector<HTMLElement>(".preview")!;
const timeline = document.querySelector<HTMLElement>(".timeline")!;
const health = document.querySelector<HTMLElement>("#engine-health")!;
const originalPreview = preview.innerHTML;
const originalTimeline = timeline.innerHTML;
const motionTab = document.querySelector<HTMLButtonElement>('button[data-studio="motion"]')!;
const videoTab = document.querySelector<HTMLButtonElement>('button[data-studio="video"]')!;
let mounted = false;
let activeComp: Comp | null = null;
let activeLayer: Layer | null = null;
let activeEffect: Effect | null = null;
let activeMask: Mask | null = null;
let currentTime = 0;
let busy = false;

const request = async <T>(payload: RecordJson): Promise<T> =>
  invoke<T>("motion_command", { request: payload });

function node<T extends HTMLElement>(selector:string):T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error("Motion control is missing: " + selector);
  return found;
}
function value(selector:string):string { return node<HTMLInputElement>(selector).value.trim(); }
function number(selector:string):number { return Number(value(selector)); }
function info(message:string,failed=false):void {
  const el = node<HTMLElement>("#motion-status");
  el.textContent = message;
  el.dataset.failure = String(failed);
}
async function execute(label:string,work:()=>Promise<void>):Promise<void> {
  if (busy) return;
  busy = true;
  info(label+"…");
  try {
    await work();
    info(label+" · native verification complete");
  } catch (error) {
    info("FAIL: "+String(error),true);
  } finally { busy = false; }
}
function ensureComp():Comp {
  if (!activeComp) throw new Error("Create or open a composition first");
  return activeComp;
}
function ensureLayer():Layer {
  if (!activeLayer) throw new Error("Select a layer first");
  return activeLayer;
}
function updateSlider():void {
  const end = Math.max(0,(activeComp?.durationSeconds ?? 5)-0.001);
  const slider = node<HTMLInputElement>("#motion-time");
  slider.max = String(end);
  slider.value = String(Math.min(currentTime,end));
  node<HTMLElement>("#motion-time-label").textContent = currentTime.toFixed(2)+" s";
}
async function listLayers():Promise<void> {
  const comp = ensureComp();
  const layers = await request<Layer[]>({action:"listLayers",compId:comp.id});
  const list = node<HTMLElement>("#motion-layer-list");
  list.replaceChildren();
  if (!layers.length) { list.textContent = "No layers yet"; activeLayer=null; return; }
  for (const layer of layers) {
    const btn = document.createElement("button");
    btn.type="button";
    btn.textContent = layer.kind+" · "+layer.name+" · #"+layer.id+(layer.keyframes ? " · "+layer.keyframes+" keys" : "");
    btn.className = "motion-layer"+(activeLayer?.id === layer.id?" selected":"");
    btn.addEventListener("click",()=>{
      activeLayer=layer;activeEffect=null;activeMask=null;
      node<HTMLInputElement>("#motion-rotation").value=String(layer.rotation);
      node<HTMLInputElement>("#motion-opacity").value=String(layer.opacity);
      void listLayers();
    });
    list.append(btn);
  }
}
async function renderFrame():Promise<void> {
  const comp = ensureComp();
  const frame = await request<{
    width:number;height:number;pngBase64:string;source:string;visiblePixels:number;revision:number
  }>({action:"render",compId:comp.id,time:currentTime,maxSide:640,transparent:true});
  if (frame.source !== "native-effectcraft" || !frame.pngBase64) throw new Error("Unverified frame source");
  const image = node<HTMLImageElement>("#motion-native-frame");
  image.src = "data:image/png;base64,"+frame.pngBase64;
  image.alt="Actual EffectCraft native rendered composition at "+currentTime.toFixed(2)+" seconds";
  node<HTMLElement>("#motion-frame-info").textContent=
    frame.width+"×"+frame.height+" · "+frame.visiblePixels+" drawn pixels · Rev "+frame.revision;
}
async function refreshEffectMaskControls():Promise<void>{
  const effectsEl=node<HTMLElement>("#motion-effect-list");
  const masksEl=node<HTMLElement>("#motion-mask-list");
  effectsEl.replaceChildren();
  masksEl.replaceChildren();
  if(!activeLayer||!activeComp){
    effectsEl.textContent="Select a layer to edit its effects";
    masksEl.textContent="Select a layer to edit its masks";
    activeEffect=null;activeMask=null;return;
  }
  const query={compId:activeComp.id,layerId:activeLayer.id};
  const effects=await request<Effect[]>({action:"listEffects",...query});
  const masks=await request<Mask[]>({action:"listMasks",...query});
  activeEffect=effects.find(f=>f.uid===activeEffect?.uid)??null;
  activeMask=masks.find(m=>m.uid===activeMask?.uid)??null;
  if(!effects.length)effectsEl.textContent="No effects";
  for(const effect of effects){
    const button=document.createElement("button");
    button.type="button";
    button.textContent=effect.name+(effect.enabled?" · on":" · off");
    button.className="motion-layer"+(activeEffect?.uid===effect.uid?" selected":"");
    button.addEventListener("click",()=>{
      activeEffect=effect;
      node<HTMLSelectElement>("#motion-effect-kind").value=
        effect.id==="ec.blur.gaussian"?"gaussianBlur":"brightnessContrast";
      void refreshEffectMaskControls();
    });
    effectsEl.append(button);
  }
  if(!masks.length)masksEl.textContent="No masks";
  for(const mask of masks){
    const button=document.createElement("button");
    button.type="button";button.textContent=mask.name+" · "+mask.vertices.length+" points";
    button.className="motion-layer"+(activeMask?.uid===mask.uid?" selected":"");
    button.addEventListener("click",()=>{activeMask=mask;void refreshEffectMaskControls();});
    masksEl.append(button);
  }
}
async function afterEdit():Promise<void> {
  await listLayers();
  await refreshEffectMaskControls();
  await renderFrame();
}
function bindClick(selector:string,label:string,action:()=>Promise<void>):void {
  node<HTMLButtonElement>(selector).addEventListener("click",()=>void execute(label,action));
}
function paintUi():void {
  preview.innerHTML = `
  <section class="motion-pane" aria-label="EffectCraft motion editor">
    <div class="motion-toolbar">
      <strong>EffectCraft · Native Motion Editor</strong>
      <span id="motion-status" role="status" aria-live="polite">Connecting to Windows engine…</span>
    </div>
    <div class="motion-preview"><img id="motion-native-frame" alt="No native composition frame yet"/>
      <p id="motion-frame-info">Create a composition to render a real frame</p></div>
    <div class="motion-time"><label for="motion-time">Playhead</label>
      <input id="motion-time" type="range" min="0" max="4.9" step="0.033333" value="0"/>
      <span id="motion-time-label">0.00 s</span><button id="motion-render">Render native frame</button>
    </div>
  </section>`;
  timeline.innerHTML = `
  <section class="motion-tools" aria-label="Native composition and layers">
   <div class="motion-fields">
     <label>Composition <input id="motion-name" value="My Motion Scene" maxlength="120"/></label>
     <label>W <input id="motion-width" type="number" value="640" min="4" max="8192"/></label>
     <label>H <input id="motion-height" type="number" value="360" min="4" max="8192"/></label>
     <label>FPS <input id="motion-fps" type="number" value="30" min="1" max="120"/></label>
     <label>Seconds <input id="motion-duration" type="number" value="5" min="0.05" max="600"/></label>
     <button id="motion-create">New native comp</button>
   </div>
   <div class="motion-fields">
     <label>Layer name <input id="motion-layer-name" value="Motion Title"/></label>
     <label>Text <input id="motion-text" value="Hello from Shuvi 2"/></label>
     <button id="motion-add-text">Add editable text</button>
     <button id="motion-edit-text">Edit selected text</button>
     <label>Shape <select id="motion-shape-kind"><option value="rect">Rectangle</option>
       <option value="ellipse">Ellipse</option><option value="rounded">Rounded</option>
       <option value="star">Star</option><option value="polygon">Polygon</option></select></label>
     <button id="motion-add-shape">Add real shape</button>
   </div>
   <div class="motion-fields">
     <label>Position X <input id="motion-pos-x" type="number" value="320"/></label>
     <label>Y <input id="motion-pos-y" type="number" value="180"/></label>
     <button id="motion-set-position">Set position</button>
     <label>Scale X % <input id="motion-scale-x" type="number" value="100"/></label>
     <label>Y % <input id="motion-scale-y" type="number" value="100"/></label>
     <button id="motion-set-scale">Set scale</button>
     <label>Rotation <input id="motion-rotation" type="number" value="0"/></label>
     <button id="motion-set-rotation">Set rotation</button>
     <label>Opacity % <input id="motion-opacity" type="number" value="100" min="0" max="100"/></label>
     <button id="motion-set-opacity">Set opacity</button>
     <button id="motion-animate-opacity">Keyframe 100% → 0% + Easy Ease</button>
   </div>
   <div id="motion-layer-list" class="motion-layers">No native layers yet</div>
   <div class="motion-fields">
     <strong>Native Effects</strong>
     <label>Effect <select id="motion-effect-kind">
       <option value="gaussianBlur">Gaussian Blur</option>
       <option value="brightnessContrast">Brightness &amp; Contrast</option>
     </select></label>
     <button id="motion-add-effect">Apply native effect</button>
     <label>Parameter <select id="motion-fx-param">
       <option value="blurriness">Blurriness</option>
       <option value="brightness">Brightness</option>
       <option value="contrast">Contrast</option>
     </select></label>
     <label>Value <input id="motion-fx-value" type="number" value="20"/></label>
     <button id="motion-set-effect">Set selected effect parameter</button>
     <button id="motion-toggle-effect">Enable/disable</button>
     <button id="motion-remove-effect">Remove effect</button>
   </div>
   <div id="motion-effect-list" class="motion-layers">Select a layer</div>
   <div class="motion-fields">
     <strong>Native Polygon Masks</strong>
     <label>Width <input id="motion-mask-width" type="number" min="4" value="160"/></label>
     <label>Height <input id="motion-mask-height" type="number" min="4" value="85"/></label>
     <button id="motion-add-mask">Add closed rectangular mask</button>
     <label>First vertex X <input id="motion-mask-x" type="number" value="-90"/></label>
     <label>Y <input id="motion-mask-y" type="number" value="-45"/></label>
     <button id="motion-edit-mask">Edit mask vertex</button>
     <button id="motion-remove-mask">Remove mask</button>
   </div>
   <div id="motion-mask-list" class="motion-layers">Select a layer</div>
   <div class="motion-fields">
     <label>Workspace folder (already exists)
       <input id="motion-workspace" placeholder="C:\\Users\\you\\Documents\\Shuvi" aria-label="Owner-selected workspace folder"/></label>
     <label>Project filename <input id="motion-filename" value="my_motion.ecproj"/></label>
     <button id="motion-save">Save .ecproj</button><button id="motion-open">Open .ecproj</button>
   </div>
  </section>`;
}
function bind():void {
  bindClick("#motion-create","Creating composition",async()=>{
    const comp=await request<Comp>({action:"createComposition",name:value("#motion-name"),
      width:number("#motion-width"),height:number("#motion-height"),
      fps:number("#motion-fps"),durationSeconds:number("#motion-duration")});
    activeComp=comp;activeLayer=null;activeEffect=null;activeMask=null;currentTime=0;updateSlider();await afterEdit();
  });
  bindClick("#motion-add-text","Creating editable text",async()=>{
    const c=ensureComp();
    const layer=await request<Layer>({action:"addText",compId:c.id,name:value("#motion-layer-name"),
      text:value("#motion-text"),x:c.width/2,y:c.height/3,size:40});
    activeLayer=layer;await afterEdit();
  });
  bindClick("#motion-add-shape","Creating shape",async()=>{
    const c=ensureComp();
    const layer=await request<Layer>({action:"addShape",compId:c.id,
      name:value("#motion-layer-name"),kind:value("#motion-shape-kind"),
      x:c.width/2,y:c.height/2,width:Math.min(250,c.width/2),height:Math.min(110,c.height/2),
      fill:"#22aaff"});
    activeLayer=layer;await afterEdit();
  });
  bindClick("#motion-edit-text","Editing native Source Text",async()=>{
    const c=ensureComp();const l=ensureLayer();
    await request({action:"editText",compId:c.id,layerId:l.id,text:value("#motion-text")});
    await afterEdit();
  });
  bindClick("#motion-set-position","Setting position",async()=>{
    const c=ensureComp();const l=ensureLayer();
    await request({action:"setTransform",compId:c.id,layerId:l.id,
      kind:"position",x:number("#motion-pos-x"),y:number("#motion-pos-y")});
    await afterEdit();
  });
  bindClick("#motion-set-scale","Setting scale",async()=>{
    const c=ensureComp();const l=ensureLayer();
    await request({action:"setTransform",compId:c.id,layerId:l.id,
      kind:"scale",x:number("#motion-scale-x"),y:number("#motion-scale-y")});
    await afterEdit();
  });
  bindClick("#motion-set-rotation","Setting rotation",async()=>{
    const c=ensureComp();const l=ensureLayer();
    await request({action:"setTransform",compId:c.id,layerId:l.id,kind:"rotation",value:number("#motion-rotation")});
    await afterEdit();
  });
  bindClick("#motion-set-opacity","Setting opacity",async()=>{
    const c=ensureComp();const l=ensureLayer();
    await request({action:"setTransform",compId:c.id,layerId:l.id,kind:"opacity",value:number("#motion-opacity")});
    await afterEdit();
  });
  bindClick("#motion-animate-opacity","Animating opacity",async()=>{
    const c=ensureComp();const l=ensureLayer();
    const end=Math.min(2,c.durationSeconds-1/c.fps);
    if(end<=0)throw new Error("Composition is too short for two keys");
    await request({action:"addKey",compId:c.id,layerId:l.id,property:"opacity",time:0,value:100});
    await request({action:"addKey",compId:c.id,layerId:l.id,property:"opacity",time:end,value:0});
    await request({action:"easeKeys",compId:c.id,layerId:l.id,property:"opacity",times:[0,end]});
    await afterEdit();
  });
  bindClick("#motion-add-effect","Applying native effect",async()=>{
    const c=ensureComp();const l=ensureLayer();
    activeEffect=await request<Effect>({action:"addEffect",compId:c.id,layerId:l.id,
      effect:value("#motion-effect-kind")});
    await afterEdit();
  });
  bindClick("#motion-set-effect","Editing native effect parameter",async()=>{
    const c=ensureComp();const l=ensureLayer();
    if(!activeEffect)throw new Error("Select an effect instance first");
    const effect=activeEffect.id==="ec.blur.gaussian"?"gaussianBlur":"brightnessContrast";
    await request({action:"setEffectParameter",compId:c.id,layerId:l.id,
      uid:activeEffect.uid,effect,parameter:value("#motion-fx-param"),
      value:number("#motion-fx-value")});
    await afterEdit();
  });
  bindClick("#motion-toggle-effect","Toggling native effect",async()=>{
    const c=ensureComp();const l=ensureLayer();
    if(!activeEffect)throw new Error("Select an effect first");
    await request({action:"toggleEffect",compId:c.id,layerId:l.id,
      uid:activeEffect.uid,enabled:!activeEffect.enabled});
    await afterEdit();
  });
  bindClick("#motion-remove-effect","Removing native effect",async()=>{
    const c=ensureComp();const l=ensureLayer();
    if(!activeEffect)throw new Error("Select an effect first");
    await request({action:"removeEffect",compId:c.id,layerId:l.id,uid:activeEffect.uid});
    activeEffect=null;await afterEdit();
  });
  bindClick("#motion-add-mask","Creating native polygon mask",async()=>{
    const c=ensureComp();const l=ensureLayer();
    const w=number("#motion-mask-width"),h=number("#motion-mask-height");
    if(!Number.isFinite(w)||!Number.isFinite(h)||w<4||h<4)throw new Error("Invalid mask bounds");
    const vertices:[number,number][]=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]];
    activeMask=await request<Mask>({action:"addPolygonMask",compId:c.id,layerId:l.id,vertices});
    await afterEdit();
  });
  bindClick("#motion-edit-mask","Moving native mask vertex",async()=>{
    const c=ensureComp();const l=ensureLayer();
    if(!activeMask)throw new Error("Select a mask first");
    await request({action:"setMaskVertex",compId:c.id,layerId:l.id,uid:activeMask.uid,
      index:0,point:[number("#motion-mask-x"),number("#motion-mask-y")]});
    await afterEdit();
  });
  bindClick("#motion-remove-mask","Removing native mask",async()=>{
    const c=ensureComp();const l=ensureLayer();
    if(!activeMask)throw new Error("Select a mask first");
    await request({action:"removeMask",compId:c.id,layerId:l.id,uid:activeMask.uid});
    activeMask=null;await afterEdit();
  });
  bindClick("#motion-render","Rendering native preview",renderFrame);
  node<HTMLInputElement>("#motion-time").addEventListener("input",(event)=>{
    currentTime=Number((event.target as HTMLInputElement).value);
    node<HTMLElement>("#motion-time-label").textContent=currentTime.toFixed(2)+" s";
  });
  node<HTMLInputElement>("#motion-time").addEventListener("change",()=>void execute("Rendering playhead",renderFrame));
  bindClick("#motion-save","Saving native project",async()=>{
    const root=value("#motion-workspace");
    if(!root)throw new Error("Choose an existing owner workspace folder");
    const saved=await request<{path:string;verifiedFromDisk:boolean;bytes:number}>({
      action:"saveProject",workspace:root,basename:value("#motion-filename")
    });
    if(!saved.verifiedFromDisk)throw new Error("Native Save/Reopen did not verify");
    info("Saved "+saved.bytes+" bytes: "+saved.path);
  });
  bindClick("#motion-open","Opening native project",async()=>{
    const root=value("#motion-workspace");
    if(!root)throw new Error("Choose an existing owner workspace folder");
    const opened=await request<{compositions:Comp[];verifiedFromDisk:boolean}>({
      action:"openProject",workspace:root,basename:value("#motion-filename")
    });
    if(!opened.verifiedFromDisk)throw new Error("Native project reopen failed");
    activeComp=opened.compositions[0]??null;
    activeLayer=null;activeEffect=null;activeMask=null;currentTime=0;updateSlider();
    if(activeComp)await afterEdit();
  });
}
async function mount():Promise<void> {
  if(mounted)return;
  mounted=true;paintUi();bind();
  try {
    const status=await request<{ready:boolean;engine:string;native:boolean}>({action:"status"});
    if(!mounted)return;
    if(!status.ready||status.engine!=="effectcraft"||!status.native)throw new Error("Native engine did not verify");
    health.textContent="Native EffectCraft linked";
    info("Native Windows engine connected");
  } catch(error) {
    if(mounted){health.textContent="Motion engine unavailable";info(String(error),true);}
  }
}
function unmount():void {
  if(!mounted)return;
  mounted=false;preview.innerHTML=originalPreview;timeline.innerHTML=originalTimeline;
  health.textContent="Source pinned · Engine not built";
}
motionTab.addEventListener("click",()=>void mount());
videoTab.addEventListener("click",unmount);
