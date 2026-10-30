/**
 * U04: opt-in local project-path bookmarks. NEVER store engine state,
 * project hashes, chat, approval tokens or a claimed native success.
 * Restoring only returns owner-selected paths; caller must re-read native disk.
 */
export const RECENT_PROJECTS_KEY="shuvi2.unified.recent-projects.v1";
const drive=/^[a-zA-Z]:\\[^\r\n\u0000-\u001f\u007f]*$/;
const unc=/^\\\\[^\\\/\r\n]+\\[^\\\/\r\n]+(?:\\[^\r\n]+)?$/;
function path(value,extension=null){
  if(typeof value!=="string"||value.length>1024||value!==value.trim()||
     !(drive.test(value)||unc.test(value))||value.includes("..\\")||
     value.includes("\\.\\")||value.includes("/"))throw Error("Owner-selected absolute Windows path required");
  if(extension&&!value.toLowerCase().endsWith(extension))throw Error("Project must have "+extension+" extension");
  return value;
}
function basename(value){
  if(typeof value!=="string"||value.length>180||value!==value.trim()||
    !/^[^\\/:*?"<>|\u0000-\u001f\u007f]+\.ecproj$/i.test(value)||
    value==="."||value==="..")throw Error("Safe native .ecproj basename required");
  return value;
}
function checked(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||raw.version!==1)
    throw Error("Unsupported saved project bookmark");
  const result={version:1};
  if(raw.video){
    if(typeof raw.video!=="object"||Array.isArray(raw.video))throw Error("Invalid Video bookmark");
    result.video={root:path(raw.video.root),projectPath:path(raw.video.projectPath,".fcproj")};
  }
  if(raw.motion){
    if(typeof raw.motion!=="object"||Array.isArray(raw.motion))throw Error("Invalid Motion bookmark");
    result.motion={workspace:path(raw.motion.workspace),basename:basename(raw.motion.basename)};
  }
  if(!result.video&&!result.motion)throw Error("No verified project bookmark");
  return result;
}
export function createProjectSessionStore(storage){
  if(!storage||typeof storage.getItem!=="function"||
    typeof storage.setItem!=="function"||typeof storage.removeItem!=="function")
    throw Error("Local project bookmark storage unavailable");
  function load(){
    try {
      const json=storage.getItem(RECENT_PROJECTS_KEY);
      if(typeof json!=="string"||json.length>6000)return null;
      return checked(JSON.parse(json));
    }catch{return null;}
  }
  function update(change){
    const next=checked({...load(),...change,version:1});
    const written=JSON.stringify(next);
    storage.setItem(RECENT_PROJECTS_KEY,written); // errors propagate; don't imply persistence
    return next;
  }
  return {
    load,
    rememberVideo(root,projectPath){
      return update({video:{root:path(root),projectPath:path(projectPath,".fcproj")}});
    },
    rememberMotion(workspace,name){
      return update({motion:{workspace:path(workspace),basename:basename(name)}});
    },
    forget(){storage.removeItem(RECENT_PROJECTS_KEY);}
  };
}
