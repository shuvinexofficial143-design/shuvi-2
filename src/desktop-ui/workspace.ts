/** One real Tauri-window workspace, no fake native actions or AI provider. */
import {createWorkspaceController,clipsFromSequence,type WorkspaceNative,type WorkspaceState,type VideoAction} from "../unified-workspace/core.mjs";
import {nativeWorkspaceBridge} from "../unified-workspace/native";
import {projectMediaItems,selectedNativeMedia} from "../unified-workspace/media.mjs";
import {nativeFps,moveDestination,visibleTimelineSeconds} from "../unified-workspace/timeline.mjs";
import {workspaceKeyCommand} from "../unified-workspace/keyboard.mjs";
import {createProjectSessionStore} from "../unified-workspace/session.mjs";
import {describeApprovalState} from "../unified-workspace/approval.mjs";
import {keyframeReadback} from "../unified-workspace/keyframes.mjs";
import {nativeDiagnosticText} from "../unified-workspace/diagnostics.mjs";
import {nativeClipInspector,timelineSeekFromX,splitPreflight} from "../unified-workspace/video-inspector.mjs";
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
    '<button data-act="video-verify">Verify disk checksum (read-only)</button>',
    '<button data-act="video-new">Create sequence</button>',
    '<label>Media source<input data-field="source"></label>',
    '<button data-act="video-import">Import real media</button>',
    '<label>Native media library<select data-field="mediaId"><option value="">Open project first</option></select></label>',
    '<label>Track<input data-field="track" value="V1"></label>',
    '<button data-act="video-place">Place on timeline</button></section>',
    '<section data-panel="motion" hidden>',
    '<button data-act="motion-status">Check EffectCraft engine</button>',
    '<button data-act="motion-verify">Verify worker revision (read-only)</button>',
    '<label>Composition<input data-field="compName" value="Shuvi Composition"></label>',
    '<div class="su-pair"><label>Width<input type="number" data-field="width" value="1280"></label>',
    '<label>Height<input type="number" data-field="height" value="720"></label></div>',
    '<div class="su-pair"><label>FPS<input type="number" data-field="fps" value="30"></label>',
    '<label>Duration<input type="number" data-field="duration" value="10"></label></div>',
    '<button data-act="motion-create">New composition</button>',
    '<label>Workspace folder<input data-field="motionRoot"></label>',
    '<label>Project .ecproj<input data-field="motionFile" value="shuvi.ecproj"></label>',
    '<button data-act="motion-open">Open project</button><button data-act="motion-save">Save project</button></section>',
    '<section class="su-session"><h3>Recent native project (this device only)</h3>',
    '<div data-ui="bookmark">No saved project reference</div>',
    '<div class="su-buttons"><button data-act="bookmark-remember">Remember verified project</button>',
    '<button data-act="bookmark-restore">Reopen saved project</button>',
    '<button data-act="bookmark-forget">Forget saved paths</button></div>',
    '<small>Only opt-in paths are saved, never edited content or AI approvals. Reopen always checks the real native file.</small>',
    '</section></aside>',
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
    '<h3>FilmCraft timeline · real drag/readback</h3>',
    '<div class="su-pair"><label>Timeline zoom <input type="range" data-field="timelineZoom" min="100" max="400" step="25" value="100" aria-label="Timeline zoom percent"></label>',
    '<span data-ui="zoom-label">100% · display only</span></div>',
    '<div class="su-pair"><label>Move selected to seconds<input data-field="moveTime" type="number" min="0" step=".04" value="0"></label>',
    '<label>Destination track<input data-field="moveTrack" value="V1"></label></div>',
    '<button data-act="video-move">Move selected clip (native)</button>',
    '<div data-ui="timeline-fps" class="su-native-meta">Native FPS not verified; drag disabled</div>',
    '<div data-ui="clips" class="su-timeline">Open project to read native clips</div>',
    '<h3>Selected FilmCraft clip (native readback)</h3>',
    '<div data-ui="clip-inspector" class="su-clip-inspector">Select a native timeline clip</div>',
    '<small>Click an empty timeline lane to seek and request a real FilmCraft frame. Zoom affects display only, never the saved project.</small>',
    '<small class="su-help">Select clip, or drag horizontally on the same native track. Keyboard: S split, Del delete, Ctrl+Z/Y history, ←/→ one frame.</small>',
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
    '<div data-ui="keyframe-readback" class="su-native-meta">Native keyframe count unavailable</div>',
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
    '<h3>Native effects · explicit layer selection</h3>',
    '<div data-ui="inspector-effects">Native effects: select layer</div>',
    '<label>Effect<select data-field="effectKind"><option value="gaussianBlur">Gaussian Blur</option><option value="brightnessContrast">Brightness / Contrast</option></select></label>',
    '<button data-act="motion-add-effect">Apply real native effect</button>',
    '<label>Native effect instance<select data-field="effectUid"><option value="">Select verified effect</option></select></label>',
    '<label>Parameter<select data-field="effectParam"><option value="blurriness">Blurriness</option><option value="brightness">Brightness</option><option value="contrast">Contrast</option></select></label>',
    '<label>Parameter value<input data-field="effectValue" type="number" step="any" value="20"></label>',
    '<div class="su-buttons"><button data-act="motion-set-effect">Set native parameter</button>',
    '<button data-act="motion-toggle-effect">Toggle native effect</button>',
    '<button data-act="motion-remove-effect">Remove native effect</button></div>',
    '<h3>Native keyframe easing</h3><label>Key times (seconds, comma-separated)<input data-field="easeTimes" value="0,1"></label>',
    '<button data-act="motion-ease">Easy Ease existing native keyframes</button>',
    '<h3>Native polygon mask</h3><div data-ui="inspector-masks">Native masks: select layer</div>',
    '<div class="su-pair"><label>Mask width<input data-field="maskW" type="number" value="160"></label>',
    '<label>Mask height<input data-field="maskH" type="number" value="90"></label></div>',
    '<button data-act="motion-add-mask">Add native closed polygon mask</button>',
    '<label>Native mask instance<select data-field="maskUid"><option value="">Select verified mask</option></select></label>',
    '<button data-act="motion-remove-mask">Remove selected native mask</button></section>',
    '<label>New PNG filename<input data-field="png" value="frame.png"></label>',
    '<button data-act="motion-export">Export PNG</button></section>',
    '<div class="su-progress" role="status"><span data-ui="progress">Idle</span>',
    '<button data-act="stop" disabled>Stop (request)</button></div>',
    '<div class="su-error" data-ui="error" role="alert" hidden></div>',
    '<details class="su-diagnostics"><summary>Native evidence & recovery diagnostics</summary>',
    '<p>Evidence reflects this UI session only. No Windows installer or AI task guard verification is claimed.</p>',
    '<div class="su-buttons"><button data-act="diagnostic-copy">Copy native evidence JSON</button></div>',
    '<pre data-ui="diagnostic-report" aria-live="off">No native verification yet</pre>',
    '</details></main>',
    '<aside class="su-chat"><h2>Shuvi AI Chat</h2>',
    '<label>Chat panel width<input data-field="chatWidth" type="range" min="240" max="420" step="10" value="310" aria-label="Adjust chat panel width"></label>',
    '<small>AI Director not connected — drafts only</small>',
    '<div data-ui="chat" class="su-thread"></div><form data-ui="chatForm">',
    '<label>Message<textarea data-field="message" rows="3"></textarea></label>',
    '<button type="submit">Save draft</button></form>',
    '<h3>Permission & approval</h3><p data-ui="approval">AI Director not connected</p>',
    '<small data-ui="approval-diagnostic">No native AI execution gateway is registered</small>',
    '<div class="su-buttons"><button data-act="approve" hidden>Approve once</button>',
    '<button data-act="reject" hidden>Reject</button></div>',
    '<small>Manual and approved AI edits use the same native project. No silent execution.</small>',
    '</aside></div></div>'
  ].join("");
  const ctrl=createWorkspaceController(bridge);
  const projectBookmarks=(()=>{
    try {return createProjectSessionStore(window.localStorage);}
    catch{return null;}
  })();
  let verifiedMotionDisk:{workspace:string;basename:string}|null=null;
  let bookmarkMessage="";
  const node=<T extends HTMLElement>(selector:string):T=>{
    const result=root.querySelector<T>(selector);
    if(!result)throw Error("Missing unified UI: "+selector);
    return result;
  };
  const f=(name:string)=>node<HTMLInputElement>('[data-field="'+name+'"]');
  const s=(name:string)=>f(name).value.trim();
  const n=(name:string)=>Number(s(name));
  let selectedClip:number|null=null,selectedLayer:number|null=null,seenVideo:string|null=null,seenLayers:string|null=null;
  let seenVideoGeneration=-1,seenMotionGeneration=-1;
  let priorFrameKey="",objectUrl:string|null=null,seenChat=-1,seenInspectorKey="",disposed=false;
  let drag:{pointerId:number;clipId:number;startX:number;track:string;start:number;duration:number;sha:string;lane:HTMLElement}|null=null;
  let skipClipClick=false;
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
  const showSelectedClip=(state:WorkspaceState)=>{
    const selected=selectedClip===null?null:nativeClipInspector(state,selectedClip);
    const view=node('[data-ui="clip-inspector"]');
    if(!selected){view.textContent="Select a native timeline clip";return;}
    const fnum=(value:number)=>value.toFixed(3)+"s";
    view.textContent="#"+selected.clipId+" · "+selected.name+" · "+selected.kind.toUpperCase()+
      " · media #"+selected.itemId+" · "+selected.track+
      " · "+fnum(selected.start)+"–"+fnum(selected.end)+
      " · duration "+fnum(selected.duration)+
      (selected.sourceStartFrame!==null?" · source frame "+selected.sourceStartFrame:"")+
      (selected.sourceDurationFrames!==null?" · "+selected.sourceDurationFrames+" source frames":"")+
      (selected.locked?" · NATIVE TRACK LOCKED":"")+
      (selected.fps===null?" · FPS unavailable":" · "+selected.fps.toFixed(3)+" FPS");
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
    node('[data-ui="diagnostic-report"]').textContent=nativeDiagnosticText(state);
    if(state.videoGeneration!==seenVideoGeneration){
      seenVideoGeneration=state.videoGeneration;
      selectedClip=null;seenVideo=null;
    }
    if(state.motionGeneration!==seenMotionGeneration){
      seenMotionGeneration=state.motionGeneration;
      selectedLayer=null;seenLayers=null;seenInspectorKey="";
    }
    const remembered=projectBookmarks?.load();
    node('[data-ui="bookmark"]').textContent=bookmarkMessage||
      (remembered?
        "Saved references: "+[remembered.video?"Video":"",remembered.motion?"Motion":""].filter(Boolean).join(" + ")+
        " (reopen requires native inspection)":
        projectBookmarks?"No saved project reference":"Local project storage unavailable");
    node('[data-ui="error"]').textContent=state.error??"";
    node('[data-ui="error"]').hidden=!state.error;
    root.querySelectorAll<HTMLButtonElement>("[data-act]").forEach(button=>{
      const key=button.dataset.act??"";
      if(key==="stop")button.disabled=!state.busy;
      else if(key==="approve"||key==="reject")button.disabled=state.busy;
      else button.disabled=state.busy||
        (state.needsReload&&state.recoveryStudio===state.studio&&!["video-open","motion-status","motion-open","diagnostic-copy","bookmark-forget"].includes(key))||
        (key==="video-verify"&&!state.video)||
        (key==="motion-verify"&&!state.motion.ready);
    });
    const zoom=Math.max(100,Math.min(400,Number(s("timelineZoom"))||100));
    node('[data-ui="zoom-label"]').textContent=zoom+"% · display only";
    const videoKey=state.video?state.video.projectPath+":"+state.video.snapshot.projectSha256+":"+zoom:null;
    if(videoKey!==seenVideo){
      seenVideo=videoKey;
      const timeline=node('[data-ui="clips"]');timeline.replaceChildren();
      const clips=clipsFromSequence(state.video?.snapshot.sequence);
      if(!clips.some(c=>c.clipId===selectedClip))selectedClip=null;
      const media=node<HTMLSelectElement>('[data-field="mediaId"]');
      const previouslySelected=media.value;media.replaceChildren();
      const empty=document.createElement("option");empty.value="";empty.textContent="Select imported media";media.append(empty);
      for(const item of projectMediaItems(state.video?.snapshot.project)){
        const option=document.createElement("option");option.value=String(item.id);
        option.textContent=(item.location?item.location+" / ":"")+item.name+" (#"+item.id+")";media.append(option);
      }
      if([...media.options].some(option=>option.value===previouslySelected))media.value=previouslySelected;
      const fps=nativeFps(state.video?.snapshot.sequence);
      const visible=visibleTimelineSeconds(state.video?.snapshot.sequence,clips);
      node('[data-ui="timeline-fps"]').textContent=fps===null?
        "Native FPS unavailable; timeline drag is disabled":
        "FilmCraft "+fps.toFixed(3)+" FPS · "+visible.toFixed(2)+" seconds visible";
      if(!clips.length)timeline.textContent="No real FilmCraft clips";
      const tracks=[...new Set(clips.map(c=>c.track))].sort((x,y)=>x.localeCompare(y,undefined,{numeric:true}));
      for(const track of tracks){
        const row=document.createElement("div");row.className="su-timeline-row";
        row.style.minWidth=Math.round(Math.max(390,600*zoom/100))+"px";
        const kind=track.startsWith("V")?"video":"audio";
        const laneNumber=Number(track.slice(1))-1;
        const nativeLane=state.video?.snapshot.sequence?.[kind]?.[laneNumber];
        const locked=nativeLane?.locked===true;
        const label=document.createElement("span");label.className="su-track-name";
        label.textContent=track+(locked?" 🔒":"");
        const lane=document.createElement("div");lane.className="su-lane";lane.dataset.track=track;
        for(const clip of clips.filter(c=>c.track===track)){
          const button=document.createElement("button");button.type="button";
          button.dataset.clip=String(clip.clipId);button.dataset.track=clip.track;
          button.style.left=(100*Math.max(0,clip.start)/visible)+"%";
          button.style.width="max(3.5rem,"+(100*Math.max(0,clip.duration)/visible)+"%)";
          button.title=clip.name+" · "+clip.start.toFixed(3)+"s · "+clip.duration.toFixed(3)+"s";
          button.textContent=clip.name+" · "+clip.start.toFixed(2)+"s";
          button.draggable=false;
          button.classList.toggle("selected",clip.clipId===selectedClip);
          if(fps===null||locked)button.dataset.dragDisabled="true";
          lane.append(button);
        }
        row.append(label,lane);timeline.append(row);
      }
    }
    showSelectedClip(state);
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
      node('[data-ui="keyframe-readback"]').textContent=keyframeReadback(inspector?.layer).label;
      const effectSelect=node<HTMLSelectElement>('[data-field="effectUid"]');
      const oldEffect=effectSelect.value;effectSelect.replaceChildren();
      const noEffect=document.createElement("option");noEffect.value="";noEffect.textContent="Select native effect";effectSelect.append(noEffect);
      for(const effect of inspector?.effects??[]){
        const option=document.createElement("option");option.value=String(effect.uid);
        option.textContent=effect.name+" · #"+effect.uid+(effect.enabled?" on":" off");effectSelect.append(option);
      }
      if([...effectSelect.options].some(option=>option.value===oldEffect))effectSelect.value=oldEffect;
      const maskSelect=node<HTMLSelectElement>('[data-field="maskUid"]');
      const oldMask=maskSelect.value;maskSelect.replaceChildren();
      const noMask=document.createElement("option");noMask.value="";noMask.textContent="Select native mask";maskSelect.append(noMask);
      for(const mask of inspector?.masks??[]){
        const option=document.createElement("option");option.value=String(mask.uid);
        option.textContent=mask.name+" · #"+mask.uid;maskSelect.append(option);
      }
      if([...maskSelect.options].some(option=>option.value===oldMask))maskSelect.value=oldMask;
      node('[data-ui="inspector-effects"]').textContent=inspector?
        "Native effects: "+(inspector.effects.length?inspector.effects.map((e:{name:string;uid:number})=>e.name+" #"+e.uid).join(", "):"none"):
        "Native effects: select layer";
      node('[data-ui="inspector-masks"]').textContent=inspector?
        "Native masks: "+(inspector.masks.length?inspector.masks.map((m:{name:string;uid:number})=>m.name+" #"+m.uid).join(", "):"none"):
        "Native masks: select layer";
    }
    const layerSelected=selectedLayer!==null&&state.motion.layers.some(layer=>layer.id===selectedLayer);
    for(const action of ["motion-inspect","motion-transform","motion-key","motion-edit",
      "motion-add-effect","motion-set-effect","motion-toggle-effect","motion-remove-effect",
      "motion-ease","motion-add-mask","motion-remove-mask"]){
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
    const permission=describeApprovalState(state);
    node('[data-ui="approval"]').textContent=task?
      "Pending "+task.id+" · SHA "+task.expectedSha.slice(0,12)+" · "+
      (task.actions?.length??0)+" proposed actions":"No AI action pending";
    node('[data-ui="approval-diagnostic"]').textContent=permission.reason+
      " · Native AI task guard not connected";
    node<HTMLButtonElement>('[data-act="approve"]').hidden=!task;
    node<HTMLButtonElement>('[data-act="approve"]').disabled=state.busy||!permission.eligible;
    node<HTMLButtonElement>('[data-act="reject"]').hidden=!task;
  };
  const unsubscribe=ctrl.subscribe(render);
  const clip=()=>{if(selectedClip===null)throw Error("Select a real native clip first");return selectedClip;};
  const comp=()=>{const id=ctrl.getState().motion.composition?.id;
    if(!id)throw Error("Create or open a native composition first");return id as number;};
  const layer=()=>{if(selectedLayer===null)throw Error("Select a real native layer first");return selectedLayer;};
  const selectedEffect=()=>{
    const selected=s("effectUid");
    const fx=ctrl.getState().motion.inspector?.effects.find((e:{uid:number})=>String(e.uid)===selected);
    if(!fx)throw Error("Select a verified native effect instance");
    return fx as {uid:number;id:string;name:string;enabled:boolean};
  };
  async function execute(key:string):Promise<unknown>{
    switch(key){
      case "stop":return ctrl.stop();
      case "video-open":return ctrl.refreshVideo(s("root"),s("project"));
      case "video-verify":return ctrl.verifyVideoSnapshot();
      case "diagnostic-copy":{
        if(!navigator.clipboard?.writeText)throw Error("System clipboard is unavailable in this host");
        return navigator.clipboard.writeText(nativeDiagnosticText(ctrl.getState()));
      }
      case "bookmark-remember":{
        if(!projectBookmarks)throw Error("On-device project bookmarks are unavailable");
        const state=ctrl.getState();
        if(state.busy||state.needsReload&&state.recoveryStudio===state.studio)
          throw Error("Native state must be verified before saving a bookmark");
        if(state.studio==="video"){
          if(!state.video)throw Error("Open a real FilmCraft project before remembering its path");
          projectBookmarks.rememberVideo(state.video.root,state.video.projectPath);
        }else{
          if(!state.motion.ready||!verifiedMotionDisk)throw Error("Native Motion project must be saved or opened first");
          projectBookmarks.rememberMotion(verifiedMotionDisk.workspace,verifiedMotionDisk.basename);
        }
        bookmarkMessage="Native project path bookmarked on this device — project not copied";
        render(ctrl.getState());return true;
      }
      case "bookmark-restore":{
        if(!projectBookmarks)throw Error("On-device project bookmarks are unavailable");
        const saved=projectBookmarks.load(),studio=ctrl.getState().studio;
        if(studio==="video"){
          if(!saved?.video)throw Error("No saved Video project reference");
          f("root").value=saved.video.root;f("project").value=saved.video.projectPath;
          const receipt=await ctrl.refreshVideo(saved.video.root,saved.video.projectPath);
          bookmarkMessage="FilmCraft project reopened and native readback verified";
          render(ctrl.getState());return receipt;
        }
        if(!saved?.motion)throw Error("No saved Motion project reference");
        f("motionRoot").value=saved.motion.workspace;f("motionFile").value=saved.motion.basename;
        const receipt=await ctrl.openMotion(saved.motion.workspace,saved.motion.basename);
        verifiedMotionDisk={workspace:saved.motion.workspace,basename:saved.motion.basename};
        bookmarkMessage="EffectCraft project reopened from native disk";
        render(ctrl.getState());return receipt;
      }
      case "bookmark-forget":{
        if(!projectBookmarks)throw Error("On-device project bookmarks are unavailable");
        projectBookmarks.forget();bookmarkMessage="Saved project references forgotten; native files unchanged";
        render(ctrl.getState());return true;
      }
      case "video-new":return ctrl.applyVideo([{type:"createSequence",name:"Shuvi Sequence",width:1280,height:720,fps:30}]);
      case "video-import":return ctrl.importVideo(s("source"));
      case "video-place":{
        const project=ctrl.getState().video?.snapshot.project;
        const itemId=selectedNativeMedia(project,s("mediaId")).id,track=s("track");
        if(!/^[VA]([1-9]|1[0-6])$/.test(track))throw Error("Invalid FilmCraft track");
        const a:VideoAction={type:"place",itemId,track,seconds:n("videoTime"),video:track.startsWith("V"),audio:track.startsWith("A")};
        return ctrl.applyVideo([a]);
      }
      case "video-move":{
        if(!s("moveTime")||!Number.isFinite(n("moveTime")))throw Error("Enter a finite native move time");
        return ctrl.moveVideoClip(clip(),s("moveTrack").toUpperCase(),n("moveTime"));
      }
      case "video-split":{
        if(!s("videoTime")||!Number.isFinite(n("videoTime")))throw Error("Enter a finite FilmCraft playhead time");
        const valid=splitPreflight(nativeClipInspector(ctrl.getState(),clip()),n("videoTime"));
        if(!valid.ok)throw Error(valid.reason);
        return ctrl.splitVideoClip(clip(),valid.seconds);
      }
      case "video-trim":return ctrl.applyVideo([{type:"trim",clipId:clip(),edge:"out",deltaFrames:n("trimFrames"),ripple:false}]);
      case "video-delete":return ctrl.applyVideo([{type:"delete",clipId:clip(),ripple:false}]);
      case "video-undo":return ctrl.history("undo");
      case "video-redo":return ctrl.history("redo");
      case "video-preview":return ctrl.renderVideo(n("videoTime"));
      case "video-export":return ctrl.exportVideo(s("output"));
      case "motion-status":return ctrl.motionStatus();
      case "motion-verify":return ctrl.verifyMotionSnapshot();
      case "motion-create":{
        const r=await ctrl.createComposition({name:s("compName"),width:n("width"),height:n("height"),fps:n("fps"),durationSeconds:n("duration")});
        verifiedMotionDisk=null;return r;
      }
      case "motion-open":{
        const r=await ctrl.openMotion(s("motionRoot"),s("motionFile"));
        verifiedMotionDisk={workspace:s("motionRoot"),basename:s("motionFile")};return r;
      }
      case "motion-save":{
        const r=await ctrl.saveMotion(s("motionRoot"),s("motionFile"));
        verifiedMotionDisk={workspace:s("motionRoot"),basename:s("motionFile")};return r;
      }
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
      case "motion-add-effect":return ctrl.editMotion({action:"addEffect",compId:comp(),layerId:layer(),effect:s("effectKind")});
      case "motion-set-effect":{
        const fx=selectedEffect(),kind=fx.id==="ec.blur.gaussian"?"gaussianBlur":
          fx.id==="ec.color.brightnesscontrast"?"brightnessContrast":null;
        if(!kind)throw Error("Selected native effect is not allowlisted");
        const parameter=s("effectParam");
        if((kind==="gaussianBlur"&&parameter!=="blurriness")||
          (kind==="brightnessContrast"&&!["brightness","contrast"].includes(parameter)))
          throw Error("Effect parameter and native effect kind do not match");
        if(!s("effectValue")||!Number.isFinite(n("effectValue")))throw Error("Finite native effect value required");
        return ctrl.editMotion({action:"setEffectParameter",compId:comp(),layerId:layer(),uid:fx.uid,
          effect:kind,parameter,value:n("effectValue")});
      }
      case "motion-toggle-effect":{
        const fx=selectedEffect();return ctrl.editMotion({action:"toggleEffect",compId:comp(),
          layerId:layer(),uid:fx.uid,enabled:!fx.enabled});
      }
      case "motion-remove-effect":{
        const fx=selectedEffect();return ctrl.editMotion({action:"removeEffect",compId:comp(),
          layerId:layer(),uid:fx.uid});
      }
      case "motion-ease":{
        const times=s("easeTimes").split(",").map(x=>Number(x.trim()));
        if(times.length<2||times.some(x=>!Number.isFinite(x)||x<0)||new Set(times).size!==times.length)
          throw Error("Provide two or more unique finite native keyframe times");
        return ctrl.editMotion({action:"easeKeys",compId:comp(),layerId:layer(),
          property:s("keyProperty"),times});
      }
      case "motion-add-mask":{
        const width=n("maskW"),height=n("maskH");
        if(!s("maskW")||!s("maskH")||![width,height].every(Number.isFinite)||
          width<4||height<4||width>8192||height>8192)throw Error("Invalid native polygon mask size");
        return ctrl.editMotion({action:"addPolygonMask",compId:comp(),layerId:layer(),
          vertices:[[-width/2,-height/2],[width/2,-height/2],[width/2,height/2],[-width/2,height/2]]});
      }
      case "motion-remove-mask":{
        const id=s("maskUid");
        const mask=ctrl.getState().motion.inspector?.masks.find((x:{uid:number})=>String(x.uid)===id);
        if(!mask)throw Error("Select a verified native mask");
        return ctrl.editMotion({action:"removeMask",compId:comp(),layerId:layer(),uid:mask.uid});
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
    if(c){
      if(skipClipClick){skipClipClick=false;return;}
      selectedClip=Number(c.dataset.clip);
      const clipState=ctrl.getState().video?.clips.find((v:{clipId:number})=>v.clipId===selectedClip);
      if(clipState){
        f("moveTrack").value=clipState.track;
        f("track").value=clipState.track;
        f("moveTime").value=String(clipState.start);
      }
      root.querySelectorAll("[data-clip]").forEach(el=>el.classList.toggle("selected",el===c));
      showSelectedClip(ctrl.getState());
      return;
    }
    const lane=t.closest<HTMLElement>(".su-lane");
    if(lane&&ctrl.getState().studio==="video"&&!ctrl.getState().busy){
      const snapshot=ctrl.getState(),v=snapshot.video;
      if(!v||snapshot.needsReload&&snapshot.recoveryStudio==="video")return;
      const rect=lane.getBoundingClientRect();
      const seconds=timelineSeekFromX({clientX:event.clientX,laneLeft:rect.left,laneWidth:rect.width,
        sequence:v.snapshot.sequence,clips:v.clips});
      if(seconds===null){
        safe(async()=>{throw Error("Native FilmCraft FPS unavailable; seek disabled");});
        return;
      }
      f("videoTime").value=String(seconds);
      safe(()=>ctrl.renderVideo(seconds));return;
    }
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
  // Pointer drag uses native sequence geometry; no visual move until FilmCraft
  // saves and a second project snapshot confirms frame-accurate placement.
  const onPointerDown=(event:PointerEvent)=>{
    if(event.button!==0||!event.isPrimary||ctrl.getState().busy)return;
    const t=event.target instanceof Element?event.target:null;
    const button=t?.closest<HTMLButtonElement>("[data-clip]");
    if(!button||button.dataset.dragDisabled==="true")return;
    const state=ctrl.getState();
    if(state.studio!=="video"||!state.video||state.needsReload&&state.recoveryStudio==="video")return;
    const id=Number(button.dataset.clip);
    const clip=state.video.clips.find((c:{clipId:number})=>c.clipId===id);
    const lane=button.closest<HTMLElement>(".su-lane");
    if(!clip||!lane)return;
    drag={pointerId:event.pointerId,clipId:id,startX:event.clientX,track:clip.track,
      start:clip.start,duration:clip.duration,sha:state.video.snapshot.projectSha256,lane};
    if(typeof root.setPointerCapture==="function")root.setPointerCapture(event.pointerId);
  };
  const onPointerUp=(event:PointerEvent)=>{
    const gesture=drag;
    if(!gesture||event.pointerId!==gesture.pointerId)return;
    drag=null;
    if(typeof root.hasPointerCapture==="function"&&root.hasPointerCapture(event.pointerId))
      root.releasePointerCapture(event.pointerId);
    if(Math.abs(event.clientX-gesture.startX)<5)return;
    skipClipClick=true;
    // Native pointer capture can retarget the browser's synthetic click to the root.
    // Never accidentally suppress the user's following deliberate clip selection.
    setTimeout(()=>{skipClipClick=false;},0);
    const state=ctrl.getState(),v=state.video;
    if(state.studio!=="video"||!v||state.busy||state.needsReload&&state.recoveryStudio==="video")return;
    const actual=v.clips.find((c:{clipId:number})=>c.clipId===gesture.clipId);
    if(!actual||v.snapshot.projectSha256!==gesture.sha||
      actual.track!==gesture.track||actual.start!==gesture.start){
      safe(async()=>{throw Error("Timeline changed during drag; refresh the native project");});
      return;
    }
    const fps=nativeFps(v.snapshot.sequence);
    if(fps===null){
      safe(async()=>{throw Error("Native sequence FPS unavailable; drag disabled");});
      return;
    }
    const seconds=moveDestination({start:gesture.start,
      deltaX:event.clientX-gesture.startX,laneWidth:gesture.lane.getBoundingClientRect().width,
      visibleSeconds:visibleTimelineSeconds(v.snapshot.sequence,v.clips),duration:gesture.duration,fps});
    if(seconds===null){
      safe(async()=>{throw Error("Invalid drag geometry; no native edit submitted");});
      return;
    }
    selectedClip=gesture.clipId;
    f("moveTrack").value=gesture.track;f("moveTime").value=String(seconds);
    safe(()=>ctrl.moveVideoClip(gesture.clipId,gesture.track,seconds));
  };
  const onPointerCancel=()=>{drag=null;};
  const onKey=(event:KeyboardEvent)=>{
    const target=event.target;
    const editable=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||
      target instanceof HTMLSelectElement||(target instanceof HTMLElement&&target.isContentEditable);
    const state=ctrl.getState();
    const command=workspaceKeyCommand({key:event.key,ctrlKey:event.ctrlKey,metaKey:event.metaKey,
      altKey:event.altKey,shiftKey:event.shiftKey,editable,studio:state.studio,
      selectedClip:selectedClip!==null});
    if(!command||state.busy||state.needsReload&&state.recoveryStudio==="video")return;
    event.preventDefault();
    if(command==="undo"||command==="redo"){safe(()=>ctrl.history(command));return;}
    if(command==="split"||command==="delete"){
      if(selectedClip===null)return;
      const id=selectedClip;
      safe(()=>command==="split"?
        ctrl.splitVideoClip(id,n("videoTime")):
        ctrl.applyVideo([{type:"delete",clipId:id,ripple:false}]));
      return;
    }
    const fps=nativeFps(state.video?.snapshot.sequence);
    if(!fps)return;
    const step=command==="frame-forward"?1:-1;
    const current=Number(f("videoTime").value);
    if(!Number.isFinite(current)||current<0)return;
    const max=visibleTimelineSeconds(state.video?.snapshot.sequence,state.video?.clips??[]);
    const next=Math.max(0,Math.min(max,(Math.round(current*fps)+step)/fps));
    f("videoTime").value=String(next);
    if(state.video)safe(()=>ctrl.renderVideo(next));
  };
  const onInput=(event:Event)=>{
    const target=event.target;
    if(!(target instanceof HTMLInputElement))return;
    if(target.dataset.field==="chatWidth"){
      const width=Number(target.value);
      if(!Number.isFinite(width))return;
      root.style.setProperty("--chat-width",Math.max(240,Math.min(420,width))+"px");
    }else if(target.dataset.field==="timelineZoom"){
      if(!Number.isFinite(Number(target.value)))return;
      render(ctrl.getState());
    }
  };
  root.addEventListener("click",onClick);
  root.addEventListener("input",onInput);
  root.addEventListener("submit",onSubmit);root.addEventListener("keydown",onKey);
  root.addEventListener("pointerdown",onPointerDown);root.addEventListener("pointerup",onPointerUp);
  root.addEventListener("pointercancel",onPointerCancel);
  return {controller:ctrl,dispose(){
    disposed=true;unsubscribe();clearFrame();root.removeEventListener("click",onClick);
    root.removeEventListener("input",onInput);
    root.removeEventListener("submit",onSubmit);root.removeEventListener("keydown",onKey);
    root.removeEventListener("pointerdown",onPointerDown);root.removeEventListener("pointerup",onPointerUp);
    root.removeEventListener("pointercancel",onPointerCancel);
    root.replaceChildren();root.classList.remove("su");
    root.style.removeProperty("--chat-width");delete root.dataset.shuviWorkspace;
  }};
}
