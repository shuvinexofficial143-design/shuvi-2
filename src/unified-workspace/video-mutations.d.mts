import type {NativeClipInspector} from "./video-inspector.mjs";
export type TrimPreflight={ok:false;reason:string}|{ok:true;before:NativeClipInspector;
 action:{type:"trim";clipId:number;edge:"in"|"out";deltaFrames:number;ripple:boolean}};
export type DeletePreflight={ok:false;reason:string}|{ok:true;before:NativeClipInspector;
 action:{type:"delete";clipId:number;ripple:boolean}};
export function trimPreflight(state:any,clipId:number,edge:"in"|"out",deltaFrames:number,ripple?:boolean):TrimPreflight;
export function deletePreflight(state:any,clipId:number,ripple?:boolean):DeletePreflight;
export function verifyNativeTrim(before:NativeClipInspector,afterClips:any[],edge:"in"|"out"):boolean;
export function verifyNativeDelete(before:NativeClipInspector,afterClips:any[]):boolean;
