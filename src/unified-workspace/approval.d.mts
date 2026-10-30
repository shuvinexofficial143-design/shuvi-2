export function describeApprovalState(state:{
 studio:"video"|"motion";video:any;motion:any;pendingApproval:any;
 needsReload:boolean;recoveryStudio:"video"|"motion"|null;busy:boolean
}):{eligible:boolean;reason:string;nativeGuarded:false;taskId?:string;actionCount?:number};
