import "./view.css";
import { createPreviewCoordinator } from "./scrub.mjs";
import { open, save } from "@tauri-apps/plugin-dialog";
import { probeVideoEngine } from "./engine";
import { inspectVideoProject, type VideoProjectSnapshot } from "./snapshot";
import { importVideoMedia } from "./media";
import { editVideoTimeline, type TimelineAction } from "./timeline";
import { renderVideoPreview, applyPreviewToImage } from "./preview";
import { exportVideoMp4 } from "./export";
import { inspectVideoHistory, restoreVideoHistory, type VideoHistoryStatus } from "./history";
import { mediaItems, timelineClips, sequenceDuration, sequenceFps, formatTimecode, localWindowsPath, requireNumber, type EditorClip } from "./model.mjs";

/** The FilmCraft UI is owned by Video Studio. No Motion Studio DOM is removed. */
export function mountVideoStudio(): { setActive(active:boolean):void } {
  const preview=document.querySelector<HTMLElement>(".preview");
  const timeline=document.querySelector<HTMLElement>(".timeline");
  if(!preview||!timeline)throw Error("Missing Shuvi Studio mount");
  const oldPreview=Array.from(preview.children).filter((n):n is HTMLElement=>n instanceof HTMLElement);
  const oldTimeline=Array.from(timeline.children).filter((n):n is HTMLElement=>n instanceof HTMLElement);
  const initialChat=document.querySelector<HTMLElement>("#chat-thread .message.assistant");
  const initialChatText=initialChat?.textContent??"";
  const panel=document.createElement("section");
  panel.className="v-editor";
  panel.innerHTML=String.raw`
    <div class="v-head"><strong>FilmCraft · Native Video Studio</strong><span data-v="health">Open a project</span></div>
    <div class="v-paths">
      <label>Selected folder (absolute path)<input data-v="root" placeholder="C:\Videos\Project"></label>
      <label>FilmCraft project (.fcproj)<input data-v="project" placeholder="C:\Videos\Project\edit.fcproj"></label>
      <label>Import media (MP4/MOV/WAV)<input data-v="source" placeholder="C:\Videos\Project\clip.mp4"></label>
      <label>Export MP4 (new filename)<input data-v="output" placeholder="C:\Videos\Project\final.mp4"></label>
    </div>
    <div class="v-choose">
      <button data-choose="folder">Browse Folder</button>
      <button data-choose="project">Open .fcproj</button>
      <button data-choose="newProject">New Project Path</button>
      <button data-choose="source">Browse Media</button>
      <button data-choose="output">Save MP4 As</button>
    </div>
    <div class="v-actions"><button data-action="probe">Verify Engine</button><button data-action="open">Open / Refresh</button><button data-action="import">Import Media</button><button data-action="sequence">Create Sequence</button><button data-action="preview">Render Frame</button><button data-action="export">Export MP4</button></div>
    <div class="v-middle">
      <div class="v-monitor"><img data-v="image" alt="Real FilmCraft Program frame" hidden><span data-v="empty">Frame preview pending · click Render Frame after placing footage</span></div>
      <div class="v-options">
        <label>Imported media<select data-v="media"><option value="">Import first</option></select></label>
        <label>Sequence Width<input data-v="width" type="number" value="1280" step="1" min="16" max="7680"></label>
        <label>Sequence Height<input data-v="height" type="number" value="720" step="1" min="16" max="4320"></label>
        <label>Sequence FPS<input data-v="fps" type="number" value="30" step="1" min="1" max="120"></label>
        <label>Playhead seconds<input data-v="seconds" type="number" value="0.25" step=".04" min="0" max="86400"></label>
        <div class="v-scrub">
          <label for="v-scrub-slider">Frame Scrubber · drag to inspect real frames</label>
          <input id="v-scrub-slider" data-v="scrub" type="range" min="0" max="1" value="0" step="any" disabled>
          <span data-v="scrubLabel">00:00:00.000</span>
          <div class="v-play-tools">
            <button type="button" data-preview-control="back">−1 Frame</button>
            <button type="button" data-preview-control="toggle">Play Sampled Frames (≤2 FPS)</button>
            <button type="button" data-preview-control="forward">+1 Frame</button>
          </div>
        </div>
        <label>Track (V1 / A1)<input data-v="track" value="V1"></label>
        <label>Frame preview scale<select data-v="previewScale"><option value="0.25">25% (faster)</option><option value="0.5">50% (clearer)</option></select></label>
        <label>Export scale<select data-v="exportScale"><option value="1">100% original sequence</option><option value="0.5">50% (faster)</option><option value="0.25">25% (small)</option></select></label>
        <label class="v-inline"><input data-v="audio" type="checkbox" checked> Include audio in export</label>
        <label>Trim frames (+/-)<input data-v="frames" type="number" value="-3" step="1"></label>
        <label>Trim edge<select data-v="edge"><option value="out">Out</option><option value="in">In</option></select></label>
        <label class="v-inline"><input data-v="ripple" type="checkbox"> Ripple edit</label>
        <small data-v="meta">No real FilmCraft project loaded</small>
      </div>
    </div>
    <div class="v-message" data-v="status" role="status" aria-live="polite">Use real files under the selected folder. No demo media is generated.</div>
  `;
  const lane=document.createElement("section");
  lane.className="v-lanes";
  lane.innerHTML=String.raw`
    <div class="v-head"><strong>Native Timeline</strong><span data-v="duration">00:00:00.000</span></div>
    <div data-v="tracks" class="v-tracks">Open a project to load FilmCraft sequence tracks.</div>
    <div data-v="selected" class="v-muted">Click a clip to select it.</div>
    <div class="v-actions"><button data-action="place">Place Media</button><button data-action="split">Split</button><button data-action="trim">Trim</button><button data-action="move">Move</button><button data-action="delete">Delete</button>
    <button data-action="undo">Undo Last Edit</button><button data-action="redo">Redo Edit</button></div>
    <div class="v-muted" data-v="history">Cross-session FilmCraft project history is being inspected.</div>
  `;
  preview.append(panel);timeline.append(lane);
  let snapshot:VideoProjectSnapshot|null=null;
  let itemId:number|null=null,clipId:number|null=null;
  let clips:EditorClip[]=[];
  let history:VideoHistoryStatus|null=null;
  let busy=false,active=true;
  let disposeFrame:(()=>void)|null=null;
  let sampledPlayback=false;
  let playbackTimeout:ReturnType<typeof setTimeout>|null=null;
  function stopSampledPlayback(invalidate=false):void {
    sampledPlayback=false;
    if(playbackTimeout!==null){clearTimeout(playbackTimeout);playbackTimeout=null;}
    if(invalidate)scrubber.invalidate();
    const toggle=panel.querySelector<HTMLButtonElement>('[data-preview-control="toggle"]');
    if(toggle)toggle.textContent="Play Sampled Frames (≤2 FPS)";
  }
  const scrubber=createPreviewCoordinator(
    renderVideoPreview,
    frame=>{
      if(!active||!snapshot||frame.projectSha256!==snapshot.projectSha256)return;
      if(disposeFrame)disposeFrame();
      disposeFrame=applyPreviewToImage(e<HTMLImageElement>("image"),frame);
      e<HTMLImageElement>("image").hidden=false;
      e<HTMLElement>("empty").hidden=true;
      inform("Verified real FilmCraft frame "+frame.width+"×"+frame.height+" · "+formatTimecode(frame.seconds));
      if(sampledPlayback){
        const max=Number(e<HTMLInputElement>("scrub").max);
        const next=Number((frame.seconds+0.5).toFixed(3));
        if(!Number.isFinite(max)||next>=max){
          stopSampledPlayback();
        }else{
          playbackTimeout=setTimeout(()=>{
            playbackTimeout=null;
            if(!sampledPlayback||busy||!active||!snapshot)return;
            e<HTMLInputElement>("seconds").value=String(next);
            e<HTMLInputElement>("scrub").value=String(next);
            e<HTMLElement>("scrubLabel").textContent=formatTimecode(next);
            try{renderCurrentFrame(false);}catch(err){stopSampledPlayback();inform(String(err),true);}
          },500);
        }
      }
    },
    error=>{stopSampledPlayback();inform("Real FilmCraft preview failed: "+String(error),true);},
    {debounceMs:160},
  );
  function e<T extends HTMLElement>(name:string):T {
    const selector='[data-v="'+name+'"]';
    const node=panel.querySelector<T>(selector)??lane.querySelector<T>(selector);
    if(!node)throw Error("Video UI missing "+name);
    return node;
  }
  const value=(name:string):string=>e<HTMLInputElement>(name).value.trim();
  function inform(text:string,error=false):void {
    const node=e<HTMLElement>("status");
    node.textContent=text;
    node.classList.toggle("v-error",error);
    e<HTMLElement>("health").textContent=error?"Action not verified":"Native FilmCraft";
  }
  function paths():{selectedRoot:string;projectPath:string}{
    const selectedRoot=value("root"),projectPath=value("project");
    if(!localWindowsPath(selectedRoot)||!localWindowsPath(projectPath)||!projectPath.toLowerCase().endsWith(".fcproj"))
      throw Error("Provide absolute Windows folder and .fcproj paths");
    return {selectedRoot,projectPath};
  }
  function request(){
    const p=paths(),s=snapshot;
    if(!s||s.projectPath.toLowerCase()!==p.projectPath.toLowerCase())
      throw Error("Open / Refresh the selected project first");
    return {...p,expectedRevision:s.sessionRevision,expectedProjectSha256:s.projectSha256};
  }
  function clearFrame():void {
    stopSampledPlayback();
    scrubber.invalidate();
    if(disposeFrame){disposeFrame();disposeFrame=null;}
    e<HTMLImageElement>("image").hidden=true;
    e<HTMLElement>("empty").hidden=false;
  }
  function draw():void {
    const media=mediaItems(snapshot?.project);
    clips=timelineClips(snapshot?.sequence);
    const select=e<HTMLSelectElement>("media");
    select.replaceChildren();
    const opt=document.createElement("option");
    opt.textContent=media.length?"Select real media":"Import media first";
    opt.value="";
    select.append(opt);
    for(const m of media){
      const o=document.createElement("option");
      o.value=String(m.itemId);o.textContent="#"+m.itemId+" · "+m.name+" ("+m.type+")";
      select.append(o);
    }
    if(itemId!==null&&media.some(m=>m.itemId===itemId))select.value=String(itemId);
    else itemId=null;
    e<HTMLElement>("meta").textContent=snapshot?
      "Project SHA "+snapshot.projectSha256.slice(0,12)+" · "+media.length+" media items · "+clips.length+" clips":
      "No project loaded";
    const tracks=e<HTMLElement>("tracks");
    tracks.replaceChildren();
    const seq=snapshot?.sequence as {video?:Array<{name?:string}>,audio?:Array<{name?:string}>}|null|undefined;
    const seconds=Math.max(1,sequenceDuration(seq),...clips.map(c=>c.start+c.duration));
    e<HTMLElement>("duration").textContent=formatTimecode(sequenceDuration(seq));
    const duration=sequenceDuration(seq);
    const fps=sequenceFps(seq);
    const slider=e<HTMLInputElement>("scrub");
    slider.max=String(duration>0?Math.min(86400,duration):1);
    slider.disabled=busy||!active||!snapshot||duration<=0;
    panel.querySelectorAll<HTMLButtonElement>("button[data-preview-control]").forEach(btn=>{
      btn.disabled=busy||!active||!snapshot||duration<=0||(btn.dataset.previewControl!=="toggle"&&!fps);
    });
    if(!Number.isFinite(Number(slider.value))||Number(slider.value)>duration){
      slider.value=String(Math.min(duration,Math.max(0,Number(value("seconds"))||0)));
    }
    e<HTMLElement>("scrubLabel").textContent=formatTimecode(Number(slider.value));
    if(!seq){
      const msg=document.createElement("span");msg.textContent="No native sequence yet · create one after import";
      tracks.append(msg);
    }else for(const kind of ["video","audio"] as const){
      const list=seq[kind]??[];
      for(let index=0;index<list.length;index++){
        const name=(kind==="video"?"V":"A")+(index+1);
        const display=String(list[index]?.name??"");

        const row=document.createElement("div");row.className="v-track-row";
        const label=document.createElement("span");
        label.textContent=name;
        if(display&&display!==name)label.title=display;
        const track=document.createElement("div");track.className="v-track-lane";
        for(const clip of clips.filter(c=>c.kind===kind&&c.track===name)){
          const btn=document.createElement("button");btn.type="button";btn.className="v-clip"+(clip.clipId===clipId?" v-selected":"");
          btn.textContent=clip.name;
          btn.style.left=String(Math.min(99,Math.max(0,clip.start/seconds*100)))+"%";
          btn.style.width=String(Math.max(3,Math.min(100-clip.start/seconds*100,clip.duration/seconds*100)))+"%";
          btn.title="#"+clip.clipId+" · "+formatTimecode(clip.start)+" · "+formatTimecode(clip.duration);
          btn.addEventListener("click",()=>{
            clipId=clip.clipId;
            e<HTMLInputElement>("seconds").value=String(Number((clip.start+clip.duration/2).toFixed(3)));
            e<HTMLInputElement>("track").value=clip.track;
            draw();
          });
          track.append(btn);
        }
        row.append(label,track);tracks.append(row);
      }
    }
    e<HTMLElement>("history").textContent=history?.diverged
      ? "History paused: project modified outside Shuvi; refresh and create a new edit branch"
      : history ? "Saved project history · "+history.position+" / "+history.depth+
          " · SHA "+history.projectSha256.slice(0,12)
        : "No saved project editing history yet";
    const selected=clips.find(c=>c.clipId===clipId);
    e<HTMLElement>("selected").textContent=selected?
      "Native clip #"+selected.clipId+" · "+selected.track+" · "+selected.name:
      "Select a real clip by clicking its timeline block";
    panel.querySelectorAll<HTMLButtonElement>("button[data-action],button[data-choose]").forEach(b=>{b.disabled=busy});
    lane.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach(b=>{
      const action=b.dataset.action;
      b.disabled=busy||!snapshot||(action==="undo"&&!history?.canUndo)||(action==="redo"&&!history?.canRedo);
    });
    panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select").forEach(control=>{control.disabled=busy;});
    lane.querySelectorAll<HTMLButtonElement>(".v-clip").forEach(control=>{control.disabled=busy;});
  }
  async function load():Promise<VideoProjectSnapshot>{
    const p=paths();const found=await inspectVideoProject(p.selectedRoot,p.projectPath);
    const h=await inspectVideoHistory(p.selectedRoot,p.projectPath);
    if(h.projectSha256!==found.projectSha256)throw Error("Project changed between snapshot and history readback");
    snapshot=found;history=h;clearFrame();draw();return found;
  }
  function renderCurrentFrame(immediate:boolean):void {
    const req=request();
    const seconds=requireNumber(value("seconds"),0,86400);
    const scale=requireNumber(e<HTMLSelectElement>("previewScale").value,0.1,0.5);
    const accepted=scrubber.request({...req,seconds,scale},immediate);
    if(!accepted)throw Error("Preview is busy or inactive");
    inform("FilmCraft rendering requested at "+formatTimecode(seconds)+" · newest frame will replace older requests");
  }
  async function edit(action:TimelineAction):Promise<void>{
    const response=await editVideoTimeline({...request(),actions:[action]});
    const after=await load();
    if(after.projectSha256!==response.projectSha256)throw Error("Post-edit state changed unexpectedly; refresh/replan");
    inform("Verified "+action.type+" · backup: "+response.backupPath);
  }
  async function handle(action:string):Promise<void>{
    if(busy||!active)return;
    stopSampledPlayback(true);
    busy=true;draw();
    inform("Running native "+action+"… No result is claimed until verification finishes.");
    try {
      if(action!=="preview")await scrubber.pauseAndDrain();
      if(action==="probe"){
        const result=await probeVideoEngine();
        inform("Real FilmCraft engine round-trip · "+result.savedProjectBytes+" project bytes");
      }else if(action==="open"){
        const result=await load();
        inform("Verified FilmCraft project snapshot · SHA "+result.projectSha256);
      }else if(action==="import"){
        const p=paths(),sourcePath=value("source");
        if(!localWindowsPath(sourcePath))throw Error("Provide the absolute media filename");
        const result=await importVideoMedia(p.selectedRoot,p.projectPath,sourcePath);
        itemId=result.itemId;
        await load();
        inform("Imported real media #"+result.itemId+" · "+result.container+" · "+formatTimecode(result.durationSeconds));
      }else if(action==="sequence"){
        const width=requireNumber(value("width"),16,7680);
        const height=requireNumber(value("height"),16,4320);
        const fps=requireNumber(value("fps"),1,120);
        if (![width,height,fps].every(Number.isInteger))throw Error("Sequence dimensions and frame rate must be whole numbers");
        await edit({type:"createSequence",name:"Shuvi Video Studio",width,height,fps});
      }else if(action==="place"){
        const id=Number(e<HTMLSelectElement>("media").value),track=value("track").toUpperCase();
        if(!Number.isSafeInteger(id)||id<=0)throw Error("Select a real media item");
        if(!/^[VA](?:[1-9]|1[0-6])$/.test(track))throw Error("Track must be V1–V16 or A1–A16");
        const audio=track.startsWith("A");
        await edit({type:"place",itemId:id,track,seconds:requireNumber(value("seconds"),0,86400),video:!audio,audio});
      }else if(action==="preview"){
        renderCurrentFrame(true);
      }else if(action==="undo"||action==="redo"){
        const req=request();
        const receipt=await restoreVideoHistory({
          selectedRoot:req.selectedRoot,
          projectPath:req.projectPath,
          expectedProjectSha256:req.expectedProjectSha256,
          direction:action,
        });
        const refreshed=await load();
        if(refreshed.projectSha256!==receipt.projectSha256)
          throw Error("Undo/Redo saved state changed; refresh before proceeding");
        clipId=null;
        inform("Verified persistent FilmCraft "+action+" · project "+receipt.projectSha256.slice(0,12)+
          " · previous project backup "+receipt.backupPath);
      }else if(action==="export"){
        const outputPath=value("output");
        if(!localWindowsPath(outputPath)||!outputPath.toLowerCase().endsWith(".mp4"))throw Error("Choose a new absolute .mp4 filename");
        const out=await exportVideoMp4({...request(),outputPath,scale:requireNumber(e<HTMLSelectElement>("exportScale").value,0.25,1),includeAudio:e<HTMLInputElement>("audio").checked});
        inform("Verified MP4 · "+out.codec+" · "+out.outputBytes+" bytes · "+out.outputPath);
      }else{
        const clip=clips.find(c=>c.clipId===clipId);
        if(!clip)throw Error("Select a FilmCraft clip on the timeline first");
        const seconds=requireNumber(value("seconds"),0,86400);
        if(action==="split")await edit({type:"split",clipId:clip.clipId,seconds});
        if(action==="trim"){
          const deltaFrames=requireNumber(value("frames"),-144000,144000);
          if(!Number.isInteger(deltaFrames)||deltaFrames===0)throw Error("Trim frames must be a nonzero integer");
          const edge=e<HTMLSelectElement>("edge").value as "in"|"out";
          await edit({type:"trim",clipId:clip.clipId,edge,deltaFrames,ripple:e<HTMLInputElement>("ripple").checked});
        }
        if(action==="move"){
          const track=value("track").toUpperCase();
          if(!/^[VA](?:[1-9]|1[0-6])$/.test(track))throw Error("Invalid target track");
          await edit({type:"move",clipId:clip.clipId,track,seconds,insert:false});
        }
        if(action==="delete")await edit({type:"delete",clipId:clip.clipId,ripple:e<HTMLInputElement>("ripple").checked});
      }
    }catch(error){inform(String(error),true);}
    finally{scrubber.resume();busy=false;draw();}
  }
  async function choose(which:string):Promise<void>{
    if(busy||!active)return;
    try{
      let selected:string|null=null;
      if(which==="folder"){
        selected=await open({directory:true,multiple:false,title:"Select Video Studio project folder"});
        if(selected)e<HTMLInputElement>("root").value=selected;
      }else if(which==="project"){
        selected=await open({directory:false,multiple:false,title:"Open existing FilmCraft project",
          filters:[{name:"FilmCraft Project",extensions:["fcproj"]}]});
        if(selected)e<HTMLInputElement>("project").value=selected;
      }else if(which==="newProject"){
        selected=await save({title:"Choose new FilmCraft project path",
          filters:[{name:"FilmCraft Project",extensions:["fcproj"]}]});
        if(selected)e<HTMLInputElement>("project").value=selected;
      }else if(which==="source"){
        selected=await open({directory:false,multiple:false,title:"Import real video/audio/photo",
          filters:[{name:"FilmCraft Media",extensions:["mp4","m4v","mov","mkv","webm","avi","wav","wave","m4a","mp3","png","jpg","jpeg"]}]});
        if(selected)e<HTMLInputElement>("source").value=selected;
      }else if(which==="output"){
        selected=await save({title:"Choose new MP4 export destination",
          filters:[{name:"H.264 MP4",extensions:["mp4"]}]});
        if(selected)e<HTMLInputElement>("output").value=selected;
      }
      // Infer the folder only when still empty; users may override for multi-file projects.
      if(selected && which!=="folder" && !value("root")){
        e<HTMLInputElement>("root").value=selected.replace(/[\\/][^\\/]+$/,"");
      }
      if(selected){
        history=null;snapshot=null;clipId=null;itemId=null;
        scrubber.invalidate();clearFrame();draw();
        inform("Selected native path · "+selected+" · no editor operation executed yet");
      }
    }catch(err){inform("Native dialog unavailable: "+String(err),true);}
  }
  panel.querySelectorAll<HTMLButtonElement>("button[data-choose]").forEach(b=>
    b.addEventListener("click",()=>{void choose(b.dataset.choose??"");}));
  panel.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach(b=>b.addEventListener("click",()=>{void handle(b.dataset.action??"");}));
  lane.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach(b=>b.addEventListener("click",()=>{void handle(b.dataset.action??"");}));
  const slider=e<HTMLInputElement>("scrub");
  panel.querySelectorAll<HTMLButtonElement>("button[data-preview-control]").forEach(button=>{
    button.addEventListener("click",()=>{
      if(busy||!active||!snapshot)return;
      const action=button.dataset.previewControl;
      if(action==="toggle"){
        if(sampledPlayback){stopSampledPlayback(true);inform("Sampled preview paused");return;}
        if(sequenceDuration(snapshot.sequence)<=0)return;
        sampledPlayback=true;
        button.textContent="Pause Sampled Frames";
        try{renderCurrentFrame(true);}catch(error){stopSampledPlayback();inform(String(error),true);}
        return;
      }
      stopSampledPlayback(true);
      const fps=sequenceFps(snapshot.sequence);
      if(!fps){inform("FilmCraft sequence frame rate unavailable",true);return;}
      const offset=action==="back"?-1:1;
      const next=Math.max(0,Math.min(Number(slider.max),Number(value("seconds"))+offset/fps));
      e<HTMLInputElement>("seconds").value=String(next);
      slider.value=String(next);
      e<HTMLElement>("scrubLabel").textContent=formatTimecode(next);
      try{renderCurrentFrame(true);}catch(error){inform(String(error),true);}
    });
  });
  slider.addEventListener("input",()=>{
    stopSampledPlayback(true);
    if(busy||!active||!snapshot)return;
    const seconds=Number(slider.value);
    if(!Number.isFinite(seconds))return;
    e<HTMLInputElement>("seconds").value=String(seconds);
    e<HTMLElement>("scrubLabel").textContent=formatTimecode(seconds);
    try{renderCurrentFrame(false);}catch(error){inform(String(error),true);}
  });
  e<HTMLInputElement>("seconds").addEventListener("change",()=>{
    if(busy||!active||!snapshot)return;
    const seconds=Number(value("seconds"));
    if(Number.isFinite(seconds)&&seconds>=0&&seconds<=Number(slider.max)){
      slider.value=String(seconds);
      e<HTMLElement>("scrubLabel").textContent=formatTimecode(seconds);
    }
  });
  for(const key of ["root","project"]){
    e<HTMLInputElement>(key).addEventListener("change",()=>{
      history=null;snapshot=null;clipId=null;itemId=null;
      scrubber.invalidate();clearFrame();draw();
    });
  }
  e<HTMLSelectElement>("media").addEventListener("change",()=>{
    const id=Number(e<HTMLSelectElement>("media").value);
    itemId=Number.isSafeInteger(id)&&id>0?id:null;
  });
  draw();
  return {setActive(next:boolean){
    active=next;
    if(!next)stopSampledPlayback(true);
    panel.hidden=!next;lane.hidden=!next;
    oldPreview.forEach(n=>{n.hidden=next});
    oldTimeline.forEach(n=>{n.hidden=next});
    draw();
    if(initialChat)initialChat.textContent=next
      ? "Shuvi AI chat is not connected yet. Manual Video editing runs through the real FilmCraft engine after an explicit button click."
      : initialChatText;
  }};
}
