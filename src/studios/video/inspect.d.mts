export type RealClipDetail={
 clipId:number;kind:"video"|"audio";track:string;itemId:number|null;
 name:string;start:number;duration:number;end:number;
 sourceIn:number|null;sourceOut:number|null;startFrame:number|null;
 durationFrames:number|null;speed:number|null;reverse:boolean;
 enabled:boolean;gainDb:number|null;effectCount:number;locked:boolean;
};
export type RealSequenceMarker={id:number;start:number;duration:number;
 name:string;comment:string;kind:string;color:string};
export declare function realClipDetail(sequence:unknown,clipId:number):RealClipDetail|null;
export declare function realSequenceMarkers(sequence:unknown):RealSequenceMarker[];
export declare function revealTimeOffset(time:number,viewport:{
 start:number;end:number;duration:number;maxStart:number
}):number|null;
