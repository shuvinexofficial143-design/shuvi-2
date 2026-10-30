import "./view.css";
import {parseVideoChat, type VideoChatProposal} from "./chat-command.mjs";
import { createVideoProposalEpoch } from "./proposal-epoch.mjs";
import { clipDragDestination } from "./drag.mjs";
import { timelineViewport,clipViewportBounds } from "./viewport.mjs";
import {realClipDetail,realSequenceMarkers,revealTimeOffset} from "./inspect.mjs";
import {rulerTicks,rulerSeekTime,percentOnRuler} from "./ruler.mjs";
import {shouldInvalidateVideoProjectOnFilePick} from "./file-picker.mjs";
import {shouldRefreshVideoProjectAfterActionError} from "./error-policy.mjs";
import {videoTrackStates,videoActionPreflight} from "./track-state.mjs";
import { matchingVideoSelection } from "./selection.mjs";
import {requestVideoAiProposal} from "./ai";
import {canSubmitVideoAiRequest} from "./privacy.mjs";
import { createPreviewCoordinator } from "./scrub.mjs";
import { open, save } from "@tauri-apps/plugin-dialog";
import { probeVideoEngine } from "./engine";
import { inspectVideoProject, type VideoProjectSnapshot } from "./snapshot";
import { importVideoMedia } from "./media";
import { editVideoTimeline, type TimelineAction } from "./timeline";
import { renderVideoPreview, applyPreviewToImage } from "./preview";
import { exportVideoMp4 } from "./export";
import { inspectVideoHistory, restoreVideoHistory, reconcileVideoHistory, type VideoHistoryStatus } from "./history";
import { videoKeyboardCommand } from "./keyboard.mjs";
import { mediaItems, timelineClips, sequenceDuration, sequenceFps, formatTimecode, localWindowsPath, requireNumber, type EditorClip } from "./model.mjs";
import {mediaBinView,mediaBinKind} from "./media-bin.mjs";

