export function describeApprovalState(state:{
 studio:"video"|"motion";video:any;motion:any;pendingApproval:any;
 needsReload:boolean;recoveryStudio:"video"|"motion"|null;recoveryByStudio?:{video:boolean;motion:boolean};busy:boolean
}):{eligible:boolean;reason:string;nativeGuarded:false;taskId?:string;actionCount?:number};
