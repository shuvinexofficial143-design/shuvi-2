// A02 deterministic, read-only review representation. No approve() or execute().
import {validateDraft} from "./contracts.mjs";
function label(action) {
  const p = action;
  switch(p.type) {
    case "video.place": return "Place verified media #"+p.itemId+" on "+p.track+" at "+p.seconds+"s";
    case "video.split": return "Split verified clip #"+p.clipId+" at "+p.seconds+"s";
    case "video.trim": return "Trim clip #"+p.clipId+" "+p.edge+" by "+p.deltaFrames+" frames";
    case "video.move": return "Move clip #"+p.clipId+" to "+p.track+" at "+p.seconds+"s";
    case "video.delete": return "Delete clip #"+p.clipId+(p.ripple?" with ripple":"");
    case "motion.createComposition": return "Create composition "+p.name+" ("+p.width+"×"+p.height+")";
    case "motion.addText": return "Add text layer "+p.name+" to composition #"+p.compId;
    case "motion.editText": return "Edit text layer #"+p.layerId+" in composition #"+p.compId;
    case "motion.addShape": return "Add "+p.kind+" shape "+p.name+" to composition #"+p.compId;
    case "motion.setTransform": return "Set "+p.kind+" on layer #"+p.layerId;
    case "motion.addEffect": return "Add "+p.effect+" to layer #"+p.layerId;
    case "motion.setMaskProperty": return "Set mask #"+p.uid+" "+p.property+" to "+p.value;
    default: throw new Error("unsupported review action");
  }
}
export function buildReviewPreview(prepared,reason) {
  if (!prepared || prepared.status !== "prepared" ||
      typeof prepared.planHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(prepared.planHash))
    throw new Error("validated prepared plan required");
  const plan = validateDraft({
    taskId:prepared.taskId,instruction:prepared.instruction ?? "AI editing proposal",
    snapshot:prepared.project,actions:prepared.actions
  });
  if (typeof reason !== "string" || !reason.trim() || reason.length > 320)
    throw new Error("valid model explanation required");
  const steps = plan.actions.map((action,i) => Object.freeze({
    number:i+1,description:label(action),type:action.type,
    requiresNativeVerification:true
  }));
  return Object.freeze({
    taskId:plan.taskId,planHash:prepared.planHash,engine:plan.snapshot.engine,
    projectId:plan.snapshot.projectId,projectVersion:plan.snapshot.version,
    sessionId:plan.snapshot.sessionId,reason,steps:Object.freeze(steps),
    approvalRequired:true,approved:false,readyForGuardedExecution:false
  });
}
