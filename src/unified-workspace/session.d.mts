export const RECENT_PROJECTS_KEY:string;
export type ProjectBookmarks={version:1;video?:{root:string;projectPath:string};motion?:{workspace:string;basename:string}};
export function createProjectSessionStore(storage:Pick<Storage,"getItem"|"setItem"|"removeItem">):{
 load():ProjectBookmarks|null;
 rememberVideo(root:string,projectPath:string):ProjectBookmarks;
 rememberMotion(workspace:string,name:string):ProjectBookmarks;
 forget():void;
};
