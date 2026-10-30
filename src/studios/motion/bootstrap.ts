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
type NativeEffectParameter = { uid:number;parameter:string;value:number;minimum:number;maximum:number;source:string };
type NativeMaskSettings = { uid:number;feather:[number,number];expansion:number;opacity:number };
type NativeHistory = { canUndo:boolean;canRedo:boolean;undoDepth:number;redoDepth:number;
  nextUndo:string|null;nextRedo:string|null;revision:number;dirty:boolean };
type NativeHistoryReceipt = { action:string;label:string;projectChanged:boolean;after:NativeHistory };
const preview = document.querySelector<HTMLElement>(".preview")!;
const timeline = document.querySelector<HTMLElement>(".timeline")!;
const health = document.querySelector<HTMLElement>("#engine-health")!;
const originalPreview = preview.innerHTML;
const originalTimeline = timeline.innerHTML;
const motionTab = document.querySelector<HTMLButtonElement>('button[data-studio="motion"]')!;
const videoTab = document.querySelector<HTMLButtonElement>('button[data-studio="video"]')!;
let mounted = false;
let uiGeneration = 0;
let activeComp: Comp | null = null;
let lastHistoryCompId: number | null = null;
let activeLayer: Layer | null = null;
let activeEffect: Effect | null = null;
let activeMask: Mask | null = null;
let currentTime = 0;
let busy = false;
let pendingPreview = false;

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
  if (busy) {
    // Never silently drop an owner command while a prior operation is pending.
    if(mounted){
      const warning="Native editor busy; "+label+" was not accepted. Retry.";
      node<HTMLElement>("#motion-command-notice").textContent=warning;
      info("FAIL: "+warning,true);
    }
    return;
  }
  busy = true;
  if(mounted)node<HTMLElement>("#motion-command-notice").textContent="";
  const generation=uiGeneration;
  let error:unknown=null;
  info(label+"…");
  try {
    await work();
  } catch (failed) {
    error=failed;
  } finally {
    // Only report completion AFTER the UI can accept the next owner action.
    busy = false;
    if(mounted&&generation===uiGeneration) {
      info(error===null?label+" · native verification complete":"FAIL: "+String(error),error!==null);
    }
    if(mounted&&pendingPreview){
      pendingPreview=false;
      void execute("Rendering latest playhead",renderFrame);
    }
  }
}
function scheduleNativePreview():void {
  if(!mounted||!activeComp)return;
  if(busy){pendingPreview=true;return;}
  void execute("Rendering latest playhead",renderFrame);
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
  const generation=uiGeneration;
  const layers = await request<Layer[]>({action:"listLayers",compId:comp.id});
  if(!mounted||generation!==uiGeneration||activeComp?.id!==comp.id)return;
  activeLayer=layers.find(item=>item.id===activeLayer?.id)??null;
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
      void execute("Selecting native layer",async()=>{
        await listLayers();
        await refreshEffectMaskControls();
      });
    });
    list.append(btn);
  }
}
async function renderFrame():Promise<void> {
  const comp = ensureComp();
  const generation=uiGeneration;
  const frameTime=currentTime;
  const frame = await request<{
    width:number;height:number;pngBase64:string;source:string;visiblePixels:number;revision:number
  }>({action:"render",compId:comp.id,time:frameTime,maxSide:640,transparent:true});
  if(!mounted||generation!==uiGeneration||activeComp?.id!==comp.id||currentTime!==frameTime)return;
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
  const generation=uiGeneration;
  const effects=await request<Effect[]>({action:"listEffects",...query});
  const masks=await request<Mask[]>({action:"listMasks",...query});
  if(!mounted||generation!==uiGeneration||activeComp?.id!==query.compId
    ||activeLayer?.id!==query.layerId)return;
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
  await refreshSelectedNativeProperties();
}
function selectedEffectKind(effect:Effect):string {
  return effect.id==="ec.blur.gaussian"?"gaussianBlur":"brightnessContrast";
}
async function refreshSelectedNativeProperties():Promise<void>{
  if(!activeComp||!activeLayer)return;
  const compId=activeComp.id,layerId=activeLayer.id;
  const generation=uiGeneration;
  if(activeEffect){
    const kind=selectedEffectKind(activeEffect);
    const choice=node<HTMLSelectElement>("#motion-fx-param");
    const valid=kind==="gaussianBlur"?["blurriness"]:["brightness","contrast"];
    for(const item of Array.from(choice.options))item.disabled=!valid.includes(item.value);
    if(!valid.includes(choice.value))choice.value=valid[0];
    const param=await request<NativeEffectParameter>({action:"inspectEffectParameter",
      compId,layerId,uid:activeEffect.uid,effect:kind,parameter:choice.value});
    if(!mounted||generation!==uiGeneration||activeComp?.id!==compId
      ||activeLayer?.id!==layerId||activeEffect?.uid!==param.uid)return;
    if(param.source!=="native-effectcraft")throw new Error("Effect parameter was not read from native engine");
    const input=node<HTMLInputElement>("#motion-fx-value");
    input.value=String(param.value);
    input.min=String(param.minimum);input.max=String(param.maximum);
    node<HTMLElement>("#motion-fx-state").textContent=
      param.parameter+": "+param.value+" (native)";
  }else{
    node<HTMLElement>("#motion-fx-state").textContent="Select an effect";
  }
  if(activeMask){
    const state=await request<NativeMaskSettings>({action:"getMaskSettings",
      compId,layerId,uid:activeMask.uid});
    if(!mounted||generation!==uiGeneration||activeComp?.id!==compId
      ||activeLayer?.id!==layerId||activeMask?.uid!==state.uid)return;
    node<HTMLInputElement>("#motion-feather").value=String(state.feather[0]);
    node<HTMLInputElement>("#motion-expansion").value=String(state.expansion);
    node<HTMLInputElement>("#motion-mask-opacity").value=String(state.opacity);
    node<HTMLElement>("#motion-mask-state").textContent=
      "Native mask #"+state.uid+" · "+activeMask.vertices.length+" points";
  }else{
    node<HTMLElement>("#motion-mask-state").textContent="Select a mask";
  }
}
async function refreshNativeHistory():Promise<void>{
  const generation=uiGeneration;
  const state=await request<NativeHistory>({action:"inspectHistory"});
  if(!mounted||generation!==uiGeneration)return;
  const undo=node<HTMLButtonElement>("#motion-undo");
  const redo=node<HTMLButtonElement>("#motion-redo");
  undo.disabled=!state.canUndo;redo.disabled=!state.canRedo;
  undo.title=state.canUndo?"Undo: "+state.nextUndo:"Nothing to undo";
  redo.title=state.canRedo?"Redo: "+state.nextRedo:"Nothing to redo";
  node<HTMLElement>("#motion-history-status").textContent=
    "Native history "+state.undoDepth+"/"+state.redoDepth+(state.dirty?" · unsaved":" · saved");
}
async function afterEdit():Promise<void> {
  if(!mounted)return;
  await listLayers();
  if(!mounted)return;
  await refreshEffectMaskControls();
  if(!mounted)return;
  await renderFrame();
  if(!mounted)return;
  await refreshNativeHistory();
}
async function historyEdit(action:"undo"|"redo"):Promise<void>{
  const receipt=await request<NativeHistoryReceipt>({action});
  if(!receipt.projectChanged)throw new Error("Native history did not change the project");
  const compId=activeComp?.id??lastHistoryCompId;
  if(compId!==null){
    try {
      // Redo can restore an entire composition previously removed by native Undo.
      const inspected=await request<Comp>({action:"inspectComposition",compId});
      activeComp=inspected;lastHistoryCompId=null;
      activeLayer=null;activeEffect=null;activeMask=null;
      await afterEdit();
      return;
    }catch{
      lastHistoryCompId=compId;
      activeComp=null;activeLayer=null;activeEffect=null;activeMask=null;
      node<HTMLImageElement>("#motion-native-frame").removeAttribute("src");
      node<HTMLElement>("#motion-frame-info").textContent="No native composition after "+action;
      node<HTMLElement>("#motion-layer-list").textContent="No active composition";
    }
  }
  await refreshNativeHistory();
}
function bindClick(selector:string,label:string,action:()=>Promise<void>):void {
  node<HTMLButtonElement>(selector).addEventListener("click",()=>void execute(label,action));
}
function paintUi():void {
  uiGeneration++;
  preview.innerHTML = `
  <section class="motion-pane" aria-label="EffectCraft motion editor">
    <div class="motion-toolbar">
      <strong>EffectCraft · Native Motion Editor</strong>
      <div class="motion-history">
        <button type="button" id="motion-undo" disabled aria-label="Undo native motion edit">Undo</button>
        <button type="button" id="motion-redo" disabled aria-label="Redo native motion edit">Redo</button>
        <span id="motion-history-status">Native history loading…</span>
      </div>
      <span id="motion-status" role="status" aria-live="polite">Connecting to Windows engine…</span>
      <span id="motion-command-notice" role="alert" aria-live="assertive"></span>
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
     <span id="motion-fx-state">Select an effect</span>
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
     <label>Feather px <input id="motion-feather" type="number" min="0" max="250" value="0"/></label>
     <label>Expansion px <input id="motion-expansion" type="number" min="-250" max="250" value="0"/></label>
     <label>Mask Opacity % <input id="motion-mask-opacity" type="number" min="0" max="100" value="100"/></label>
     <button id="motion-apply-mask-settings">Apply native mask settings</button>
     <span id="motion-mask-state">Select a mask</span>
   </div>
   <div id="motion-mask-list" class="motion-layers">Select a layer</div>
   <div class="motion-fields">
     <label>Workspace folder (already exists)
       <input id="motion-workspace" placeholder="C:\\Users\\you\\Documents\\Shuvi" aria-label="Owner-selected workspace folder"/></label>
     <label>Project filename <input id="motion-filename" value="my_motion.ecproj"/></label>
     <button id="motion-save">Save .ecproj</button><button id="motion-open">Open .ecproj</button>
     <label>PNG filename <input id="motion-png-filename" value="motion_frame.png"/></label>
     <button id="motion-export-png">Export native PNG frame</button>
   </div>
  </section>`;
}
function bind():void {
  bindClick("#motion-undo","Undoing native edit",()=>historyEdit("undo"));
  bindClick("#motion-redo","Redoing native edit",()=>historyEdit("redo"));
  bindClick("#motion-create","Creating composition",async()=>{
    const comp=await request<Comp>({action:"createComposition",name:value("#motion-name"),
      width:number("#motion-width"),height:number("#motion-height"),
      fps:number("#motion-fps"),durationSeconds:number("#motion-duration")});
    activeComp=comp;lastHistoryCompId=null;activeLayer=null;activeEffect=null;activeMask=null;currentTime=0;updateSlider();await afterEdit();
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
  node<HTMLSelectElement>("#motion-fx-param").addEventListener("change",()=>{
    void execute("Loading EffectCraft parameter",refreshSelectedNativeProperties);
  });
  bindClick("#motion-apply-mask-settings","Editing native mask settings",async()=>{
    const c=ensureComp(),l=ensureLayer();
    if(!activeMask)throw new Error("Select a mask to edit its settings");
    const uid=activeMask.uid;
    const settings=[
      {property:"feather",value:number("#motion-feather")},
      {property:"expansion",value:number("#motion-expansion")},
      {property:"opacity",value:number("#motion-mask-opacity")}
    ];
    const ranges:Record<string,[number,number]>={
      feather:[0,250],expansion:[-250,250],opacity:[0,100]
    };
    for(const setting of settings){
      const [min,max]=ranges[setting.property];
      if(!Number.isFinite(setting.value)||setting.value<min||setting.value>max)
        throw new Error("Invalid "+setting.property+" (allowed "+min+".."+max+")");
    }
    for(const setting of settings){
      await request({action:"setMaskProperty",compId:c.id,layerId:l.id,uid,...setting});
    }
    await afterEdit();
  });
  node<HTMLButtonElement>("#motion-render").addEventListener("click",scheduleNativePreview);
  node<HTMLInputElement>("#motion-time").addEventListener("input",(event)=>{
    currentTime=Number((event.target as HTMLInputElement).value);
    node<HTMLElement>("#motion-time-label").textContent=currentTime.toFixed(2)+" s";
  });
  node<HTMLInputElement>("#motion-time").addEventListener("change",scheduleNativePreview);
  bindClick("#motion-export-png","Exporting native PNG",async()=>{
    const c=ensureComp();
    const root=value("#motion-workspace");
    if(!root)throw new Error("Choose an existing owner workspace folder");
    const exported=await request<{path:string;bytes:number;verifiedFromDisk:boolean;source:string}>({
      action:"exportPng",workspace:root,filename:value("#motion-png-filename"),
      compId:c.id,time:currentTime,maxSide:640,transparent:true
    });
    if(!exported.verifiedFromDisk||exported.source!=="native-effectcraft")
      throw new Error("PNG export did not verify against native EffectCraft pixels");
    node<HTMLElement>("#motion-frame-info").textContent=
      "PNG saved ("+exported.bytes+" bytes): "+exported.path;
  });
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
    lastHistoryCompId=null;activeLayer=null;activeEffect=null;activeMask=null;currentTime=0;updateSlider();
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
    if(activeComp)await afterEdit();
    else await refreshNativeHistory();
  } catch(error) {
    if(mounted){health.textContent="Motion engine unavailable";info(String(error),true);}
  }
}
function unmount():void {
  if(!mounted)return;
  uiGeneration++;
  pendingPreview=false;
  mounted=false;preview.innerHTML=originalPreview;timeline.innerHTML=originalTimeline;
  health.textContent="Source pinned · Engine not built";
}
motionTab.addEventListener("click",()=>void mount());
videoTab.addEventListener("click",unmount);

// Native history shortcuts, only while the editor (not a text input) owns focus.
document.addEventListener("keydown",(event)=>{
  if(!mounted||busy||!(event.ctrlKey||event.metaKey)||event.altKey)return;
  const target=event.target;
  if(target instanceof HTMLElement && target.closest('input,textarea,select,[contenteditable="true"]'))return;
  const key=event.key.toLowerCase();
  const redo=(key==="z"&&event.shiftKey)||key==="y";
  const undo=key==="z"&&!event.shiftKey;
  if(!undo&&!redo)return;
  const button=node<HTMLButtonElement>(redo?"#motion-redo":"#motion-undo");
  if(button.disabled)return;
  event.preventDefault();
  void execute(redo?"Redoing native edit":"Undoing native edit",()=>historyEdit(redo?"redo":"undo"));
});
