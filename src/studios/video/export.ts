import { invoke } from "@tauri-apps/api/core";
export type ExportRequest={
  selectedRoot:string;
  projectPath:string;
  expectedRevision:number;
  outputPath:string;
  scale:number;
  includeAudio:boolean;
};
export type ExportReceipt={
  projectRevision:number;
  outputPath:string;
  outputBytes:number;
  durationTicks:number;
  width:number;
  height:number;
  codec:string;
  outputProbe:unknown;
  engineReceipt:unknown;
};
/** Uses the actual FilmCraft H.264 exporter and refuses existing destinations. */
export function exportVideoMp4(request:ExportRequest):Promise<ExportReceipt>{
  return invoke<ExportReceipt>("video_export_mp4",{request});
}
