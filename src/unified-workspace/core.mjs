/**
 * Shuvi 2 unified controller: receipts and subsequent native readback are the
 * only source of completed edits. No fabricated preview, export or AI status.
 */
import {nativeFps,verifyNativeMove,nativeTrackGuard} from "./timeline.mjs";
import {checkedAiVideoActions} from "./ai-plan.mjs";
import {nativeClipInspector,splitPreflight,verifyNativeSplit} from "./video-inspector.mjs";
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
    needsReload:false, recoveryStudio:null, video:null, videoFrame:null, exportReceipt:null,
    videoGeneration:0,motionGeneration:0,verificationHistory:[],
    motion:{ready:false,revision:null,composition:null,layers:[],frame:null,dirty:false,inspector:null},
    pendingApproval:null, chat:[{role:"assistant",text:"Shuvi AI Director is not connected. Drafts cannot edit a project."}]
  };
  let inFlight = null;
  let operationId = 0;
  let taskCounter = 0;
  let evidenceCounter = 0;
  function evidence(studio,label,outcome,code=null) {
    const safeCode=typeof code==="string"&&/^[A-Z][A-Z_]{2,39}$/.test(code)?code:
      code===null?null:"NATIVE_ERROR";
    state.verificationHistory.push({id:++evidenceCounter,studio,label,outcome,code:safeCode});
    if(state.verificationHistory.length>48)state.verificationHistory.splice(0,state.verificationHistory.length-48);
  }
  const emit = () => {
    const current = clone(state);
    for (const listener of listeners) listener(current);
  };
  const set = (patch) => { Object.assign(state,patch); emit(); };
  const requireReady = (studio) => {
    if(state.busy) fail("BUSY","A native operation is already in progress");
    if(state.needsReload && state.recoveryStudio===studio)
      fail("RELOAD_REQUIRED","A stopped or divergent native operation must be re-inspected");
  };
  async function run(label, job, {recover=false,studio="video",mutating=false}={}) {
    if (state.busy) fail("BUSY", "A native operation is already in progress");
    if (state.needsReload && state.recoveryStudio===studio && !recover) fail("RELOAD_REQUIRED", "Refresh the affected native studio before another edit");
    const token = ++operationId;
    inFlight = token;
    evidence(studio,label,"started");
    set({busy:true,progress:label,error:null,stopped:false});
    try {
      const receipt = await job(() => state.stopped || token!==operationId);
      if (state.stopped || token!==operationId) {
        set({needsReload:true,recoveryStudio:studio,progress:"Stop requested; native work may have completed. Refresh required."});
        fail("STOP_UNVERIFIED","Stop cannot interrupt an in-flight native IPC call; state must be refreshed");
      }
      evidence(studio,label,"verified");
      set({progress:label+" · native readback verified"});
      return receipt;
    } catch (err) {
      if (state.stopped || err?.code==="STOP_UNVERIFIED" || mutating) {
        evidence(studio,label,"uncertain",err?.code??"NATIVE_OUTCOME_UNKNOWN");
        const invalidation=studio==="video"?
          {videoFrame:null,exportReceipt:null,pendingApproval:null}:
          {motion:{...state.motion,frame:null,inspector:null}};
        set({needsReload:true,recoveryStudio:studio,
          error:String(err?.message ?? err),progress:"Native outcome uncertain — refresh required",...invalidation});
      } else {
        evidence(studio,label,"failed",err?.code??"NATIVE_FAILURE");
        set({error:String(err?.message ?? err),progress:label+" · failed"});
      }
      if (state.stopped && err?.code!=="STOP_UNVERIFIED")
        throw new WorkspaceError("STOP_UNVERIFIED","Native call may have completed after Stop; refresh required");
      throw err;
    } finally {
      if (inFlight===token) {inFlight=null;set({busy:false});}
    }
  }
  async function readVideo(root, projectPath) {
    if(!nonempty(root)||!nonempty(projectPath)) fail("PATH_REQUIRED","Choose a real folder and .fcproj file");
    const snapshot=checkVideo(await native.videoSnapshot(root,projectPath));
    // checked_project() canonicalizes paths; use its verified canonical return, not raw UI spelling.
    return {root,projectPath:snapshot.projectPath,snapshot,clips:clipsFromSequence(snapshot.sequence)};
  }
  async function refreshVideo(root,projectPath) {
    return run("Inspecting native FilmCraft project", async()=>{
      const video=await readVideo(root,projectPath);
      set({video,videoFrame:null,exportReceipt:null,pendingApproval:null,videoGeneration:state.videoGeneration+1,
        ...(state.recoveryStudio==="video"?{needsReload:false,recoveryStudio:null}:{})});
      return video;
    },{recover:true});
  }
  function requireVideo() {
    if(!state.video) fail("PROJECT_REQUIRED","Open a real FilmCraft project first");
    return state.video;
  }
  async function applyVideo(actions) {
    requireReady("video");
    const video=requireVideo();
    if(!Array.isArray(actions)||!actions.length
      || actions.some(a=>!a||!VIDEO_ACTIONS.has(a.type))) fail("UNSUPPORTED_ACTION","Unsupported FilmCraft edit");
    for(const action of actions) {
      const blocked=nativeTrackGuard(video.snapshot.sequence,action);
      if(blocked)fail("NATIVE_TRACK_GUARD",blocked);
    }
    return run("Applying FilmCraft timeline edit", async()=>{
      const receipt=await native.videoTimeline({
        selectedRoot:video.root,projectPath:video.projectPath,
        expectedRevision:video.snapshot.sessionRevision,
        expectedProjectSha256:video.snapshot.projectSha256,actions
      });
      if(!validSha(receipt?.projectSha256) || !Array.isArray(receipt?.commands) ||
        receipt.commands.some(c=>c.ok===false)) {
        set({needsReload:true,recoveryStudio:"video",videoFrame:null,pendingApproval:null});
        fail("INVALID_RECEIPT","FilmCraft edit result lacks complete native proof; refresh required");
      }
      let fresh;
      try { fresh=await readVideo(video.root,video.projectPath); }
      catch(error){set({needsReload:true,recoveryStudio:"video",videoFrame:null});throw error;}
      if(fresh.snapshot.projectSha256!==receipt.projectSha256) {
        set({needsReload:true,recoveryStudio:"video",videoFrame:null});
        fail("REVISION_CONFLICT","Native project differs from the edit receipt");
      }
      set({video:fresh,videoFrame:null,pendingApproval:null});
      return receipt;
    },{studio:"video",mutating:true});
  }
  async function splitVideoClip(clipId,seconds) {
    requireReady("video");
    const source=nativeClipInspector(state,clipId);
    const preflight=splitPreflight(source,seconds);
    if(!preflight.ok)fail("INVALID_SPLIT",preflight.reason);
    const receipt=await applyVideo([{type:"split",clipId,seconds:preflight.seconds}]);
    if(!verifyNativeSplit(source,state.video?.clips,preflight.seconds)){
      set({needsReload:true,recoveryStudio:"video",videoFrame:null,exportReceipt:null,pendingApproval:null});
      fail("REVISION_CONFLICT","FilmCraft split has no matching native left/right clip readback");
    }
    return receipt;
  }
  async function moveVideoClip(clipId,track,seconds) {
    requireReady("video");
    const current=requireVideo();
    const clip=current.clips.find(c=>c.clipId===clipId);
    if(!clip)fail("CLIP_NOT_FOUND","Clip is no longer in the native timeline");
    if(typeof track!=="string" || !/^[VA](?:[1-9]|1[0-6])$/.test(track) ||
        track[0]!==clip.track[0])
      fail("INVALID_TRACK","Destination must be a valid native track of the same media kind");
    if(!Number.isFinite(seconds)||seconds<0||seconds>86400)
      fail("INVALID_TIME","Invalid FilmCraft timeline destination");
    const fps=nativeFps(current.snapshot.sequence);
    if(fps===null)fail("FPS_UNAVAILABLE","Native sequence frame rate must be read before moving a clip");
    if(clip.track===track&&Math.abs(clip.start-seconds)<=0.01/fps)
      return {unchanged:true,projectSha256:current.snapshot.projectSha256};
    const result=await applyVideo([{type:"move",clipId,track,seconds,insert:false}]);
    if(!verifyNativeMove(state.video?.clips,clipId,track,seconds,fps)) {
      set({needsReload:true,recoveryStudio:"video",videoFrame:null});
      fail("REVISION_CONFLICT","Saved FilmCraft timeline did not contain the requested clip move");
    }
    return result;
  }
  async function importVideo(sourcePath) {
    requireReady("video"); const v=requireVideo();
    if(!nonempty(sourcePath)) fail("PATH_REQUIRED","Select a real media path");
    return run("Importing real media", async()=>{
      const receipt=await native.videoImport(v.root,v.projectPath,sourcePath);
      if(!validSha(receipt?.projectSha256)) fail("INVALID_RECEIPT","Import receipt missing project checksum");
      let fresh;
      try {fresh=await readVideo(v.root,v.projectPath);}
      catch(error){set({needsReload:true,recoveryStudio:"video"});throw error;}
      if(fresh.snapshot.projectSha256!==receipt.projectSha256)
        {set({needsReload:true,recoveryStudio:"video"});fail("REVISION_CONFLICT","Imported project SHA did not match readback");}
      set({video:fresh,videoFrame:null,pendingApproval:null});
      return receipt;
    },{studio:"video",mutating:true});
  }
  async function renderVideo(seconds,scale=0.25) {
    requireReady("video"); const v=requireVideo();
    if(!Number.isFinite(seconds)||seconds<0||!Number.isFinite(scale)||scale<=0||scale>1)
      fail("INVALID_TIME","Invalid preview position or scale");
    return run("Rendering native FilmCraft frame", async()=>{
      const receipt=await native.videoPreview({selectedRoot:v.root,projectPath:v.projectPath,
        expectedRevision:v.snapshot.sessionRevision,expectedProjectSha256:v.snapshot.projectSha256,
        seconds,scale});
      if(receipt?.projectSha256!==v.snapshot.projectSha256) {
        set({needsReload:true,recoveryStudio:"video",videoFrame:null});
        fail("REVISION_CONFLICT","FilmCraft preview uses a different project SHA; refresh required");
      }
      if(!Array.isArray(receipt?.pngBytes)||receipt.pngBytes.length===0)
        fail("INVALID_RECEIPT","Real FilmCraft frame unavailable");
      set({videoFrame:receipt});
      return receipt;
    });
  }
  async function exportVideo(outputPath,scale=1,includeAudio=true) {
    requireReady("video");const v=requireVideo();
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
    requireReady("video");const v=requireVideo();
    if(!["undo","redo"].includes(direction))fail("UNSUPPORTED_ACTION","Invalid history direction");
    return run("Restoring native FilmCraft history", async()=>{
      const result=await native.videoRestore({selectedRoot:v.root,projectPath:v.projectPath,
        expectedProjectSha256:v.snapshot.projectSha256,direction});
      let fresh;
      try {fresh=await readVideo(v.root,v.projectPath);}
      catch(error){set({needsReload:true,recoveryStudio:"video"});throw error;}
      if(!validSha(result?.projectSha256)||result.projectSha256!==fresh.snapshot.projectSha256)
        {set({needsReload:true,recoveryStudio:"video"});fail("REVISION_CONFLICT","History restore readback mismatched");}
      set({video:fresh,videoFrame:null,pendingApproval:null});
      return result;
    },{studio:"video",mutating:true});
  }
  async function motionStatus() {
    return run("Refreshing live EffectCraft project", async()=>{
      const status=await native.motion({action:"status"});
      if(status?.ready!==true || status?.native!==true
        || !Number.isSafeInteger(status?.projectRevision))
        fail("ENGINE_UNAVAILABLE","Real EffectCraft worker unavailable");
      const previous=state.motion;
      let composition=previous.composition,layers=previous.layers;
      if(composition) {
        try {
          composition=await native.motion({action:"inspectComposition",compId:composition.id});
          layers=await native.motion({action:"listLayers",compId:composition.id});
          if(!composition || !Array.isArray(layers))fail("INVALID_RECEIPT","Motion refresh did not return native layers");
          const after=await native.motion({action:"status"});
          if(after?.projectRevision!==status.projectRevision)
            fail("REVISION_CONFLICT","EffectCraft changed during recovery readback");
        } catch(error){
          set({needsReload:true,recoveryStudio:"motion",motion:{...previous,frame:null,inspector:null}});
          throw error;
        }
      }
      const changed=status.projectRevision!==previous.revision;
      set({motion:{...previous,ready:true,composition,layers,revision:status.projectRevision,
        frame:changed?null:previous.frame,inspector:null,dirty:!!status.dirty},
        ...(state.recoveryStudio==="motion"?{needsReload:false,recoveryStudio:null}:{})});
      return status;
    },{recover:true,studio:"motion"});
  }
  async function createComposition(spec) {
    requireReady("motion");
    if(!nonempty(spec?.name))fail("INVALID_COMPOSITION","Composition name required");
    return run("Creating real EffectCraft composition", async()=>{
      const comp=await native.motion({action:"createComposition",...spec});
      if(!Number.isSafeInteger(comp?.id)||!Number.isSafeInteger(comp?.revision))
        fail("INVALID_RECEIPT","Native composition readback missing");
      const layers=await native.motion({action:"listLayers",compId:comp.id});
      if(!Array.isArray(layers))fail("INVALID_RECEIPT","Native layers could not be inspected");
      set({motion:{...state.motion,ready:true,composition:comp,revision:comp.revision,layers,frame:null,dirty:true,inspector:null},
        motionGeneration:state.motionGeneration+1});
      return comp;
    },{studio:"motion",mutating:true});
  }
  async function inspectMotionLayer(layerId) {
    requireReady("motion");
    const m=state.motion;
    if(!m.ready || !m.composition)fail("PROJECT_REQUIRED","Open a real EffectCraft composition");
    if(!Number.isSafeInteger(layerId)||layerId<=0)fail("LAYER_NOT_FOUND","Select a valid native layer");
    return run("Inspecting native EffectCraft layer",async()=>{
      const before=await native.motion({action:"status"});
      if(before?.projectRevision!==m.revision){
        set({needsReload:true,recoveryStudio:"motion",motion:{...m,frame:null,inspector:null}});
        fail("REVISION_CONFLICT","Motion changed before layer inspection; refresh required");
      }
      let layers,effects,masks,after;
      try{
        layers=await native.motion({action:"listLayers",compId:m.composition.id});
        if(!Array.isArray(layers))fail("INVALID_RECEIPT","Native layer list unavailable");
        if(!layers.some(layer=>layer.id===layerId))fail("LAYER_NOT_FOUND","Layer no longer exists in current native composition");
        effects=await native.motion({action:"listEffects",compId:m.composition.id,layerId});
        masks=await native.motion({action:"listMasks",compId:m.composition.id,layerId});
        after=await native.motion({action:"status"});
      }catch(error){
        if(error?.code!=="LAYER_NOT_FOUND"){
          set({needsReload:true,recoveryStudio:"motion",motion:{...m,frame:null,inspector:null}});
        }
        throw error;
      }
      if(!Array.isArray(effects)||!Array.isArray(masks)||after?.projectRevision!==before.projectRevision){
        set({needsReload:true,recoveryStudio:"motion",motion:{...m,frame:null,inspector:null}});
        fail("REVISION_CONFLICT","Native inspector did not return a stable project revision");
      }
      const inspector={layer:layers.find(x=>x.id===layerId),effects,masks,revision:m.revision};
      set({motion:{...m,layers,inspector}});
      return inspector;
    },{studio:"motion"});
  }
  async function editMotion(request) {
    requireReady("motion"); const m=state.motion;
    if(!m.ready||!m.composition)fail("PROJECT_REQUIRED","Create/open an EffectCraft composition");
    if(!request || !MOTION_MUTATIONS.has(request.action) || request.compId!==m.composition.id)
      fail("UNSUPPORTED_ACTION","Motion edit is not available for this composition");
    return run("Applying EffectCraft native edit", async()=>{
      const before=await native.motion({action:"status"});
      if(before.projectRevision!==m.revision)
        {set({needsReload:true,recoveryStudio:"motion"});fail("REVISION_CONFLICT","EffectCraft revision changed outside this workspace");}
      let receipt,after,layers;
      try {
        receipt=await native.motion(request);
        after=await native.motion({action:"status"});
        layers=await native.motion({action:"listLayers",compId:m.composition.id});
      } catch(error){set({needsReload:true,recoveryStudio:"motion"});throw error;}
      if(!Array.isArray(layers)||!Number.isSafeInteger(after?.projectRevision)
        ||after.projectRevision<=before.projectRevision) {
        set({needsReload:true,recoveryStudio:"motion",motion:{...m,frame:null,inspector:null}});
        fail("INVALID_RECEIPT","EffectCraft edit has no verified revision advance");
      }
      const current=m.inspector;
      const updatedLayer=current&&layers.find(layer=>layer.id===current.layer.id);
      let inspector=updatedLayer?{...current,layer:updatedLayer,revision:after.projectRevision}:null;
      const changesInspectorData=/^(addEffect|setEffectParameter|toggleEffect|removeEffect|addPolygonMask|setMaskVertex|removeMask|setMaskProperty)$/.test(request.action);
      if(inspector&&changesInspectorData) {
        try{
          const effects=await native.motion({action:"listEffects",compId:m.composition.id,layerId:updatedLayer.id});
          const masks=await native.motion({action:"listMasks",compId:m.composition.id,layerId:updatedLayer.id});
          const stable=await native.motion({action:"status"});
          if(!Array.isArray(effects)||!Array.isArray(masks)||
            stable?.projectRevision!==after.projectRevision)
            fail("REVISION_CONFLICT","Motion effect/mask readback drifted after native write");
          inspector={...inspector,effects,masks};
        }catch(error){
          set({needsReload:true,recoveryStudio:"motion",motion:{...m,frame:null,inspector:null}});
          throw error;
        }
      }
      set({motion:{...m,revision:after.projectRevision,layers,frame:null,dirty:!!after.dirty,inspector}});
      return receipt;
    },{studio:"motion",mutating:true});
  }
  async function renderMotion(time=0,transparent=true) {
    requireReady("motion");const m=state.motion;
    if(!m.ready||!m.composition)fail("PROJECT_REQUIRED","Open an EffectCraft composition");
    if(!Number.isFinite(time)||time<0)fail("INVALID_TIME","Invalid composition time");
    return run("Rendering native EffectCraft frame",async()=>{
      const frame=await native.motion({action:"render",compId:m.composition.id,time,maxSide:768,transparent});
      if(frame?.source!=="native-effectcraft"||!nonempty(frame.pngBase64)||frame.revision!==m.revision)
        {set({needsReload:true,recoveryStudio:"motion"});fail("INVALID_RECEIPT","Motion frame is not from current native revision");}
      set({motion:{...m,frame}});
      return frame;
    },{studio:"motion"});
  }
  async function saveMotion(workspace,basename) {
    requireReady("motion");
    if(!nonempty(workspace)||!nonempty(basename))fail("PATH_REQUIRED","Select a real workspace and .ecproj name");
    return run("Saving real EffectCraft project",async()=>{
      let receipt,status;
      try{
        receipt=await native.motion({action:"saveProject",workspace,basename});
        if(receipt?.verifiedFromDisk!==true||receipt.bytes<=0)
          fail("INVALID_RECEIPT","Native disk save not verified");
        status=await native.motion({action:"status"});
        if(!Number.isSafeInteger(status?.projectRevision)||
          status.projectRevision!==state.motion.revision)
          fail("REVISION_CONFLICT","Native Motion changed during save verification");
      }catch(error){
        set({needsReload:true,recoveryStudio:"motion",
          motion:{...state.motion,frame:null,inspector:null}});
        throw error;
      }
      set({motion:{...state.motion,revision:status.projectRevision,dirty:!!status.dirty}});
      return receipt;
    },{studio:"motion",mutating:true});
  }
  async function openMotion(workspace,basename) {
    return run("Opening EffectCraft from disk",async()=>{
      let receipt,comp,status,layers;
      try{
        receipt=await native.motion({action:"openProject",workspace,basename});
        if(receipt?.verifiedFromDisk!==true||!Array.isArray(receipt.compositions))
          fail("INVALID_RECEIPT","Native disk reopen not verified");
        comp=receipt.compositions[0]??null;
        status=await native.motion({action:"status"});
        layers=comp?await native.motion({action:"listLayers",compId:comp.id}):[];
        if(!Array.isArray(layers)||!Number.isSafeInteger(status?.projectRevision))
          fail("INVALID_RECEIPT","Native project reopened but composition state was not verified");
        const stable=await native.motion({action:"status"});
        if(stable?.projectRevision!==status.projectRevision)
          fail("REVISION_CONFLICT","Native Motion revision drifted during disk reopen");
      }catch(error){
        set({needsReload:true,recoveryStudio:"motion",
          motion:{ready:false,revision:null,composition:null,layers:[],frame:null,dirty:false,inspector:null}});
        throw error;
      }
      set({motion:{ready:true,revision:status.projectRevision,composition:comp,layers,frame:null,dirty:!!status.dirty,inspector:null},
        motionGeneration:state.motionGeneration+1,
        ...(state.recoveryStudio==="motion"?{needsReload:false,recoveryStudio:null}:{})});
      return receipt;
    },{recover:true,studio:"motion"});
  }
  async function exportMotionPng(workspace,filename,time=0) {
    requireReady("motion"); const m=state.motion;
    if(!m.composition)fail("PROJECT_REQUIRED","Open a composition first");
    return run("Exporting native EffectCraft PNG",async()=>{
      const receipt=await native.motion({action:"exportPng",workspace,filename,compId:m.composition.id,
        time,maxSide:768,transparent:true});
      if(receipt?.verifiedFromDisk!==true||receipt.bytes<=0||receipt.source!=="native-effectcraft")
        fail("INVALID_RECEIPT","Native PNG export not verified");
      return receipt;
    },{studio:"motion"});
  }
  async function verifyVideoSnapshot() {
    requireReady("video");
    const expected=requireVideo();
    return run("Verifying FilmCraft disk readback",async()=>{
      let observed;
      try{observed=await readVideo(expected.root,expected.projectPath);}
      catch(error){
        set({needsReload:true,recoveryStudio:"video",videoFrame:null,exportReceipt:null,pendingApproval:null});
        throw error;
      }
      if(observed.snapshot.projectSha256!==expected.snapshot.projectSha256 ||
        observed.snapshot.sessionRevision!==expected.snapshot.sessionRevision ||
        observed.projectPath!==expected.projectPath) {
        set({needsReload:true,recoveryStudio:"video",videoFrame:null,exportReceipt:null,pendingApproval:null});
        fail("REVISION_CONFLICT","FilmCraft project changed since the last native readback");
      }
      set({video:observed});
      return observed;
    },{studio:"video"});
  }
  async function verifyMotionSnapshot() {
    requireReady("motion");
    const expected=state.motion;
    return run("Verifying EffectCraft native revision",async()=>{
      try {
        const before=await native.motion({action:"status"});
        if(before?.native!==true||before?.ready!==true ||
          !Number.isSafeInteger(before.projectRevision)||
          before.projectRevision!==expected.revision)
          fail("REVISION_CONFLICT","EffectCraft revision changed; refresh native composition");
        let layers=expected.layers;
        if(expected.composition){
          const composition=await native.motion({action:"inspectComposition",compId:expected.composition.id});
          layers=await native.motion({action:"listLayers",compId:expected.composition.id});
          if(!composition || !Array.isArray(layers) ||
            composition.id!==expected.composition.id)
            fail("INVALID_RECEIPT","Native composition readback is incomplete");
        }
        const after=await native.motion({action:"status"});
        if(after?.projectRevision!==before.projectRevision)
          fail("REVISION_CONFLICT","EffectCraft revision changed during inspection");
        const oldInspector=expected.inspector;
        const freshLayer=oldInspector&&layers.find(x=>x.id===oldInspector.layer.id);
        set({motion:{...expected,layers,
          inspector:freshLayer?{...oldInspector,layer:freshLayer}:null}});
        return after;
      }catch(error){
        set({needsReload:true,recoveryStudio:"motion",
          motion:{...state.motion,frame:null,inspector:null}});
        throw error;
      }
    },{studio:"motion"});
  }
  function stageAiVideoTask(actions,expectedSha) {
    requireReady("video");const v=requireVideo();
    if(!validSha(expectedSha)||expectedSha!==v.snapshot.projectSha256)
      fail("REVISION_CONFLICT","AI plan is stale before owner approval");
    let checked;
    try{checked=checkedAiVideoActions(actions);}
    catch(error){fail("UNSUPPORTED_ACTION",String(error?.message??error));}
    if(state.pendingApproval)fail("APPROVAL_PENDING","Resolve the previous proposed edit first");
    const task={id:"video-task-"+(++taskCounter),studio:"video",kind:"timeline",
      actions:clone(checked),expectedSha,projectPath:v.projectPath,selectedRoot:v.root};
    set({pendingApproval:task});
    return task;
  }
  async function approveTask(id) {
    if(!state.pendingApproval||state.pendingApproval.id!==id)fail("APPROVAL_REQUIRED","No matching owner-approved task");
    const task=clone(state.pendingApproval);
    set({pendingApproval:null});
    if(task.studio!=="video")fail("UNSUPPORTED_ACTION","Motion AI writes require native atomic revision guard");
    if(state.video?.snapshot.projectSha256!==task.expectedSha||
      state.video?.projectPath!==task.projectPath||state.video?.root!==task.selectedRoot)
      fail("REVISION_CONFLICT","Project identity or contents changed since AI action was proposed");
    return applyVideo(task.actions);
  }
  return {
    getState:()=>clone(state),subscribe(listener){listeners.add(listener);listener(clone(state));return()=>listeners.delete(listener);},
    selectStudio(studio){if(!["video","motion"].includes(studio))fail("UNSUPPORTED_STUDIO","Unknown studio");set({studio});},
    addDraft(text){if(!nonempty(text))return;state.chat.push({role:"user",text:text.trim()});
      state.chat.push({role:"assistant",text:"Draft only — AI Director is not connected; no native edit was executed."});emit();},
    stop(){if(!state.busy)return false;set({stopped:true,progress:"Stop requested; waiting for native IPC to settle"});return true;},
    dismissTask(){set({pendingApproval:null});},
    refreshVideo,verifyVideoSnapshot,applyVideo,splitVideoClip,moveVideoClip,importVideo,renderVideo,exportVideo,history,
    motionStatus,verifyMotionSnapshot,createComposition,inspectMotionLayer,editMotion,renderMotion,saveMotion,openMotion,exportMotionPng,
    stageAiVideoTask,approveTask
  };
}