/** The FilmCraft UI is owned by Video Studio. No Motion Studio DOM is removed. */
export function mountVideoStudio(): { setActive(active:boolean):void; proposeChatText(text:string):Promise<string> } {
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
    <div class="v-head v-project-head">
      <div><span class="v-eyebrow">SHUVI / VIDEO WORKSPACE</span>
        <strong>FilmCraft Video Editor</strong></div>
      <span data-v="health">Open a project</span>
    </div>
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
      <section class="v-media-library" aria-label="Actual FilmCraft imported media">
        <div class="v-pane-heading"><strong>Media Bin</strong><span data-v="mediaCount">0 imported items</span></div>
        <label>Search imported media<input data-v="mediaFilter" type="search" autocomplete="off" placeholder="Find by name, type or ID"></label>
        <div class="v-media-list" data-v="mediaList" aria-label="Imported FilmCraft media items"></div>
        <small>Items come from the saved FilmCraft project; select to use Place Media.</small>
      </section>
      <section class="v-program" aria-label="Native FilmCraft program monitor">
        <div class="v-pane-heading"><strong>Program Monitor</strong><span data-v="monitorLabel">Native PNG renderer</span></div>
        <div class="v-monitor"><img data-v="image" alt="Real FilmCraft Program frame" hidden><span data-v="empty">Frame preview pending · click Render Frame after placing footage</span></div>
      </section>
      <section class="v-options" aria-label="FilmCraft inspector and export settings">
        <div class="v-pane-heading"><strong>Controls</strong><span>Native project</span></div>
        <label>Imported media<select data-v="media"><option value="">Import first</option></select></label>
        <label>Chat command source<select data-v="chatMode">
          <option value="local">Local English / हिंदी commands (no AI)</option>
          <option value="openai">OpenAI real model (review required)</option>
        </select></label>
        <label>OpenAI API key (optional if OPENAI_API_KEY set)
          <input data-v="apiKey" type="password" autocomplete="off" spellcheck="false" placeholder="Session only · not saved">
        </label>
        <label class="v-inline v-ai-consent">
          <input data-v="aiConsent" type="checkbox">
          Allow sending my instruction and numeric timeline metadata to OpenAI (API charges may apply)
        </label>
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
      </section>
    </div>
    <div class="v-message" data-v="status" role="status" aria-live="polite">Use real files under the selected folder. No demo media is generated.</div>
  `;
  const lane=document.createElement("section");
  lane.className="v-lanes";
  lane.innerHTML=String.raw`
    <div class="v-head v-timeline-heading"><div><span class="v-eyebrow">REAL .FCPROJ</span><strong>Editing Timeline</strong></div><span data-v="duration">00:00:00.000</span></div>
    <div class="v-timeline-nav">
      <label>Timeline Zoom<select data-v="timelineZoom">
        <option value="1">1× · Full sequence</option>
        <option value="2">2×</option><option value="4">4×</option>
        <option value="8">8×</option><option value="16">16×</option><option value="32">32×</option>
      </select></label>
      <label>Timeline Pan<input data-v="timelinePan" type="range" min="0" max="0" value="0" step="any" disabled></label>
      <span data-v="viewRange">00:00:00.000 – 00:00:00.000</span>
    </div>
    <button data-v="timeRuler" type="button" class="v-time-ruler" aria-label="FilmCraft timeline ruler. Click to seek and render a native frame." disabled></button>
    <div data-v="tracks" class="v-tracks">Open a project to load FilmCraft sequence tracks.</div>
    <div data-v="selected" class="v-muted">Click a clip to select it.</div>
    <section class="v-native-inspector">
      <strong>FilmCraft Clip Inspector (saved project)</strong>
      <div data-v="clipInspector">Select a real clip to inspect its native source and timing.</div>
      <div class="v-actions"><button type="button" data-inspect-action="reveal" disabled>Reveal Selected Clip</button>
        <button type="button" data-inspect-action="seekClip" disabled>Seek & Render Clip Start</button></div>
    </section>
    <section class="v-native-markers">
      <strong>Real Sequence Markers</strong>
      <select data-v="markerSelect"><option value="">No saved markers</option></select>
      <button type="button" data-inspect-action="seekMarker" disabled>Seek & Render Marker</button>
    </section>
    <div class="v-actions"><button data-action="place">Place Media</button><button data-action="split">Split</button><button data-action="trim">Trim</button><button data-action="move">Move</button><button data-action="delete">Delete</button>
    <button data-action="undo">Undo Last Edit</button><button data-action="redo">Redo Edit</button>
    <button data-action="recover">Recover Interrupted History</button></div>
    <div class="v-muted" data-v="history">Cross-session FilmCraft project history is being inspected.</div>
    <div class="v-chat-review" data-v="chatReview" hidden>
      <strong>Video editing proposal · user approval required</strong>
      <p data-v="chatSummary">No pending command</p>
      <div class="v-actions"><button type="button" data-chat-approve="yes">Approve & Run on FilmCraft</button>
      <button type="button" data-chat-approve="no">Reject</button></div>
    </div>
  `;
  preview.append(panel);timeline.append(lane);
  let snapshot:VideoProjectSnapshot|null=null;
  let itemId:number|null=null,clipId:number|null=null;
  let clips:EditorClip[]=[];
  let history:VideoHistoryStatus|null=null;
  let loadedSelection:{selectedRoot:string;projectPath:string}|null=null;
  let pending:VideoChatProposal|null=null;
  let selectedMarkerId:number|null=null;
  const proposalEpoch=createVideoProposalEpoch();
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
    if(!s||!matchingVideoSelection(p,loadedSelection))
      throw Error("Project selection changed. Open / Refresh this exact project before editing");
    return {...p,expectedRevision:s.sessionRevision,expectedProjectSha256:s.projectSha256};
  }
  function clearProposal():void{
    proposalEpoch.invalidate();
    pending=null;
    e<HTMLElement>("chatReview").hidden=true;
    e<HTMLElement>("chatSummary").textContent="No pending command";
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

    // Media Bin derives exclusively from the FilmCraft project inspection.
    // Use textContent for names from external files, never user-controlled HTML.
    const bin=e<HTMLElement>("mediaList");
    bin.replaceChildren();
    const shown=mediaBinView(media,value("mediaFilter"));
    e<HTMLElement>("mediaCount").textContent=shown.matching+" / "+shown.total+" real items";
    if(shown.items.length===0){
      const empty=document.createElement("p");
      empty.className="v-bin-empty";
      empty.textContent=shown.total===0?"Import a real video or audio file to populate this bin.":
        "No imported media matches the current filter.";
      bin.append(empty);
    }
    for(const m of shown.items){
      const button=document.createElement("button");
      button.type="button";
      button.className="v-media-item"+(m.itemId===itemId?" v-media-selected":"");
      button.dataset.mediaId=String(m.itemId);
      button.setAttribute("aria-pressed",String(m.itemId===itemId));
      const kind=document.createElement("span");
      kind.className="v-media-kind";
      kind.textContent=mediaBinKind(m);
      const detail=document.createElement("span");
      detail.className="v-media-description";
      const name=document.createElement("strong");name.textContent=m.name;
      const id=document.createElement("small");id.textContent="#"+m.itemId+" · "+m.type;
      detail.append(name,id);button.append(kind,detail);
      button.disabled=busy||!active;
      button.addEventListener("click",()=>{
        if(busy||!active)return;
        itemId=m.itemId;
        draw();
        inform("Selected FilmCraft media #"+m.itemId+" · ready for Place Media");
      });
      bin.append(button);
    }

    e<HTMLElement>("meta").textContent=snapshot?
      "Project SHA "+snapshot.projectSha256.slice(0,12)+" · "+media.length+" media items · "+clips.length+" clips":
      "No project loaded";
    const tracks=e<HTMLElement>("tracks");
    tracks.replaceChildren();
    const seq=snapshot?.sequence as {video?:Array<{name?:string}>,audio?:Array<{name?:string}>}|null|undefined;
    const seconds=Math.max(1,sequenceDuration(seq),...clips.map(c=>c.start+c.duration));
    const zoom=Number(e<HTMLSelectElement>("timelineZoom").value);
    const pan=e<HTMLInputElement>("timelinePan");
    const viewport=timelineViewport(seconds,zoom,Number(pan.value));
    if(!viewport)throw Error("Timeline viewport settings invalid");
    pan.max=String(viewport.maxStart);
    pan.value=String(viewport.start);
    pan.disabled=viewport.maxStart<=0;
    e<HTMLElement>("viewRange").textContent=formatTimecode(viewport.start)+
      " – "+formatTimecode(viewport.end)+" · "+zoom+"× zoom";
    const nativeTracks=videoTrackStates(snapshot?.sequence);
    const ruler=e<HTMLButtonElement>("timeRuler");
    ruler.replaceChildren();
    const fpsForRuler=sequenceFps(seq);
    ruler.disabled=busy||!active||!snapshot||!fpsForRuler||sequenceDuration(seq)<=0;
    for(const tick of rulerTicks(viewport)){
      const span=document.createElement("span");
      span.className="v-time-tick";
      span.style.left=String(tick.percent)+"%";
      span.title=formatTimecode(tick.seconds);
      span.textContent=formatTimecode(tick.seconds);
      ruler.append(span);
    }
    for(const marker of realSequenceMarkers(seq)){
      const at=percentOnRuler(marker.start,viewport);
      if(at===null)continue;
      const mark=document.createElement("span");
      mark.className="v-marker-tick";
      mark.style.left=String(at)+"%";
      mark.title="Real FilmCraft marker #"+marker.id+" · "+(marker.name||marker.kind)+
        " · "+formatTimecode(marker.start);
      ruler.append(mark);
    }
    const playhead=percentOnRuler(Number(value("seconds")),viewport);
    if(playhead!==null){
      const indicator=document.createElement("span");
      indicator.className="v-ruler-playhead";
      indicator.style.left=String(playhead)+"%";
      indicator.title="Playhead: "+formatTimecode(Number(value("seconds")));
      ruler.append(indicator);
    }
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
        const laneState=nativeTracks.find(t=>t.track===name);
        const locked=laneState?.locked===true;

        const row=document.createElement("div");row.className="v-track-row";
        const label=document.createElement("span");
        label.textContent=name+(locked?" 🔒":"")+
          (laneState?.muted?" M":"")+
          (laneState?.enabled===false?" OFF":"")+
          (laneState?.solo?" S":"");
        label.title=[display||name,locked?"LOCKED":"editable",
          laneState?.muted?"Muted":"",laneState?.enabled===false?"Disabled":"",
          laneState?.solo?"Solo":""].filter(Boolean).join(" · ");
        if(locked)row.classList.add("v-track-locked");
        const track=document.createElement("div");track.className="v-track-lane";
        for(const clip of clips.filter(c=>c.kind===kind&&c.track===name)){
          const visible=clipViewportBounds(clip,viewport);
          if(!visible)continue;
          const btn=document.createElement("button");btn.type="button";btn.className="v-clip"+(clip.clipId===clipId?" v-selected":"");
          btn.textContent=clip.name;
          btn.style.left=String(visible.leftPercent)+"%";
          btn.style.width=String(Math.max(0.25,Math.min(100-visible.leftPercent,visible.widthPercent)))+"%";
          if(visible.clippedLeft)btn.classList.add("v-clipped-left");
          if(visible.clippedRight)btn.classList.add("v-clipped-right");
          btn.title="#"+clip.clipId+" · "+formatTimecode(clip.start)+" · "+formatTimecode(clip.duration)+
            (locked?" · FilmCraft track LOCKED; move/trim disabled":
              " · Drag horizontally on same track to request a real FilmCraft move");
          let suppressClick=false;
          let pointerStartX:number|null=null;
          let activePointer:number|null=null;
          btn.addEventListener("pointerdown",event=>{
            if(event.button!==0||busy||!active||locked)return;
            pointerStartX=event.clientX;
            activePointer=event.pointerId;
            btn.setPointerCapture(event.pointerId);
          });
          btn.addEventListener("pointercancel",()=>{
            pointerStartX=null;activePointer=null;
          });
          btn.addEventListener("pointerup",event=>{
            if(pointerStartX===null||activePointer!==event.pointerId)return;
            const deltaPixels=event.clientX-pointerStartX;
            pointerStartX=null;activePointer=null;
            if(Math.abs(deltaPixels)<8||busy||!active)return;
            // Windows dispatches a synthetic click after a pointer drag.
            // It must not re-select/repaint the old clip while native editing.
            suppressClick=true;
            const fps=sequenceFps(snapshot?.sequence);
            if(!fps){inform("Cannot drag: native FilmCraft FPS is unavailable",true);return;}
            const destination=clipDragDestination({
              start:clip.start,deltaPixels,lanePixels:track.getBoundingClientRect().width,
              visibleSeconds:viewport.duration,totalSeconds:seconds,fps
            });
            if(destination===null){inform("Invalid pointer drag geometry; no edit made",true);return;}
            if(Math.abs(destination-clip.start)<(0.5/fps))return;
            void moveClipByDrag(clip,destination);
          });
          btn.addEventListener("click",()=>{
            if(suppressClick){suppressClick=false;return;}
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
      ? history.recoverableDirection
        ? "Interrupted "+history.recoverableDirection+" detected: project SHA matches a verified snapshot. Click Recover Interrupted History."
        : "History paused: project modified outside Shuvi; refresh and create a new edit branch"
      : history ? "Saved project history · "+history.position+" / "+history.depth+
          " · SHA "+history.projectSha256.slice(0,12)
        : "No saved project editing history yet";
    const selected=clips.find(c=>c.clipId===clipId);
    e<HTMLElement>("selected").textContent=selected?
      "Native clip #"+selected.clipId+" · "+selected.track+" · "+selected.name:
      "Select a real clip by clicking its timeline block";
    const nativeDetail=clipId===null?null:realClipDetail(snapshot?.sequence,clipId);
    const description=nativeDetail
      ? [
          "Clip #"+nativeDetail.clipId+" • "+nativeDetail.track+" • media #"+(nativeDetail.itemId??"?"),
          "Start "+formatTimecode(nativeDetail.start)+" • End "+formatTimecode(nativeDetail.end)+
            " • Duration "+formatTimecode(nativeDetail.duration),
          "Source In "+(nativeDetail.sourceIn===null?"unavailable":formatTimecode(nativeDetail.sourceIn))+
            " • Source Out "+(nativeDetail.sourceOut===null?"unavailable":formatTimecode(nativeDetail.sourceOut)),
          "Speed "+(nativeDetail.speed===null?"unavailable":String(nativeDetail.speed)+"×")+
            " • Reverse "+(nativeDetail.reverse?"yes":"no")+
            " • Effects "+nativeDetail.effectCount,
          (nativeDetail.locked?"Locked":"Editable")+" • "+(nativeDetail.enabled?"Enabled":"Disabled")+
            " • Gain "+(nativeDetail.gainDb===null?"unavailable":String(nativeDetail.gainDb)+" dB")
        ].join("\n")
      : "Select an existing native clip to inspect its saved metadata.";
    e<HTMLElement>("clipInspector").textContent=description;
    const nativeMarkers=realSequenceMarkers(snapshot?.sequence);
    const markerSelect=e<HTMLSelectElement>("markerSelect");
    markerSelect.replaceChildren();
    const placeholder=document.createElement("option");
    placeholder.value="";
    placeholder.textContent=nativeMarkers.length?"Select saved marker":"No saved markers in this FilmCraft sequence";
    markerSelect.append(placeholder);
    for(const marker of nativeMarkers){
      const option=document.createElement("option");
      option.value=String(marker.id);
      option.textContent="#"+marker.id+" · "+(marker.name||marker.kind||"Marker")+
        " · "+formatTimecode(marker.start);
      option.title=marker.comment;
      markerSelect.append(option);
    }
    if(selectedMarkerId!==null&&nativeMarkers.some(x=>x.id===selectedMarkerId))
      markerSelect.value=String(selectedMarkerId);
    else selectedMarkerId=null;
    lane.querySelectorAll<HTMLButtonElement>("button[data-inspect-action]").forEach(button=>{
      button.disabled=busy||!active||!snapshot||(
        button.dataset.inspectAction==="seekMarker" ? selectedMarkerId===null : nativeDetail===null
      );
    });

    panel.querySelectorAll<HTMLButtonElement>("button[data-action],button[data-choose]").forEach(b=>{b.disabled=busy});
    lane.querySelectorAll<HTMLButtonElement>("button[data-chat-approve]").forEach(b=>{
      b.disabled=busy||!active||!pending;
    });
    lane.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach(b=>{
      const action=b.dataset.action;
      b.disabled=busy||!snapshot||(action==="undo"&&!history?.canUndo)||(action==="redo"&&!history?.canRedo)
        ||(action==="recover"&&!history?.recoverableDirection);
    });
    panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select").forEach(control=>{control.disabled=busy;});
    panel.querySelectorAll<HTMLButtonElement>(".v-media-item").forEach(control=>{control.disabled=busy||!active;});
    lane.querySelectorAll<HTMLButtonElement>(".v-clip").forEach(control=>{control.disabled=busy;});
  }
  async function load():Promise<VideoProjectSnapshot>{
    const p=paths();const found=await inspectVideoProject(p.selectedRoot,p.projectPath);
    const h=await inspectVideoHistory(p.selectedRoot,p.projectPath);
    if(h.projectSha256!==found.projectSha256)throw Error("Project changed between snapshot and history readback");
    if(pending&&pending.expectedProjectSha256!==found.projectSha256)clearProposal();
    loadedSelection=p;
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
  async function moveClipByDrag(clip:EditorClip,seconds:number):Promise<void>{
    if(!active||busy||!snapshot)return;
    stopSampledPlayback(true);
    busy=true;draw();
    inform("Moving real FilmCraft clip #"+clip.clipId+" to "+formatTimecode(seconds)+
      "… Awaiting native save and verification.");
    try{
      await scrubber.pauseAndDrain();
      const current=clips.find(c=>c.clipId===clip.clipId&&c.track===clip.track);
      if(!current||current.start!==clip.start)
        throw Error("Timeline changed since pointer drag began");
      const action={type:"move" as const,clipId:clip.clipId,track:clip.track,seconds,insert:false};
      const preflight=videoActionPreflight(action,snapshot?.sequence);
      if(!preflight.ok)throw Error(preflight.reason);
      const receipt=await editVideoTimeline({...request(),actions:[action]});
      const state=await load();
      if(state.projectSha256!==receipt.projectSha256)
        throw Error("FilmCraft clip move readback mismatch");
      const verified=clips.find(c=>c.clipId===clip.clipId);
      const fps=sequenceFps(state.sequence);
      if(!verified||!fps||Math.abs(verified.start-seconds) > (0.51/fps))
        throw Error("Native clip did not move to the requested frame in saved FilmCraft timeline");
      clipId=clip.clipId;
      inform("Verified real timeline move · clip #"+clip.clipId+" → "+formatTimecode(seconds));
    }catch(error){
      inform("Drag did not complete: "+String(error),true);
      try{await load();}catch{}
    }finally{scrubber.resume();busy=false;draw();}
  }
  async function edit(action:TimelineAction):Promise<void>{
    const preflight=videoActionPreflight(action,snapshot?.sequence);
    if(!preflight.ok)throw Error(preflight.reason);
    const response=await editVideoTimeline({...request(),actions:[action]});
    const after=await load();
    if(after.projectSha256!==response.projectSha256)throw Error("Post-edit state changed unexpectedly; refresh/replan");
    inform("Verified "+action.type+" · backup: "+response.backupPath);
  }
  async function proposeChatText(text:string):Promise<string> {
    if(!active||busy||!snapshot)return "Open a real FilmCraft Video project before proposing a chat command.";
    clearProposal();
    const ticket=proposalEpoch.begin();
    // Copy the active state before any asynchronous model call; no edit may
    // happen while a proposal is being planned, and switching studio cancels it.
    const modelMode=e<HTMLSelectElement>("chatMode").value==="openai";
    const currentProject=snapshot.projectSha256;
    const selectedRoot=value("root"),projectPath=value("project");
    const ctx={
      selectedRoot,projectPath,projectSha256:currentProject,
      clips:clips.map(c=>({clipId:c.clipId,start:c.start,duration:c.duration,kind:c.kind})),
      media:mediaItems(snapshot.project).map(m=>({itemId:m.itemId})),
      selectedClipId:clipId,selectedMediaId:itemId,
    };
    let instruction=text;
    let explanation="";
    if(modelMode){
      if(!canSubmitVideoAiRequest({mode:"openai",
        optedIn:e<HTMLInputElement>("aiConsent").checked,prompt:text})){
        return "OpenAI was not contacted. Enable the OpenAI sharing checkbox and enter a request up to 700 characters.";
      }
      busy=true;draw();
      try{
        const credential=e<HTMLInputElement>("apiKey").value.trim();
        const result=await requestVideoAiProposal({
          prompt:text,apiKey:credential||null,
          context:{
            projectSha256:currentProject,clips:ctx.clips,
            mediaIds:ctx.media.map(m=>m.itemId),
            selectedClipId:clipId,selectedMediaId:itemId
          }
        });
        if(!proposalEpoch.isCurrent(ticket)||!active||!snapshot||snapshot.projectSha256!==currentProject||
          value("root")!==selectedRoot||value("project")!==projectPath){
          clearProposal();
          return "Project/studio changed while AI was planning; proposal discarded without execution.";
        }
        if(result.projectSha256!==currentProject)throw Error("Model response project digest mismatch");
        instruction=result.command;
        explanation=result.reason;
      }catch(err){
        clearProposal();
        return "OpenAI model proposal failed; nothing executed: "+String(err);
      }finally{busy=false;draw();}
    }
    if(!proposalEpoch.isCurrent(ticket)||!active){
      clearProposal();
      return "Proposal invalidated by a newer command, studio change, or project change; nothing executed.";
    }
    const plan=parseVideoChat(instruction,ctx);
    if(!plan.ok){
      clearProposal();
      return modelMode
        ?"Model output rejected by the strict FilmCraft command allowlist; no edit executed. "+plan.message
        :plan.message;
    }
    pending=plan;
    e<HTMLElement>("chatReview").hidden=false;
    e<HTMLElement>("chatSummary").textContent=(modelMode?"OpenAI model proposes: ":"Local command: ")+
      plan.summary+" | SHA "+plan.expectedProjectSha256.slice(0,12)+
      (explanation?" | "+explanation.slice(0,320):"");
    draw();
    return (modelMode?"Model-assisted proposal (not executed): ":"Local typed command (not AI): ")+
      plan.summary+". Review the card and explicitly approve in Video Timeline.";
  }
  async function approveChat():Promise<void>{
    const plan=pending;
    if(!plan||busy||!active)return;
    busy=true;stopSampledPlayback(true);draw();
    try{
      await scrubber.pauseAndDrain();
      const req=request();
      if(req.expectedProjectSha256!==plan.expectedProjectSha256 ||
         req.selectedRoot!==plan.selectedRoot || req.projectPath!==plan.projectPath)
        throw Error("STALE_PROJECT_CONTENT: project changed since chat proposal");
      if(plan.action.type==="undo"||plan.action.type==="redo"){
        const state=await inspectVideoHistory(req.selectedRoot,req.projectPath);
        if(state.projectSha256!==plan.expectedProjectSha256||
          (plan.action.type==="undo"&&!state.canUndo)||(plan.action.type==="redo"&&!state.canRedo))
          throw Error("History unavailable or changed since proposal");
        const result=await restoreVideoHistory({
          selectedRoot:req.selectedRoot,projectPath:req.projectPath,
          expectedProjectSha256:req.expectedProjectSha256,direction:plan.action.type
        });
        clearProposal();
        const verified=await load();
        if(verified.projectSha256!==result.projectSha256)throw Error("History readback mismatch");
      }else{
        const preflight=videoActionPreflight(plan.action,snapshot?.sequence);
        if(!preflight.ok)throw Error(preflight.reason);
        const result=await editVideoTimeline({...req,actions:[plan.action]});
        clearProposal();
        const verified=await load();
        if(verified.projectSha256!==result.projectSha256)throw Error("Timeline readback mismatch");
      }
      inform("Verified approved Chat "+plan.action.type+" · saved native project readback");
    }catch(err){
      clearProposal();
      inform("Chat action not verified: "+String(err),true);
      try{await load();}catch{}
    }finally{scrubber.resume();busy=false;draw();}
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
      }else if(action==="recover"){
        const req=request();
        if(!history?.recoverableDirection)throw Error("No recoverable interrupted event in this project");
        const direction=history.recoverableDirection;
        const repaired=await reconcileVideoHistory({
          selectedRoot:req.selectedRoot,
          projectPath:req.projectPath,
          expectedProjectSha256:req.expectedProjectSha256,
          direction,
        });
        const current=await load();
        if(current.projectSha256!==repaired.projectSha256)throw Error("History recovery project changed; refresh required");
        clipId=null;
        inform("Verified interrupted "+direction+" journal recovery with real FilmCraft project readback");
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
    }catch(error){
      const failure=String(error);
      if(shouldRefreshVideoProjectAfterActionError(action)){
        // Native FilmCraft may have committed file bytes before the UI error
        // arrived. Never keep rendering/authorizing edits from a stale SHA.
        try {
          const latest=await load();
          inform("Action NOT VERIFIED: "+failure+
            " · current .fcproj reloaded (SHA "+latest.projectSha256.slice(0,12)+")",true);
        }catch(reloadError){
          clearProposal();
          snapshot=null;history=null;clipId=null;itemId=null;
          clearFrame();draw();
          inform("Action failed and native project could not be reloaded: "+failure+
            " · "+String(reloadError)+" · reopen project before editing",true);
        }
      } else {
        inform(failure,true);
      }
    }
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
        if(shouldInvalidateVideoProjectOnFilePick(which)){
          // Only switching the actual .fcproj or its permitted root loses
          // current native snapshot/history. Export target and new media source
          // are settings of the SAME verified FilmCraft project.
          clearProposal();history=null;snapshot=null;loadedSelection=null;clipId=null;itemId=null;
          scrubber.invalidate();clearFrame();draw();
        }
        inform("Selected native path · "+selected+" · no editor operation executed yet");
      }
    }catch(err){inform("Native dialog unavailable: "+String(err),true);}
  }
  lane.querySelectorAll<HTMLButtonElement>("button[data-chat-approve]").forEach(b=>{
    b.addEventListener("click",()=>{
      if(b.dataset.chatApprove==="no"){clearProposal();inform("Command rejected; no editing action");draw();}
      if(b.dataset.chatApprove==="yes")void approveChat();
    });
  });
  panel.querySelectorAll<HTMLButtonElement>("button[data-choose]").forEach(b=>
    b.addEventListener("click",()=>{void choose(b.dataset.choose??"");}));
  panel.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach(b=>b.addEventListener("click",()=>{void handle(b.dataset.action??"");}));
  lane.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach(b=>b.addEventListener("click",()=>{void handle(b.dataset.action??"");}));
  e<HTMLSelectElement>("markerSelect").addEventListener("change",()=>{
    const value=Number(e<HTMLSelectElement>("markerSelect").value);
    selectedMarkerId=Number.isSafeInteger(value)&&value>0?value:null;
    draw();
  });
  lane.querySelectorAll<HTMLButtonElement>("button[data-inspect-action]").forEach(button=>{
    button.addEventListener("click",()=>{
      if(!active||busy||!snapshot)return;
      const action=button.dataset.inspectAction;
      const chosen=clipId===null?null:realClipDetail(snapshot.sequence,clipId);
      if(action==="reveal"){
        if(!chosen)return;
        const seqDuration=Math.max(1,sequenceDuration(snapshot.sequence),...clips.map(c=>c.start+c.duration));
        const zoom=Number(e<HTMLSelectElement>("timelineZoom").value);
        const pan=e<HTMLInputElement>("timelinePan");
        const viewport=timelineViewport(seqDuration,zoom,Number(pan.value));
        const target=revealTimeOffset(chosen.start,viewport);
        if(target===null)return;
        pan.value=String(target);
        draw();
        inform("Revealed real FilmCraft clip #"+chosen.clipId+" at "+formatTimecode(chosen.start));
        return;
      }
      let second:number|null=null;
      if(action==="seekClip"&&chosen)second=chosen.start;
      if(action==="seekMarker"){
        const marker=realSequenceMarkers(snapshot.sequence).find(m=>m.id===selectedMarkerId);
        if(marker)second=marker.start;
      }
      if(second===null)return;
      const fps=sequenceFps(snapshot.sequence);
      const last=Math.max(0,sequenceDuration(snapshot.sequence)-(fps?1/fps:0.001));
      const time=Math.min(last,Math.max(0,second));
      e<HTMLInputElement>("seconds").value=String(time);
      e<HTMLInputElement>("scrub").value=String(time);
      e<HTMLElement>("scrubLabel").textContent=formatTimecode(time);
      stopSampledPlayback(true);
      try{renderCurrentFrame(true);}catch(error){inform("Native seek not verified: "+String(error),true);}
    });
  });
  e<HTMLButtonElement>("timeRuler").addEventListener("click",event=>{
    if(!active||busy||!snapshot)return;
    const seqDuration=Math.max(1,sequenceDuration(snapshot.sequence),
      ...clips.map(c=>c.start+c.duration));
    const pan=e<HTMLInputElement>("timelinePan");
    const zoom=Number(e<HTMLSelectElement>("timelineZoom").value);
    const viewport=timelineViewport(seqDuration,zoom,Number(pan.value));
    const fps=sequenceFps(snapshot.sequence);
    const button=e<HTMLButtonElement>("timeRuler");
    const bounds=button.getBoundingClientRect();
    // Keyboard-generated button click has clientX=0; use the current
    // playhead instead of unexpectedly jumping to timeline zero.
    const px=event.detail===0 && viewport
      ? bounds.left+Math.max(0,Math.min(1,
          (Number(value("seconds"))-viewport.start)/viewport.duration))*bounds.width
      : event.clientX;
    const time=rulerSeekTime(px,{left:bounds.left,width:bounds.width},viewport,fps??NaN);
    if(time===null){inform("FilmCraft ruler seek unavailable: invalid FPS or position",true);return;}
    stopSampledPlayback(true);
    e<HTMLInputElement>("seconds").value=String(time);
    e<HTMLInputElement>("scrub").value=String(time);
    e<HTMLElement>("scrubLabel").textContent=formatTimecode(time);
    draw();
    try{renderCurrentFrame(true);}catch(error){inform("Ruler frame not verified: "+String(error),true);}
  });
  e<HTMLSelectElement>("timelineZoom").addEventListener("change",()=>draw());
  e<HTMLInputElement>("timelinePan").addEventListener("input",()=>draw());
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
  e<HTMLSelectElement>("chatMode").addEventListener("change",()=>{
    clearProposal();draw();
  });
  for(const key of ["root","project"]){
    e<HTMLInputElement>(key).addEventListener("change",()=>{
      // Project changes invalidate every pending model or local proposal.
      clearProposal();
      history=null;snapshot=null;clipId=null;itemId=null;
      scrubber.invalidate();clearFrame();draw();
    });
  }
  e<HTMLSelectElement>("media").addEventListener("change",()=>{
    const id=Number(e<HTMLSelectElement>("media").value);
    itemId=Number.isSafeInteger(id)&&id>0?id:null;
    draw();
  });
  e<HTMLInputElement>("mediaFilter").addEventListener("input",()=>draw());
  window.addEventListener("keydown",(event)=>{
    if(!active||busy||event.defaultPrevented)return;
    const target=event.target instanceof HTMLElement ? event.target : null;
    const editing=Boolean(target?.closest("input,textarea,select,[contenteditable='true']"));
    const action=videoKeyboardCommand(event,editing);
    if(!action)return;
    if(action==="undo" && !history?.canUndo)return;
    if(action==="redo" && !history?.canRedo)return;
    if((action==="back"||action==="forward") && (!snapshot||sequenceDuration(snapshot.sequence)<=0))return;
    event.preventDefault();
    if(action==="back"||action==="forward"){
      panel.querySelector<HTMLButtonElement>('[data-preview-control="'+action+'"]')?.click();
    }else{
      void handle(action);
    }
  });
  draw();
  return {proposeChatText,setActive(next:boolean){
    active=next;
    if(!next){
      stopSampledPlayback(true);clearProposal();
      e<HTMLInputElement>("apiKey").value="";
      e<HTMLInputElement>("aiConsent").checked=false;
      e<HTMLSelectElement>("chatMode").value="local";
    }
    panel.hidden=!next;lane.hidden=!next;
    oldPreview.forEach(n=>{n.hidden=next});
    oldTimeline.forEach(n=>{n.hidden=next});
    draw();
    if(initialChat)initialChat.textContent=next
      ? "Video Chat: choose Local Commands or OpenAI model. Each edit requires separate review and approval; no automatic execution."
      : initialChatText;
  }};
}
