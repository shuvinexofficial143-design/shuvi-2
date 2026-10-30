/**
 * Shuvi 2 U01 — shared manual/AI controller; a native receipt is the only source
 * of completed edits. No fake model, preview, export or AI responses.
 */
export class WorkspaceError extends Error {
  constructor(code, message) { super(message); this.name = "WorkspaceError"; this.code = code; }
}
const fail = (code, message) => { throw new WorkspaceError(code, message); };
const nonempty = (v) => typeof v === "string" && v.trim().length > 0;
const validSha = (v) => typeof v === "string" && /^[a-f0-9]{64}$/i.test(v);
const VIDEO_ACTIONS = new Set(["createSequence", "place", "split", "trim", "move", "delete", "undo", "redo"]);
const MOTION_MUTATIONS = new Set([
  "addText", "editText", "addShape", "setTransform", "addKey", "easeKeys",
  "addEffect", "setEffectParameter", "toggleEffect", "removeEffect",
  "addPolygonMask", "setMaskVertex", "removeMask", "setMaskProperty"
]);
function checkVideo(snapshot) {
  if (!snapshot || !nonempty(snapshot.projectPath) || !validSha(snapshot.projectSha256)
    || !Number.isSafeInteger(snapshot.sessionRevision) || snapshot.sessionRevision < 0) {
    fail("INVALID_RECEIPT", "Native FilmCraft project snapshot is incomplete");
  }
  return snapshot;
}
const clone = (value) => structuredClone(value);
export function clipsFromSequence(sequence) {
  if (!sequence || typeof sequence !== "object") return [];
  const clips = [];
  const ticks = 254016000000;
  for (const kind of ["video", "audio"]) {
    const tracks = sequence[kind];
    if (!Array.isArray(tracks)) continue;
    tracks.forEach((track, index) => {
      if (!Array.isArray(track?.items)) return;
      for (const item of track.items) {
        if (!Number.isSafeInteger(item?.clip) || !Number.isSafeInteger(item?.item)
          || !Number.isFinite(item.start) || !Number.isFinite(item.duration)) continue;
        clips.push({clipId:item.clip, itemId:item.item, name:String(item.name ?? "Clip"),
          kind, track:(kind==="video"?"V":"A")+(index+1),
          start:item.start/ticks, duration:item.duration/ticks});
      }
    });
  }
  return clips.sort((a,b)=>a.start-b.start || a.track.localeCompare(b.track));
}
export function createWorkspaceController(native) {
  if (!native || typeof native.videoSnapshot !== "function" || typeof native.motion !== "function")
    fail("BAD_BRIDGE", "A typed native bridge is required");
  const listeners = new Set();
  const state = {
    studio:"video", busy:false, progress:"Idle", error:null, stopped:false,
    needsReload:false, video:null, videoFrame:null, exportReceipt:null,
    motion:{ready:false,revision:null,composition:null,layers:[],frame:null,dirty:false},
    pendingApproval:null, chat:[{role:"assistant",text:"Shuvi AI Director is not connected. Drafts cannot edit a project."}]
  };
  let inFlight = null;
  let operationId = 0;
  let taskCounter = 0;
  const emit = () => {
    const current = clone(state);
    for (const listener of listeners) listener(current);
  };
  const set = (patch) => { Object.assign(state,patch); emit(); };
  const requireReady = () => {
    if(state.busy) fail("BUSY","A native operation is already in progress");
    if(state.needsReload) fail("RELOAD_REQUIRED","A stopped or divergent native operation must be re-inspected");
  };
  async function run(label, job, {recover=false}={}) {
    if (state.busy) fail("BUSY", "A native operation is already in progress");
    if (state.needsReload && !recover) fail("RELOAD_REQUIRED", "Refresh native state before another edit");
    const token = ++operationId;
    inFlight = token;
    set({busy:true,progress:label,error:null,stopped:false});
    try {
      const receipt = await job(() => state.stopped || token!==operationId);
      if (state.stopped || token!==operationId) {
        set({needsReload:true,progress:"Stop requested; native work may have completed. Refresh required."});
        fail("STOP_UNVERIFIED","Stop cannot interrupt an in-flight native IPC call; state must be refreshed");
      }
      set({progress:label+" · native readback verified"});
      return receipt;
    } catch (err) {
      if (state.stopped || err?.code==="STOP_UNVERIFIED") {
        set({needsReload:true,progress:"Native outcome uncertain — refresh required"});
      } else {
        set({error:String(err?.message ?? err),progress:label+" · failed"});
      }
      throw err;
    } finally {
      if (inFlight===token) {inFlight=null;set({busy:false});}
    }
  }
  async function readVideo(root, projectPath) {
    if(!nonempty(root)||!nonempty(projectPath)) fail("PATH_REQUIRED","Choose a real folder and .fcproj file");
    const snapshot=checkVideo(await native.videoSnapshot(root,projectPath));
    if(snapshot.projectPath!==projectPath) fail("PATH_MISMATCH","Native project path differs from the selected path");
    return {root,projectPath,snapshot,clips:clipsFromSequence(snapshot.sequence)};
  }
  async function refreshVideo(root,projectPath) {
    return run("Inspecting native FilmCraft project", async()=>{
      const video=await readVideo(root,projectPath);
      set({video,videoFrame:null,needsReload:false,exportReceipt:null});
      return video;
    },{recover:true});
  }
  function requireVideo() {
    if(!state.video) fail("PROJECT_REQUIRED","Open a real FilmCraft project first");
    return state.video;
  }
  async function applyVideo(actions) {
    requireReady();
    const video=requireVideo();
    if(!Array.isArray(actions)||!actions.length
      || actions.some(a=>!a||!VIDEO_ACTIONS.has(a.type))) fail("UNSUPPORTED_ACTION","Unsupported FilmCraft edit");
    return run("Applying FilmCraft timeline edit", async()=>{
      const receipt=await native.videoTimeline({
        selectedRoot:video.root,projectPath:video.projectPath,
        expectedRevision:video.snapshot.sessionRevision,
        expectedProjectSha256:video.snapshot.projectSha256,actions
      });
      if(!validSha(receipt?.projectSha256) || receipt.commands?.some(c=>c.ok===false))
        fail("INVALID_RECEIPT","FilmCraft did not confirm a complete edit");
      const fresh=await readVideo(video.root,video.projectPath);
      if(fresh.snapshot.projectSha256!==receipt.projectSha256) {
        set({needsReload:true,videoFrame:null});
        fail("REVISION_CONFLICT","Native project differs from the edit receipt");
      }
      set({video:fresh,videoFrame:null,pendingApproval:null});
      return receipt;
    });
  }
  async function importVideo(sourcePath) {
    requireReady(); const v=requireVideo();
    if(!nonempty(sourcePath)) fail("PATH_REQUIRED","Select a real media path");
    return run("Importing real media", async()=>{
      const receipt=await native.videoImport(v.root,v.projectPath,sourcePath);
      if(!validSha(receipt?.projectSha256)) fail("INVALID_RECEIPT","Import receipt missing project checksum");
      const fresh=await readVideo(v.root,v.projectPath);
      if(fresh.snapshot.projectSha256!==receipt.projectSha256)
        {set({needsReload:true});fail("REVISION_CONFLICT","Imported project SHA did not match readback");}
      set({video:fresh,videoFrame:null});
      return receipt;
    });
  }
  async function renderVideo(seconds,scale=0.25) {
    requireReady(); const v=requireVideo();
    if(!Number.isFinite(seconds)||seconds<0||!Number.isFinite(scale)||scale<=0||scale>1)
      fail("INVALID_TIME","Invalid preview position or scale");
    return run("Rendering native FilmCraft frame", async()=>{
      const receipt=await native.videoPreview({selectedRoot:v.root,projectPath:v.projectPath,
        expectedRevision:v.snapshot.sessionRevision,expectedProjectSha256:v.snapshot.projectSha256,
        seconds,scale});
      if(receipt?.projectSha256!==v.snapshot.projectSha256
        || !Array.isArray(receipt?.pngBytes)||receipt.pngBytes.length===0)
        fail("INVALID_RECEIPT","Real FilmCraft frame unavailable or project changed");
      set({videoFrame:receipt});
      return receipt;
    });
  }
  async function exportVideo(outputPath,scale=1,includeAudio=true) {
    requireReady();const v=requireVideo();
    if(!nonempty(outputPath)) fail("PATH_REQUIRED","Choose a new output MP4 path");
    return run("Exporting native FilmCraft MP4", async()=>{
      const result=await native.videoExport({selectedRoot:v.root,projectPath:v.projectPath,
        expectedRevision:v.snapshot.sessionRevision,expectedProjectSha256:v.snapshot.projectSha256,
        outputPath,scale,includeAudio});
      if(result?.projectSha256!==v.snapshot.projectSha256||result.outputBytes<=0
        ||result.outputPath!==outputPath) fail("INVALID_RECEIPT","Native export proof is missing");
      set({exportReceipt:result});
      return result;
    });
  }
  async function history(direction) {
    requireReady();const v=requireVideo();
    if(!["undo","redo"].includes(direction))fail("UNSUPPORTED_ACTION","Invalid history direction");
    return run("Restoring native FilmCraft history", async()=>{
      const result=await native.videoRestore({selectedRoot:v.root,projectPath:v.projectPath,
        expectedProjectSha256:v.snapshot.projectSha256,direction});
      const fresh=await readVideo(v.root,v.projectPath);
      if(!validSha(result?.projectSha256)||result.projectSha256!==fresh.snapshot.projectSha256)
        {set({needsReload:true});fail("REVISION_CONFLICT","History restore readback mismatched");}
      set({video:fresh,videoFrame:null,pendingApproval:null});
      return result;
    });
  }
  async function motionStatus() {
    return run("Checking live EffectCraft worker", async()=>{
      const status=await native.motion({action:"status"});
      if(status?.ready!==true || status?.native!==true
        || !Number.isSafeInteger(status?.projectRevision)) fail("ENGINE_UNAVAILABLE","Real EffectCraft worker unavailable");
      set({motion:{...state.motion,ready:true,revision:status.projectRevision,dirty:!!status.dirty},
        needsReload:false});
      return status;
    },{recover:true});
  }
  async function createComposition(spec) {
    requireReady();
    if(!nonempty(spec?.name))fail("INVALID_COMPOSITION","Composition name required");
    return run("Creating real EffectCraft composition", async()=>{
      const comp=await native.motion({action:"createComposition",...spec});
      if(!Number.isSafeInteger(comp?.id)||!Number.isSafeInteger(comp?.revision))
        fail("INVALID_RECEIPT","Native composition readback missing");
      const layers=await native.motion({action:"listLayers",compId:comp.id});
      if(!Array.isArray(layers))fail("INVALID_RECEIPT","Native layers could not be inspected");
      set({motion:{...state.motion,ready:true,composition:comp,revision:comp.revision,layers,frame:null,dirty:true}});
      return comp;
    });
  }
  async function editMotion(request) {
    requireReady(); const m=state.motion;
    if(!m.ready||!m.composition)fail("PROJECT_REQUIRED","Create/open an EffectCraft composition");
    if(!request || !MOTION_MUTATIONS.has(request.action) || request.compId!==m.composition.id)
      fail("UNSUPPORTED_ACTION","Motion edit is not available for this composition");
    return run("Applying EffectCraft native edit", async()=>{
      const before=await native.motion({action:"status"});
      if(before.projectRevision!==m.revision)
        {set({needsReload:true});fail("REVISION_CONFLICT","EffectCraft revision changed outside this workspace");}
      const receipt=await native.motion(request);
      const after=await native.motion({action:"status"});
      const layers=await native.motion({action:"listLayers",compId:m.composition.id});
      if(!Array.isArray(layers)||!Number.isSafeInteger(after?.projectRevision)
        ||after.projectRevision<=before.projectRevision)
        fail("INVALID_RECEIPT","EffectCraft edit has no verified revision advance");
      set({motion:{...m,revision:after.projectRevision,layers,frame:null,dirty:!!after.dirty}});
      return receipt;
    });
  }
  async function renderMotion(time=0,transparent=true) {
    requireReady();const m=state.motion;
    if(!m.ready||!m.composition)fail("PROJECT_REQUIRED","Open an EffectCraft composition");
    if(!Number.isFinite(time)||time<0)fail("INVALID_TIME","Invalid composition time");
    return run("Rendering native EffectCraft frame",async()=>{
      const frame=await native.motion({action:"render",compId:m.composition.id,time,maxSide:768,transparent});
      if(frame?.source!=="native-effectcraft"||!nonempty(frame.pngBase64)||frame.revision!==m.revision)
        {set({needsReload:true});fail("INVALID_RECEIPT","Motion frame is not from current native revision");}
      set({motion:{...m,frame}});
      return frame;
    });
  }
  async function saveMotion(workspace,basename) {
    requireReady();
    if(!nonempty(workspace)||!nonempty(basename))fail("PATH_REQUIRED","Select a real workspace and .ecproj name");
    return run("Saving real EffectCraft project",async()=>{
      const receipt=await native.motion({action:"saveProject",workspace,basename});
      if(receipt?.verifiedFromDisk!==true||receipt.bytes<=0)
        fail("INVALID_RECEIPT","Native disk save not verified");
      const status=await native.motion({action:"status"});
      set({motion:{...state.motion,revision:status.projectRevision,dirty:!!status.dirty}});
      return receipt;
    });
  }
  async function openMotion(workspace,basename) {
    return run("Opening EffectCraft from disk",async()=>{
      const receipt=await native.motion({action:"openProject",workspace,basename});
      if(receipt?.verifiedFromDisk!==true||!Array.isArray(receipt.compositions))
        fail("INVALID_RECEIPT","Native disk reopen not verified");
      const comp=receipt.compositions[0]??null;
      const status=await native.motion({action:"status"});
      const layers=comp?await native.motion({action:"listLayers",compId:comp.id}):[];
      set({motion:{ready:true,revision:status.projectRevision,composition:comp,layers,frame:null,dirty:!!status.dirty},
        needsReload:false});
      return receipt;
    },{recover:true});
  }
  async function exportMotionPng(workspace,filename,time=0) {
    requireReady(); const m=state.motion;
    if(!m.composition)fail("PROJECT_REQUIRED","Open a composition first");
    return run("Exporting native EffectCraft PNG",async()=>{
      const receipt=await native.motion({action:"exportPng",workspace,filename,compId:m.composition.id,
        time,maxSide:768,transparent:true});
      if(receipt?.verifiedFromDisk!==true||receipt.bytes<=0||receipt.source!=="native-effectcraft")
        fail("INVALID_RECEIPT","Native PNG export not verified");
      return receipt;
    });
  }
  function stageAiVideoTask(actions,expectedSha) {
    requireReady();const v=requireVideo();
    if(!validSha(expectedSha)||expectedSha!==v.snapshot.projectSha256)
      fail("REVISION_CONFLICT","AI plan is stale before owner approval");
    if(!Array.isArray(actions)||actions.length===0||actions.some(a=>!VIDEO_ACTIONS.has(a?.type)))
      fail("UNSUPPORTED_ACTION","AI requested an unapproved native action");
    if(state.pendingApproval)fail("APPROVAL_PENDING","Resolve the previous proposed edit first");
    const task={id:"video-task-"+(++taskCounter),studio:"video",kind:"timeline",
      actions:clone(actions),expectedSha,projectPath:v.projectPath};
    set({pendingApproval:task});
    return task;
  }
  async function approveTask(id) {
    if(!state.pendingApproval||state.pendingApproval.id!==id)fail("APPROVAL_REQUIRED","No matching owner-approved task");
    const task=clone(state.pendingApproval);
    set({pendingApproval:null});
    if(task.studio!=="video")fail("UNSUPPORTED_ACTION","Motion AI writes require native atomic revision guard");
    if(state.video?.snapshot.projectSha256!==task.expectedSha||state.video?.projectPath!==task.projectPath)
      fail("REVISION_CONFLICT","Project changed since AI action was proposed");
    return applyVideo(task.actions);
  }
  return {
    getState:()=>clone(state),subscribe(listener){listeners.add(listener);listener(clone(state));return()=>listeners.delete(listener);},
    selectStudio(studio){if(!["video","motion"].includes(studio))fail("UNSUPPORTED_STUDIO","Unknown studio");set({studio});},
    addDraft(text){if(!nonempty(text))return;state.chat.push({role:"user",text:text.trim()});
      state.chat.push({role:"assistant",text:"Draft only — AI Director is not connected; no native edit was executed."});emit();},
    stop(){if(!state.busy)return false;set({stopped:true,progress:"Stop requested; waiting for native IPC to settle"});return true;},
    dismissTask(){set({pendingApproval:null});},
    refreshVideo,applyVideo,importVideo,renderVideo,exportVideo,history,
    motionStatus,createComposition,editMotion,renderMotion,saveMotion,openMotion,exportMotionPng,
    stageAiVideoTask,approveTask
  };
}
