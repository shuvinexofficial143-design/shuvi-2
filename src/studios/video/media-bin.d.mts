import type {MediaListItem} from "./model";
export declare function mediaBinView(items:MediaListItem[],search?:string,max?:number):{
  total:number;matching:number;items:MediaListItem[]
};
export declare function mediaBinKind(item:MediaListItem):"Video"|"Audio"|"Media";
