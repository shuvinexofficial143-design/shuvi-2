export type WorkspaceKey="undo"|"redo"|"delete"|"split"|"frame-back"|"frame-forward"|null;
export function workspaceKeyCommand(args:{key:string;ctrlKey?:boolean;metaKey?:boolean;altKey?:boolean;shiftKey?:boolean;editable?:boolean;studio?:"video"|"motion";selectedClip?:boolean}):WorkspaceKey;
