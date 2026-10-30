/** One real Tauri-window workspace, no fake native actions or AI provider. */
import {createWorkspaceController,clipsFromSequence,type WorkspaceNative,type WorkspaceState,type VideoAction} from "../unified-workspace/core.mjs";
import {nativeWorkspaceBridge} from "../unified-workspace/native";
import {projectMediaItems,selectedNativeMedia} from "../unified-workspace/media.mjs";
import "./workspace.css";

export function mountUnifiedWorkspace(root:HTMLElement,bridge:WorkspaceNative=nativeWorkspaceBridge){
  if(root.dataset.shuviWorkspace==="mounted")throw Error("Unified workspace already mounted");
  root.dataset.shuviWorkspace="mounted";
  root.classList.add("su");
  // Only static HTML is assigned here: all user/native data uses textContent.
  root.innerHTML=[
    '<div class="su-shell"><header class="su-head"><b>SHUVI 2 · Unified Workspace</b>',
    '<nav><button data-tab="video">Video Studio</button><button data-tab="motion">Motion Studio</button></nav>',
    '<span data-ui="health">Engine unverified</span></header><div class="su-columns">',
    '<aside class="su-tools"><h2>Native project</h2><section data-panel="video">',
    '<label>Selected folder<input data-field="root" placeholder="C:\\Projects\\Film"></label>',
    '<label>FilmCraft .fcproj<input data-field="project"></label>',
    '<button data-act="video-open">Open / refresh</button>',
    '<button data-act="video-new">Create sequence</button>',
    '<label>Media source<input data-field="source"></label>',
    '<button data-act="video-import">Import real media</button>',
    '<label>Native media library<select data-field="mediaId"><option value="">Open project first</option></select></label>',
    '<label>Track<input data-field="track" value="V1"></label>',
    '<button data-act="video-place">Place on timeline</button></section>',
    '<section data-panel="motion" hidden>',
    '<button data-act="motion-status">Check EffectCraft engine</button>',
    '<label>Composition<input data-field="compName" value="Shuvi Composition"></label>',
    '<div class="su-pair"><label>Width<input type="number" data-field="width" value="1280"></label>',
    '<label>Height<input type="number" data-field="height" value="720"></label></div>',
    '<div class="su-pair"><label>FPS<input type="number" data-field="fps" value="30"></label>',
    '<label>Duration<input type="number" data-field="duration" value="10"></label></div>',
    '<button data-act="motion-create">New composition</button>',
    '<label>Workspace folder<input data-field="motionRoot"></label>',
    '<label>Project .ecproj<input data-field="motionFile" value="shuvi.ecproj"></label>',
    '<button data-act="motion-open">Open project</button><button data-act="motion-save">Save project</button></section></aside>',
    '<main class="su-editor"><div class="su-editorhead"><h2 data-ui="title">Video Studio</h2>',
    '<span data-ui="revision">No native project</span></div>',
    '<div class="su-monitor"><img data-ui="frame" alt="Native project preview" hidden>',
    '<span data-ui="noFrame">No verified native frame yet</span></div>',
    '<section data-panel="video">',
    '<div class="su-pair"><label>Playhead seconds<input type="number" step=".04" min="0" data-field="videoTime" value="0"></label>',
    '<label>Trim frames<input type="number" data-field="trimFrames" value="-3"></label></div>',
    '<div class="su-buttons"><button data-act="video-preview">Render frame</button>',
    '<button data-act="video-split">Split</button><button data-act="video-trim">Trim Out</button>',
    '<button data-act="video-delete">Delete</button><button data-act="video-undo">Undo</button>',
    '<button data-act="video-redo">Redo</button></div>',
    '<h3>FilmCraft timeline</h3><div data-ui="clips" class="su-track">Open project to read native clips</div>',
    '<label>New MP4 output path<input data-field="output"></label>',
    '<button data-act="video-export">Export real MP4</button></section>',
    '<section data-panel="motion" hidden>',
    '<div class="su-pair"><label>Playhead<input type="number" min="0" step=".04" data-field="motionTime" value="0"></label>',
    '<label>Text<input data-field="text" value="Shuvi 2 Native Text"></label></div>',
    '<div class="su-buttons"><button data-act="motion-text">Add text</button>',
    '<button data-act="motion-edit">Edit selected text</button>',
    '<button data-act="motion-render">Render native frame</button></div>',
    '<h3>EffectCraft layers</h3><div data-ui="layers" class="su-track">No native composition</div>',
    '<section class="su-inspector" aria-label="Native Motion Properties"><h3>Native properties & keyframes</h3>',
    '<div data-ui="inspector-summary">Select a native layer to inspect</div>',
    '<button data-act="motion-inspect">Refresh selected layer</button>',
    '<label>Transform<select data-field="transformKind"><option value="position">Position</option><option value="scale">Scale</option><option value="rotation">Rotation</option><option value="opacity">Opacity</option></select></label>',
    '<div class="su-pair"><label>X<input data-field="transformX" type="number" step="any" value="0"></label>',
    '<label>Y<input data-field="transformY" type="number" step="any" value="0"></label></div>',
    '<label>Rotation / Opacity value<input data-field="transformValue" type="number" step="any" value="100"></label>',
    '<button data-act="motion-transform">Apply native transform</button>',
    '<label>Keyframe property<select data-field="keyProperty"><option value="opacity">Opacity</option><option value="rotation">Rotation</option></select></label>',
    '<label>Keyframe value<input data-field="keyValue" type="number" step="any" value="100"></label>',
    '<button data-act="motion-key">Add native keyframe at playhead</button>',
    '<h3>Add real shape</h3><label>Shape name<input data-field="shapeName" value="New Shape"></label>',
    '<label>Shape type<select data-field="shapeKind"><option value="rect">Rectangle</option><option value="ellipse">Ellipse</option><option value="rounded">Rounded</option><option value="star">Star</option><option value="polygon">Polygon</option></select></label>',
    '<div class="su-pair"><label>Width<input data-field="shapeW" type="number" value="180"></label>',
    '<label>Height<input data-field="shapeH" type="number" value="100"></label></div>',
    '<label>Native fill<input data-field="shapeFill" value="#3478f6"></label>',
    '<button data-act="motion-shape">Add native shape</button>',
    '<div data-ui="inspector-effects">Native effects: select layer</div>',
    '<div data-ui="inspector-masks">Native masks: select layer</div></section>',
    '<label>New PNG filename<input data-field="png" value="frame.png"></label>',
    '<button data-act="motion-export">Export PNG</button></section>',
    '<div class="su-progress" role="status"><span data-ui="progress">Idle</span>',
    '<button data-act="stop" disabled>Stop (request)</button></div>',
    '<div class="su-error" data-ui="error" role="alert" hidden></div></main>',
    '<aside class="su-chat"><h2>Shuvi AI Chat</h2><small>AI Director not connected — drafts only</small>',
    '<div data-ui="chat" class="su-thread"></div><form data-ui="chatForm">',
    '<label>Message<textarea data-field="message" rows="3"></textarea></label>',
    '<button type="submit">Save draft</button></form>',
    '<h3>Permission & approval</h3><p data-ui="approval">No AI action pending</p>',
    '<div class="su-buttons"><button data-act="approve" hidden>Approve once</button>',
    '<button data-act="reject" hidden>Reject</button></div>',
    '<small>Manual and approved AI edits use the same native project. No silent execution.</small>',
    '</aside></div></div>'
  ].join("");
  const ctrl=createWorkspaceController(bridge);
  const node=<T extends HTMLElement>(selector:string):T=>{
    const result=root.querySelector<T>(selector);
    if(!result)throw Error("Missing unified UI: "+selector);
    return result;
  };
  const f=(name:string)=>node<HTMLInputElement>('[data-field="'+name+'"]');
  const s=(name:string)=>f(name).value.trim();
  const n=(name:string)=>Number(s(name));
  let selectedClip:number|null=null,selectedLayer:number|null=null,seenVideo:string|null=null,seenLayers:string|null=null;
  let priorFrameKey="",objectUrl:string|null=null,seenChat=-1,seenInspectorKey="",disposed=false;
  const frame=node<HTMLImageElement>('[data-ui="frame"]');
  const clearFrame=()=>{
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
    frame.hidden=true;frame.removeAttribute("src");node('[data-ui="noFrame"]').hidden=false;
  };
  const refreshFrame=(state:WorkspaceState)=>{
    const receipt=state.studio==="video"?state.videoFrame:state.motion.frame;
    const key=!receipt?"":state.studio==="video"?
      "video:"+(receipt as {projectSha256:string;seconds?:number;pngBytes:number[]}).projectSha256+
      ":"+(receipt as {seconds?:number}).seconds:
      "motion:"+(receipt as {revision:number;checksum?:string}).revision+":"+
      (receipt as {checksum?:string}).checksum;
    const identity=state.studio+":"+key;
    if(identity===priorFrameKey)return;
    priorFrameKey=identity;clearFrame();
    if(!receipt)return;
    if(state.studio==="video"){
      const bytes=(receipt as {pngBytes:number[]}).pngBytes;
      if(!Array.isArray(bytes)||!bytes.length)return;
      objectUrl=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:"image/png"}));
      frame.src=objectUrl;
    }else{
      const b64=(receipt as {pngBase64:string}).pngBase64;
      if(!b64)return;
      frame.src="data:image/png;base64,"+b64;
    }
    frame.hidden=false;node('[data-ui="noFrame"]').hidden=true;
  };
  const render=(state:WorkspaceState)=>{
    if(disposed)return;
    for(const studio of ["video","motion"]){
      root.querySelectorAll<HTMLElement>('[data-panel="'+studio+'"]').forEach(el=>el.hidden=studio!==state.studio);
      const tab=node<HTMLButtonElement>('[data-tab="'+studio+'"]');tab.setAttribute("aria-pressed",String(studio===state.studio));
    }
    node('[data-ui="title"]').textContent=state.studio==="video"?"Video Studio":"Motion Studio";
    node('[data-ui="health"]').textContent=state.needsReload&&state.recoveryStudio===state.studio?"Native refresh required":state.busy?"Native operation running":
      state.studio==="motion"?(state.motion.ready?"EffectCraft native ready":"EffectCraft unverified"):
      state.video?"FilmCraft project readback verified":"FilmCraft unverified";
    node('[data-ui="revision"]').textContent=state.studio==="video"?(state.video?"SHA "+state.video.snapshot.projectSha256.slice(0,12):"No native project"):
      state.motion.composition?"Composition "+state.motion.composition.id+" · revision "+state.motion.revision:"No native composition";
    node('[data-ui="progress"]').textContent=state.progress;
    node('[data-ui="error"]').textContent=state.error??"";
    node('[data-ui="error"]').hidden=!state.error;
    root.querySelectorAll<HTMLButtonElement>("[data-act]").forEach(button=>{
      const key=button.dataset.act??"";
      if(key==="stop")button.disabled=!state.busy;
      else if(key==="approve"||key==="reject")button.disabled=state.busy;
      else button.disabled=state.busy||(state.needsReload&&state.recoveryStudio===state.studio&&!["video-open","motion-status","motion-open"].includes(key));
    });
    const videoKey=state.video?state.video.projectPath+":"+state.video.snapshot.projectSha256:null;
    if(videoKey!==seenVideo){
      seenVideo=videoKey;selectedClip=null;
      const timeline=node('[data-ui="clips"]');timeline.replaceChildren();
      const clips=clipsFromSequence(state.video?.snapshot.sequence);
      if(!clips.length)timeline.textContent="No real FilmCraft clips";
      const media=node<HTMLSelectElement>('[data-field="mediaId"]');
      const previouslySelected=media.value;media.replaceChildren();
      const empty=document.createElement("option");empty.value="";empty.textContent="Select imported media";media.append(empty);
      for(const item of projectMediaItems(state.video?.snapshot.project)){
        const option=document.createElement("option");option.value=String(item.id);
        option.textContent=(item.location?item.location+" / ":"")+item.name+" (#"+item.id+")";media.append(option);
      }
      if([...media.options].some(option=>option.value===previouslySelected))media.value=previouslySelected;
      for(const c of clips){const button=document.createElement("button");button.type="button";
        button.dataset.clip=String(c.clipId);button.textContent=c.track+" · "+c.name+" · "+c.start.toFixed(2)+"s";timeline.append(button);}
    }
    const layerKey=state.motion.composition?.id+":"+state.motion.revision;
    if(layerKey!==seenLayers){
      seenLayers=layerKey;
      if(!state.motion.layers.some(layer=>layer.id===selectedLayer))selectedLayer=null;
      const layers=node('[data-ui="layers"]');layers.replaceChildren();
      if(!state.motion.layers.length)layers.textContent="No native layers";
      for(const layer of state.motion.layers){const button=document.createElement("button");button.type="button";
        button.dataset.layer=String(layer.id);button.textContent="#"+layer.id+" · "+layer.kind+" · "+layer.name;
        button.classList.toggle("selected",selectedLayer===layer.id);layers.append(button);}
    }
    const inspector=state.motion.inspector;
    const inspectorKey=inspector?state.motion.composition?.id+":"+inspector.layer.id+":"+inspector.revision:"none";
    if(inspectorKey!==seenInspectorKey) {
      seenInspectorKey=inspectorKey;
      const summary=node('[data-ui="inspector-summary"]');
      if(!inspector){summary.textContent="Select a real layer to inspect native properties";}
      else {
        const layer=inspector.layer as {name:string;id:number;kind:string;position?:{x:number;y:number}|[number,number];opacity?:number;rotation?:number};
        summary.textContent=layer.name+" · #"+layer.id+" · "+layer.kind+" · native revision "+inspector.revision;
        const p=layer.position;
        if(p){
          const x=Array.isArray(p)?p[0]:p.x,y=Array.isArray(p)?p[1]:p.y;
          if(Number.isFinite(x))f("transformX").value=String(x);
          if(Number.isFinite(y))f("transformY").value=String(y);
        }
        if(Number.isFinite(layer.opacity))f("transformValue").value=String(layer.opacity);
      }
      node('[data-ui="inspector-effects"]').textContent=inspector?
        "Native effects: "+(inspector.effects.length?inspector.effects.map((e:{name:string;uid:number})=>e.name+" #"+e.uid).join(", "):"none"):
        "Native effects: select layer";
      node('[data-ui="inspector-masks"]').textContent=inspector?
        "Native masks: "+(inspector.masks.length?inspector.masks.map((m:{name:string;uid:number})=>m.name+" #"+m.uid).join(", "):"none"):
        "Native masks: select layer";
    }
    const layerSelected=selectedLayer!==null&&state.motion.layers.some(layer=>layer.id===selectedLayer);
    for(const action of ["motion-inspect","motion-transform","motion-key","motion-edit"]){
      const button=node<HTMLButtonElement>('[data-act="'+action+'"]');
      button.disabled=button.disabled||!layerSelected||(action!=="motion-inspect"&&!inspector);
    }
    refreshFrame(state);
    if(state.chat.length!==seenChat){
      seenChat=state.chat.length;
      const messages=node('[data-ui="chat"]');messages.replaceChildren();
      for(const m of state.chat){const p=document.createElement("p");p.textContent=m.text;p.className="su-"+m.role;messages.append(p);}
      messages.scrollTop=messages.scrollHeight;
    }
    const task=state.pendingApproval;
    node('[data-ui="approval"]').textContent=task?"Pending "+task.id+" · SHA "+task.expectedSha.slice(0,12):"No AI action pending";
    node<HTMLButtonElement>('[data-act="approve"]').hidden=!task;
    node<HTMLButtonElement>('[data-act="reject"]').hidden=!task;
  };
  const unsubscribe=ctrl.subscribe(render);
  const clip=()=>{if(selectedClip===null)throw Error("Select a real native clip first");return selectedClip;};
  const comp=()=>{const id=ctrl.getState().motion.composition?.id;
    if(!id)throw Error("Create or open a native composition first");return id as number;};
  async function execute(key:string):Promise<unknown>{
    switch(key){
      case "stop":return ctrl.stop();
      case "video-open":return ctrl.refreshVideo(s("root"),s("project"));
      case "video-new":return ctrl.applyVideo([{type:"createSequence",name:"Shuvi Sequence",width:1280,height:720,fps:30}]);
      case "video-import":return ctrl.importVideo(s("source"));
      case "video-place":{
        const project=ctrl.getState().video?.snapshot.project;
        const itemId=selectedNativeMedia(project,s("mediaId")).id,track=s("track");
        if(!/^[VA]([1-9]|1[0-6])$/.test(track))throw Error("Invalid FilmCraft track");
        const a:VideoAction={type:"place",itemId,track,seconds:n("videoTime"),video:track.startsWith("V"),audio:track.startsWith("A")};
        return ctrl.applyVideo([a]);
      }
      case "video-split":return ctrl.applyVideo([{type:"split",clipId:clip(),seconds:n("videoTime")}]);
      case "video-trim":return ctrl.applyVideo([{type:"trim",clipId:clip(),edge:"out",deltaFrames:n("trimFrames"),ripple:false}]);
      case "video-delete":return ctrl.applyVideo([{type:"delete",clipId:clip(),ripple:false}]);
      case "video-undo":return ctrl.history("undo");
      case "video-redo":return ctrl.history("redo");
      case "video-preview":return ctrl.renderVideo(n("videoTime"));
      case "video-export":return ctrl.exportVideo(s("output"));
      case "motion-status":return ctrl.motionStatus();
      case "motion-create":return ctrl.createComposition({name:s("compName"),width:n("width"),height:n("height"),fps:n("fps"),durationSeconds:n("duration")});
      case "motion-open":return ctrl.openMotion(s("motionRoot"),s("motionFile"));
      case "motion-save":return ctrl.saveMotion(s("motionRoot"),s("motionFile"));
      case "motion-text":return ctrl.editMotion({action:"addText",compId:comp(),name:"Shuvi Title",text:s("text"),x:120,y:120,size:48});
      case "motion-edit":{
        if(selectedLayer===null)throw Error("Select a real native text layer");return ctrl.editMotion({action:"editText",compId:comp(),layerId:selectedLayer,text:s("text")});
      }
      case "motion-inspect":{
        if(selectedLayer===null)throw Error("Select a real native layer");
        return ctrl.inspectMotionLayer(selectedLayer);
      }
      case "motion-transform":{
        if(selectedLayer===null)throw Error("Select a real native layer");
        const kind=s("transformKind");
        if(!["position","scale","rotation","opacity"].includes(kind))throw Error("Invalid transform");
        const request:Record<string,unknown>={action:"setTransform",compId:comp(),layerId:selectedLayer,kind};
        if(kind==="position"||kind==="scale"){
          if(!s("transformX")||!s("transformY")||!Number.isFinite(n("transformX"))||!Number.isFinite(n("transformY")))
            throw Error("Native position/scale needs two finite coordinates");
          request.x=n("transformX");request.y=n("transformY");
        }else{
          if(!s("transformValue")||!Number.isFinite(n("transformValue")))throw Error("Enter a finite native transform value");
          request.value=n("transformValue");
        }
        return ctrl.editMotion(request);
      }
      case "motion-key":{
        if(selectedLayer===null)throw Error("Select a real native layer");
        const property=s("keyProperty"),time=n("motionTime"),value=n("keyValue");
        if(!["opacity","rotation"].includes(property)||!Number.isFinite(time)||time<0||!s("keyValue")||!Number.isFinite(value))
          throw Error("Invalid native scalar keyframe");
        return ctrl.editMotion({action:"addKey",compId:comp(),layerId:selectedLayer,property,time,value});
      }
      case "motion-shape":{
        if(!s("shapeName")||!Number.isFinite(n("shapeW"))||!Number.isFinite(n("shapeH"))||
          n("shapeW")<=0||n("shapeH")<=0)throw Error("Invalid native shape dimensions");
        if(!["rect","ellipse","rounded","star","polygon"].includes(s("shapeKind")))throw Error("Unknown native shape");
        return ctrl.editMotion({action:"addShape",compId:comp(),name:s("shapeName"),kind:s("shapeKind"),
          x:120,y:120,width:n("shapeW"),height:n("shapeH"),fill:s("shapeFill")});
      }
      case "motion-render":return ctrl.renderMotion(n("motionTime"));
      case "motion-export":return ctrl.exportMotionPng(s("motionRoot"),s("png"),n("motionTime"));
      case "approve":{const pending=ctrl.getState().pendingApproval;if(!pending)throw Error("No pending owner permission");
        return ctrl.approveTask(pending.id);}
      case "reject":return ctrl.dismissTask();
      default:throw Error("Unsupported workspace command");
    }
  }
  const safe=(f:()=>Promise<unknown>)=>void f().catch(error=>{
    const box=node('[data-ui="error"]');box.textContent=error instanceof Error?error.message:String(error);box.hidden=false;
  });
  const onClick=(event:MouseEvent)=>{
    const t=event.target instanceof Element?event.target:null;if(!t)return;
    const tab=t.closest<HTMLButtonElement>("[data-tab]");
    if(tab){ctrl.selectStudio(tab.dataset.tab as "video"|"motion");return;}
    const c=t.closest<HTMLButtonElement>("[data-clip]");
    if(c){selectedClip=Number(c.dataset.clip);root.querySelectorAll("[data-clip]").forEach(el=>el.classList.toggle("selected",el===c));return;}
    const l=t.closest<HTMLButtonElement>("[data-layer]");
    if(l){selectedLayer=Number(l.dataset.layer);root.querySelectorAll("[data-layer]").forEach(el=>el.classList.toggle("selected",el===l));
      const id=selectedLayer;if(id!==null)safe(()=>ctrl.inspectMotionLayer(id));return;}
    const button=t.closest<HTMLButtonElement>("[data-act]");
    if(button&&!button.disabled)safe(()=>Promise.resolve(execute(button.dataset.act??"")));
  };
  const onSubmit=(event:Event)=>{
    if(event.target!==node('[data-ui="chatForm"]'))return;
    event.preventDefault();ctrl.addDraft(s("message"));f("message").value="";
  };
  const onKey=(event:KeyboardEvent)=>{
    if(ctrl.getState().studio!=="video"||!(event.ctrlKey||event.metaKey)||event.altKey)return;
    if(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)return;
    if(event.key.toLowerCase()==="z"||event.key.toLowerCase()==="y"){
      event.preventDefault();safe(()=>ctrl.history(event.key.toLowerCase()==="z"?"undo":"redo"));
    }
  };
  root.addEventListener("click",onClick);root.addEventListener("submit",onSubmit);root.addEventListener("keydown",onKey);
  return {controller:ctrl,dispose(){
    disposed=true;unsubscribe();clearFrame();root.removeEventListener("click",onClick);
    root.removeEventListener("submit",onSubmit);root.removeEventListener("keydown",onKey);
    root.replaceChildren();root.classList.remove("su");delete root.dataset.shuviWorkspace;
  }};
}
