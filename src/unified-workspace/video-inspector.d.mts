export type NativeClipInspector={
 clipId:number;itemId:number;track:string;kind:"video"|"audio";
 name:string;start:number;end:number;duration:number;locked:boolean;fps:number|null;
 sourceStartFrame:number|null;sourceDurationFrames:number|null;
};
export function nativeClipInspector(state:any,clipId:number):NativeClipInspector|null;
export function splitPreflight(inspector:NativeClipInspector|null,seconds:number):
 {ok:false;reason:string}|{ok:true;seconds:number;frame:number};
export function verifyNativeSplit(before:NativeClipInspector,afterClips:any[],seconds:number):boolean;
export function timelineSeekFromX(args:{clientX:number;laneLeft:number;laneWidth:number;sequence:any;clips:any[]}):number|null;
