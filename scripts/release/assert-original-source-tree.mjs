// Fail-closed Git-object identity check; verifies original sources, not native GUI execution.
// Each SHA is the exact original owner's Git tree from the named source branch.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const required=[
  ['original-editors/Shuvi2-Video','ae276804a8ab1efdea33005a1a25b117d42d9119','41db019a187b2ff5c1a39dbcecf2f802f6bb1784'],
  ['original-editors/Shuvi2-Motion','9240a74ff8b3eea871f730507d20cf7820cc17d1','77010ff50de250d1c6cf9f60620c2346732bca12'],
  ['src-tauri/src/ai_director','fbe962167ba9ea4a1348fe32a2028d286ad74321','64bf23e4cb9b4c95ca88b2f07ce9d57f7c2fa3e4'],
  ['src/ai-director','725385a65f7ce1bf3398888ea7b84304ffda40d2','64bf23e4cb9b4c95ca88b2f07ce9d57f7c2fa3e4'],
  ['src/desktop-ui','7f239b808a8ac937c3fa6eb71bfa203a4450778f','d8da374be00d0714771204374cbc330687dd5090'],
  ['src/unified-workspace','d47178ff24a0ddcf5de9eb771ee4096a3fca0816','d8da374be00d0714771204374cbc330687dd5090']
];
function git(...args){
  const r=spawnSync('git',args,{encoding:'utf8'});
  if(r.status!==0)throw Error('Git tree inspection failed: '+r.stderr?.trim());
  return r.stdout.trim();
}
export function checkOriginalTrees(){
  const evidence=[];
  for(const [treePath,expected,sourceCommit] of required){
    const actual=git('rev-parse','HEAD:'+treePath);
    assert.equal(actual,expected,treePath+' differs from original source branch '+sourceCommit);
    evidence.push({treePath,expected,sourceCommit,verified:true});
  }
  const text=p=>readFileSync(p,'utf8');
  assert.match(text('original-editors/Shuvi2-Video/crates/ui-egui/Cargo.toml'),/name\s*=\s*"filmcraft-ui-egui"/);
  assert.match(text('original-editors/Shuvi2-Motion/crates/ui-egui/Cargo.toml'),/name\s*=\s*"effectcraft-ui-egui"/);
  assert.match(text('original-editors/Shuvi2-Video/a07-native-bridge/Cargo.toml'),/name\s*=\s*"shuvi-video-a07-native-bridge"/);
  assert.match(text('src-tauri/src/ai_director/Cargo.toml'),/name\s*=\s*"shuvi-ai-provider"/);
  assert.match(text('src/ai-director/director.mjs'),/native/);
  assert.match(text('src/unified-workspace/motion-proof.mjs'),/native/);
  // Source present does not enable unapproved AI edits or mean original native UI is installed.
  assert.match(text('scripts/release/verify-installed-proof.mjs'),/releaseReady:false/);
  return {sourceIdentityVerified:true,originalEditorsCompiled:false,installedOriginalGuiVerified:false,
    aiEditingE2eVerified:false,releaseReady:false,sourceTrees:evidence};
}
if(process.argv[1]&&process.argv[1].replace(/\\/g,'/').endsWith('/assert-original-source-tree.mjs')){
  try{console.log(JSON.stringify(checkOriginalTrees()));}
  catch(err){console.error(String(err.stack||err));process.exitCode=1;}
}
