import type {TimelineAction} from "./timeline";
export type VideoChatContext={projectSha256:string;projectPath:string;selectedRoot:string;
  clips:{clipId:number;start:number;duration:number;kind:"video"|"audio"}[];
  media:{itemId:number}[];selectedClipId:number|null;selectedMediaId:number|null;};
export type VideoChatProposal={ok:true;action:TimelineAction;summary:string;expectedProjectSha256:string;selectedRoot:string;projectPath:string};
export type VideoChatReject={ok:false;message:string};
export declare function parseVideoChat(input:string,ctx:VideoChatContext):VideoChatProposal|VideoChatReject;
