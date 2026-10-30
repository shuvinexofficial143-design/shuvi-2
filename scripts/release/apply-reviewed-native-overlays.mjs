// Release-only, fail-closed overlays. HEAD retains byte-identical original owner trees.
// Apply only on a disposable CI checkout AFTER verifying original Git object IDs.
// No edit is performed inside the source owner's branch or canonical Rust runtime.
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync,mkdirSync,cpSync} from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
const sha256 = text=>createHash("sha256").update(text).digest("hex");
const hashObject = file=>execFileSync("git",["hash-object","--",file],{encoding:"utf8"}).trim();
const specs={
  motion:{
    path:"original-editors/Shuvi2-Motion/crates/ui-egui/src/panels/dialogs.rs",
    originalBlob:"0f5cb73ea7556fcb41777d39ad1767279c3c8ead",
    patches:[[
      "fn set_resolution(app: &mut EffectcraftApp, cid: u64, r: effectcraft_engine::project::Resolution) -> effectcraft_engine::Result<Value> {",
      "// Release-only compatibility fix: native manual_menu_command returns Result<Value,String>.\nfn set_resolution(app: &mut EffectcraftApp, cid: u64, r: effectcraft_engine::project::Resolution) -> Result<Value, String> {"
    ]]
  },
  ai:{
    path:"src-tauri/src/ai_director/tests/recovery_integrity.rs",
    originalBlob:"f479bf3f60e7feb47d6c89861d29ae5f7d425fde",
    patches:[[
      "use std::{fs,path::PathBuf,time::{SystemTime,UNIX_EPOCH}};",
      "use std::{fs,path::PathBuf,time::{SystemTime,UNIX_EPOCH},sync::atomic::{AtomicU64,Ordering}};\nstatic UNIQUE_A08_DB_DIRECTORY:AtomicU64=AtomicU64::new(1);"
    ],[
      "        let stamp=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();\n        let root=std::env::temp_dir().join(format!(\"shuvi-a08-{}-{stamp}\",std::process::id()));\n        fs::create_dir(&root).unwrap();Self(root)",
      "        for _ in 0..64 {\n            let stamp=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();\n            let sequence=UNIQUE_A08_DB_DIRECTORY.fetch_add(1,Ordering::Relaxed);\n            let root=std::env::temp_dir().join(format!(\"shuvi-a08-{}-{stamp}-{sequence}\",std::process::id()));\n            match fs::create_dir(&root) {\n                Ok(())=>return Self(root),\n                Err(e) if e.kind()==std::io::ErrorKind::AlreadyExists=>continue,\n                Err(e)=>panic!(\"cannot create isolated SQLite test folder: {e}\"),\n            }\n        }\n        panic!(\"cannot allocate a unique SQLite test folder\")"
    ]]
  },
  videoA07:{
    path:"original-editors/Shuvi2-Video/a07-native-bridge/tests/shared_owner_admission.rs",
    originalBlob:"75ab51d6f072ee36d92180117bea8e78d4349d80",
    patches:[[
      "        assert!(unique.insert(path));\n        assert!(!path.exists(), \"temporary SQLite folder must be cleaned up\");",
      "        assert!(unique.insert(path.clone()));\n        assert!(!path.exists(), \"temporary SQLite folder must be cleaned up\");"
    ]]
  }
};
function replaceExactlyOnce(content,before,after,file){
  const first=content.indexOf(before);
  assert.ok(first>=0,"Source anchor missing: "+file);
  assert.equal(content.indexOf(before,first+before.length),-1,"Ambiguous source anchor: "+file);
  return content.slice(0,first)+after+content.slice(first+before.length);
}
export function previewOverlay(mode,read=readFileSync){
  const item=specs[mode];assert.ok(item,"Unknown reviewed overlay: "+mode);
  const disk=read(item.path,"utf8");
  // Windows git checkouts may use CRLF, while original GitHub patch anchors
  // are LF. Normalize ONLY for matching, then restore the original EOL style.
  const wasCrLf=disk.includes("\r\n");
  const original=disk.replace(/\r\n/g,"\n");
  const blob=hashObject(item.path);
  assert.equal(blob,item.originalBlob,mode+": source diverged from pinned original Git blob");
  const normalized=item.patches.reduce((text,[from,to])=>replaceExactlyOnce(text,from,to,item.path),original);
  assert.notEqual(original,normalized,"No changes");
  const patched=wasCrLf?normalized.replace(/\n/g,"\r\n"):normalized;
  return {path:item.path,sourceBlob:blob,originalSha256:sha256(disk),patchedSha256:sha256(patched),patched};
}
export function applyOverlays(modes){
  const out=[];
  for(const mode of modes){
    const result=previewOverlay(mode);
    writeFileSync(result.path,result.patched);
    out.push({mode,path:result.path,sourceBlob:result.sourceBlob,originalSha256:result.originalSha256,patchedSha256:result.patchedSha256,modifiedWorkingTree:true});
  }
  return {releaseSourceTreeUnchanged:true,sourceBranchesUntouched:true,installedNativeGuiVerified:false,productionAiEnabled:false,releaseReady:false,overlays:out};
}
function prepareCanonicalA07(){
  const target="a07-canonical/src-tauri/src/ai_director";
  // Dependency path in the pinned original Video A07 bridge; exact A08 code,
  // copied to the position expected by its isolated Cargo manifest.
  mkdirSync(path.dirname(target),{recursive:true});
  cpSync("src-tauri/src/ai_director",target,{recursive:true,force:false,errorOnExist:true});
  return target;
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i,"$1").replace(/\//g,path.sep)){
  try{
    const modes=process.argv.slice(2).filter(x=>["motion","ai","videoA07"].includes(x));
    if(modes.length!==process.argv.length-2||new Set(modes).size!==modes.length||modes.length===0)throw Error("Usage: node apply-reviewed-native-overlays.mjs ai|motion|videoA07 [more...]");
    const proof=applyOverlays(modes);
    if(modes.includes("videoA07"))proof.canonicalA07TestDependency=prepareCanonicalA07();
    console.log(JSON.stringify(proof));
  }catch(error){console.error(error.stack||String(error));process.exitCode=1;}
}
