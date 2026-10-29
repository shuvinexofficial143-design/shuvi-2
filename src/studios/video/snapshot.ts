import { invoke } from "@tauri-apps/api/core";
export type VideoProjectSnapshot={
  projectPath:string;
  projectSha256:string;
  sessionRevision:number;
  project:unknown;
  sequence:unknown|null;
};
/** Refresh after user manual edits; never reuse old SHA-256 from a stale AI plan. */
export function inspectVideoProject(selectedRoot:string,projectPath:string):Promise<VideoProjectSnapshot>{
  return invoke<VideoProjectSnapshot>("video_project_snapshot",{selectedRoot,projectPath});
}
