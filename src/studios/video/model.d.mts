export type MediaListItem={itemId:number;name:string;type:string};
export type EditorClip={clipId:number;itemId:number;name:string;track:string;kind:"video"|"audio";start:number;duration:number;startFrame:number;durationFrames:number};
export declare const TICKS_PER_SECOND:number;
export declare function mediaItems(project:unknown):MediaListItem[];
export declare function timelineClips(sequence:unknown):EditorClip[];
export declare function sequenceDuration(sequence:unknown):number;
export declare function formatTimecode(seconds:number):string;
export declare function localWindowsPath(value:string):boolean;
export declare function requireNumber(value:unknown,min:number,max:number):number;
