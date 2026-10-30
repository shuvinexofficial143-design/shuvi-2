/** One real Tauri-window workspace, no fake native actions or AI provider. */
import {createWorkspaceController,clipsFromSequence,type WorkspaceNative,type WorkspaceState,type VideoAction} from "../unified-workspace/core.mjs";
import {nativeWorkspaceBridge} from "../unified-workspace/native";
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
    '<label>Imported media ID<input type="number" min="1" data-field="mediaId"></label>',
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
  let selectedClip:number|null=null,selectedLayer:number|null=null,seenVideo:unknown=null,seenLayers:unknown=null;
  let priorFrame:unknown=null,priorStudio="",objectUrl:string|null=null,seenChat=-1,disposed=false;
  const frame=node<HTMLImageElement>('[data-ui="frame"]');
  const clearFrame=()=>{
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}
    frame.hidden=true;frame.removeAttribute("src");node('[data-ui="noFrame"]').hidden=false;
  };
  const refreshFrame=(state:WorkspaceState)=>{
    const receipt=state.studio==="video"?state.videoFrame:state.motion.frame;
    if(receipt===priorFrame&&priorStudio===state.studio)return;
    priorFrame=receipt;priorStudio=state.studio;clearFrame();
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
    node('[data-ui="health"]').textContent=state.needsReload?"Native refresh required":state.busy?"Native operation running":
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
      else button.disabled=state.busy||(state.needsReload&&!["video-open","motion-status","motion-open"].includes(key));
    });
    if(state.video?.snapshot!==seenVideo){
      seenVideo=state.video?.snapshot??null;selectedClip=null;
      const timeline=node('[data-ui="clips"]');timeline.replaceChildren();
      const clips=clipsFromSequence(state.video?.snapshot.sequence);
      if(!clips.length)timeline.textContent="No real FilmCraft clips";
      for(const c of clips){const button=document.createElement("button");button.type="button";
        button.dataset.clip=String(c.clipId);button.textContent=c.track+" · "+c.name+" · "+c.start.toFixed(2)+"s";timeline.append(button);}
    }
    if(state.motion.layers!==seenLayers){
      seenLayers=state.motion.layers;selectedLayer=null;
      const layers=node('[data-ui="layers"]');layers.replaceChildren();
      if(!state.motion.layers.length)layers.textContent="No native layers";
      for(const layer of state.motion.layers){const button=document.createElement("button");button.type="button";
        button.dataset.layer=String(layer.id);button.textContent="#"+layer.id+" · "+layer.kind+" · "+layer.name;layers.append(button);}
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
        const itemId=n("mediaId"),track=s("track");
        if(!Number.isSafeInteger(itemId)||itemId<1)throw Error("Enter a real imported media ID");
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
    if(l){selectedLayer=Number(l.dataset.layer);root.querySelectorAll("[data-layer]").forEach(el=>el.classList.toggle("selected",el===l));return;}
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
