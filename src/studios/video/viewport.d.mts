export type TimelineViewport=Readonly<{
  start:number;duration:number;end:number;total:number;maxStart:number;zoom:number;
}>;
export type ClipViewportBounds={
  leftPercent:number;widthPercent:number;clippedLeft:boolean;clippedRight:boolean;
};
export declare function timelineViewport(
  totalSeconds:number, zoom:number, offsetSeconds?:number
):TimelineViewport|null;
export declare function clipViewportBounds(
  clip:{start:number;duration:number}, viewport:TimelineViewport|null
):ClipViewportBounds|null;
