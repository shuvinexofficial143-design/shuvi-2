/** Exact FilmCraft/EffectCraft Tauri IPC names from PR #2 and PR #1.
 * Readiness is not inferred from submodule presence or frontend mount.
 * No arbitrary command names, shell access, or fake browser response.
 */
import { invoke } from "@tauri-apps/api/core";
import type { WorkspaceNative } from "./core.mjs";
function requireTauri():void {
  if (typeof window==="undefined" || !("__TAURI_INTERNALS__" in window)) {
    throw new Error("Native Shuvi Tauri host is not connected. Editing is unavailable.");
  }
}
async function ipc<T>(name:string,args:Record<string,unknown>):Promise<T>{
  requireTauri();
  return invoke<T>(name,args);
}
export const nativeWorkspaceBridge:WorkspaceNative = {
  videoSnapshot(root,path) {
    return ipc("video_project_snapshot",{selectedRoot:root,projectPath:path});
  },
  videoTimeline(request) {
    return ipc("video_timeline_apply",{request});
  },
  videoImport(root,path,source) {
    return ipc("video_import_media",{selectedRoot:root,projectPath:path,sourcePath:source});
  },
  videoPreview(request) {
    return ipc("video_preview_frame",{request});
  },
  videoExport(request) {
    return ipc("video_export_mp4",{request});
  },
  videoRestore(request) {
    return ipc("video_history_restore",{request});
  },
  motion(request) {
    return ipc("motion_command",{request});
  }
};
