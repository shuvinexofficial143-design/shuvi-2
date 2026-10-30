export class WorkspaceError extends Error { code: string; constructor(code:string,message:string); }
export type VideoAction =
 | {type:"createSequence";name:string;width:number;height:number;fps:number}
 | {type:"place";itemId:number;track:string;seconds:number;video:boolean;audio:boolean}
 | {type:"split";clipId:number;seconds:number}
 | {type:"trim";clipId:number;edge:"in"|"out";ripple:boolean;deltaFrames:number}
 | {type:"move";clipId:number;track:string;seconds:number;insert:boolean}
 | {type:"delete";clipId:number;ripple:boolean}
 | {type:"undo"|"redo"};
export type WorkspaceNative = {
 videoSnapshot(root:string,path:string):Promise<any>;
 videoTimeline(request:unknown):Promise<any>;
 videoImport(root:string,path:string,source:string):Promise<any>;
 videoPreview(request:unknown):Promise<any>;
 videoExport(request:unknown):Promise<any>;
 videoRestore(request:unknown):Promise<any>;
 motion(request:Record<string,unknown>):Promise<any>;
};
export type WorkspaceState = {
 studio:"video"|"motion";busy:boolean;progress:string;error:string|null;
 stopped:boolean;needsReload:boolean;recoveryStudio:"video"|"motion"|null;recoveryByStudio:{video:boolean;motion:boolean};
 videoGeneration:number;motionGeneration:number;
 verificationHistory:{id:number;studio:"video"|"motion";label:string;outcome:string;code:string|null}[];
 video:any;videoFrame:any;exportReceipt:any;
 motion:{ready:boolean;revision:number|null;composition:any;layers:any[];frame:any;dirty:boolean;inspector:null|{layer:any;effects:any[];masks:any[];revision:number}};
 pendingApproval:any;
 chat:{role:"assistant"|"user";text:string}[];
};
export function clipsFromSequence(sequence:any):{clipId:number;itemId:number;name:string;kind:string;track:string;start:number;duration:number}[];
export function createWorkspaceController(native:WorkspaceNative):{
 getState():WorkspaceState;subscribe(listener:(state:WorkspaceState)=>void):()=>void;
 selectStudio(studio:"video"|"motion"):void;addDraft(text:string):void;
 stop():boolean;dismissTask():void;
 refreshVideo(root:string,path:string):Promise<any>;verifyVideoSnapshot():Promise<any>;
 applyVideo(actions:VideoAction[]):Promise<any>;splitVideoClip(clipId:number,seconds:number):Promise<any>;moveVideoClip(clipId:number,track:string,seconds:number):Promise<any>;importVideo(source:string):Promise<any>;
 renderVideo(seconds:number,scale?:number):Promise<any>;
 exportVideo(path:string,scale?:number,includeAudio?:boolean):Promise<any>;
 history(direction:"undo"|"redo"):Promise<any>;
motionStatus():Promise<any>;verifyMotionSnapshot():Promise<any>;createComposition(spec:Record<string,unknown>):Promise<any>;
 inspectMotionLayer(layerId:number):Promise<any>;
 editMotion(request:Record<string,unknown>):Promise<any>;
 renderMotion(time?:number,transparent?:boolean):Promise<any>;
 saveMotion(workspace:string,basename:string):Promise<any>;
 openMotion(workspace:string,basename:string):Promise<any>;
 exportMotionPng(workspace:string,filename:string,time?:number):Promise<any>;
 stageAiVideoTask(actions:VideoAction[],expectedSha:string):any;
 approveTask(id:string):Promise<any>;
};
