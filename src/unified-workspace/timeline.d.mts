export function nativeFps(sequence:any):number|null;
export function visibleTimelineSeconds(sequence:any,clips:{start:number;duration:number}[]):number;
export function moveDestination(args:{start:number;deltaX:number;laneWidth:number;visibleSeconds:number;duration:number;fps:number}):number|null;
export function verifyNativeMove(clips:{clipId:number;track:string;start:number}[],clipId:number,track:string,seconds:number,fps:number):boolean;
