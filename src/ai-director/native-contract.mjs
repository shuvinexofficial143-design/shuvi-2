import {validateAction, validateSnapshot} from "./contracts.mjs";

// Description only. The current native commands lack task-scoped atomic guarding.
export function describeNativeCall(action, binding) {
  const snapshot = validateSnapshot(binding?.snapshot);
  const safe = validateAction(action, snapshot.engine);
  const {type, ...parameters} = safe;
  if (snapshot.engine === "motion") {
    return {
      command: "motion_command",
      args: {request: {action: type.slice(7), ...parameters}},
      readyForGuardedExecution: false
    };
  }
  if (typeof binding.selectedRoot !== "string" || !binding.selectedRoot ||
      typeof binding.projectPath !== "string" ||
      binding.projectPath !== snapshot.projectId) {
    throw new Error("owner-selected video project binding required");
  }
  if (!Number.isSafeInteger(binding.sessionRevision) || binding.sessionRevision < 0) {
    throw new Error("trusted FilmCraft session revision required");
  }
  return {
    command: "video_timeline_apply",
    args: {request: {
      selectedRoot: binding.selectedRoot,
      projectPath: binding.projectPath,
      expectedRevision: binding.sessionRevision,
      expectedProjectSha256: snapshot.version,
      actions: [{type: type.slice(6), ...parameters}]
    }},
    readyForGuardedExecution: false
  };
}
