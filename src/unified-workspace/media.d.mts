export type NativeMediaItem={id:number;name:string;location:string};
export function projectMediaItems(project:unknown):NativeMediaItem[];
export function selectedNativeMedia(project:unknown,id:string):NativeMediaItem;
