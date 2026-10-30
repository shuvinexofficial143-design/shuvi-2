import { invoke } from "@tauri-apps/api/core";
export type VideoHistoryStatus={
  projectPath:string;projectSha256:string;
  canUndo:boolean;canRedo:boolean;depth:number;position:number;diverged:boolean;
};
export type VideoHistoryRestoreRequest={
  selectedRoot:string;projectPath:string;expectedProjectSha256:string;direction:"undo"|"redo";
};
export type VideoHistoryReceipt={
  projectSha256:string;project:unknown;sequence:unknown|null;
  backupPath:string;history:VideoHistoryStatus;
};
export function inspectVideoHistory(selectedRoot:string,projectPath:string):Promise<VideoHistoryStatus>{
  return invoke<VideoHistoryStatus>("video_history_status",{selectedRoot,projectPath});
}
export function restoreVideoHistory(request:VideoHistoryRestoreRequest):Promise<VideoHistoryReceipt>{
  return invoke<VideoHistoryReceipt>("video_history_restore",{request});
}
