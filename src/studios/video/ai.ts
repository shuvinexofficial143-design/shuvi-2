import {invoke} from "@tauri-apps/api/core";

export type VideoModelRequest={
  prompt:string;
  apiKey:string|null;
  context:{
    projectSha256:string;
    clips:{clipId:number;start:number;duration:number;kind:"video"|"audio"}[];
    mediaIds:number[];
    selectedClipId:number|null;
    selectedMediaId:number|null;
  };
};
export type VideoModelProposal={
  command:string;
  reason:string;
  projectSha256:string;
  model:string;
};

/** Model proposes *one* command only; never runs FilmCraft editing. */
export async function requestVideoAiProposal(request:VideoModelRequest):Promise<VideoModelProposal>{
  return invoke<VideoModelProposal>("video_ai_propose",{request});
}
