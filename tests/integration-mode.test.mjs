import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("one routed entrypoint preserves installed classic Video/Motion launch",()=>{
  const html=read("index.html"),entry=read("src/entry.ts");
  assert.match(html,/src\/entry\.ts/);
  assert.doesNotMatch(html,/<script[^>]+src="\/src\/main\.ts"/);
  assert.doesNotMatch(html,/<script[^>]+src="\/src\/studios\/motion\/bootstrap\.ts"/);
  assert.ok(entry.includes('await import("./main")'));
  assert.ok(entry.includes('await import("./studios/motion/bootstrap")'));
  assert.ok(entry.includes('await import("./desktop-ui/workspace")'));
  assert.ok(entry.includes("document.body.replaceChildren(navigation, root)"));
});
test("alternate Unified controller uses registered native commands",()=>{
  const bridge=read("src/unified-workspace/native.ts"),host=read("src-tauri/src/lib.rs");
  for(const c of ["video_project_snapshot","video_timeline_apply","video_import_media",
   "video_preview_frame","video_export_mp4","video_history_restore","motion_command"]){
    assert.ok(bridge.includes('"'+c+'"'),"Missing bridge command "+c);
    assert.ok(host.includes(c),"Missing host command "+c);
  }
  assert.match(bridge,/requireTauri\(\)/);
  assert.ok(read("src/desktop-ui/workspace.ts").includes("mountUnifiedWorkspace"));
  assert.ok(read("src/unified-workspace/core.d.mts").includes("recoveryStudio"));
});
test("AI A03 owner guard exists but native AI edits are deliberately disabled",()=>{
  const host=read("src-tauri/src/lib.rs"),provider=read("src-tauri/src/ai_director/src/lib.rs");
  assert.ok(provider.includes("CredentialVault"));
  assert.ok(read("src-tauri/src/ai_director/src/guard.rs").includes("Ledger"));
  assert.doesNotMatch(host,/ai_director_model_propose|executeGuarded/);
  assert.ok(read(".github/workflows/release-integration.yml").includes(
    "cargo test --manifest-path src-tauri/src/ai_director/Cargo.toml --all-targets"));
});
