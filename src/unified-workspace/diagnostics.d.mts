export type NativeDiagnosticReport={
 schemaVersion:1;source:string;installationVerified:false;aiNativeTaskGuardVerified:false;
 studio:"video"|"motion";nativeOperationBusy:boolean;recoveryStudio:"video"|"motion"|null;
 recoveryByStudio:{video:boolean;motion:boolean};
 video:{status:string;projectSha256:string|null;sessionRevision:number|null;clipCount:number|null;frameReceiptPresent:boolean;exportReceiptPresent:boolean};
 motion:{status:string;projectRevision:number|null;compositionId:number|null;layerCount:number|null;dirty:boolean|null;frameReceiptPresent:boolean};
 recentEvents:{id:number;studio:string;label:string;outcome:string;code:string|null}[];
};
export function nativeDiagnosticReport(state:any):NativeDiagnosticReport;
export function nativeDiagnosticText(state:any):string;
