export function studioRecovery(state:any,studio:"video"|"motion"):boolean;
export function workspaceActionAvailable(state:any,action:string,selection?:{
 clipId?:number|null;layerId?:number|null;effectUid?:number|null;maskUid?:number|null;
}):boolean;
