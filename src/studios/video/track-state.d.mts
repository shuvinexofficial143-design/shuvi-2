export type VideoTrackState={
  track:string;kind:"video"|"audio";name:string;locked:boolean;muted:boolean;
  enabled:boolean;solo:boolean;clips:number;
};
export declare function videoTrackStates(sequence:unknown):VideoTrackState[];
export declare function videoActionPreflight(
  action:{type:string;clipId?:number;track?:string},sequence:unknown
): {ok:true}|{ok:false;reason:string};
