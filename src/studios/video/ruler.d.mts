import type {TimelineViewport} from "./viewport";
export type TimelineRulerTick={seconds:number;percent:number};
export declare function rulerTicks(viewport:TimelineViewport|null,maxTicks?:number):TimelineRulerTick[];
export declare function rulerSeekTime(clientX:number,rect:{left:number;width:number},
  viewport:TimelineViewport|null,fps:number):number|null;
export declare function percentOnRuler(time:number,viewport:TimelineViewport|null):number|null;
