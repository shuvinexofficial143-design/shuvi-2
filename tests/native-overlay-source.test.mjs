import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("release-only original Motion patch maps owner error to same native command error type",()=>{
  const a=read("scripts/release/apply-reviewed-native-overlays.mjs");
  assert.match(a,/manual_menu_command returns Result<Value,String>/);
  assert.match(a,/-> Result<Value, String>/);
  assert.match(a,/originalBlob:"0f5cb73ea7556fcb41777d39ad1767279c3c8ead"/);
  assert.match(a,/hashObject\(item\.path\)/);
  assert.match(a,/Ambiguous source anchor/);
});
test("A08 SQLite test fixture collision repaired without disabling parallel native ledger",()=>{
  const a=read("scripts/release/apply-reviewed-native-overlays.mjs");
  assert.match(a,/UNIQUE_A08_DB_DIRECTORY/);
  assert.match(a,/AtomicU64/);
  assert.match(a,/create_dir\(&root\)/);
  assert.match(a,/AlreadyExists/);
  assert.doesNotMatch(a,/RUST_TEST_THREADS=1/);
});
test("A07 Video native split owner test fixed and canonical AI crate provenance still original",()=>{
  const a=read("scripts/release/apply-reviewed-native-overlays.mjs");
  assert.match(a,/unique\.insert\(path\.clone\(\)\)/);
  assert.match(a,/cpSync\("src-tauri\/src\/ai_director",target/);
  assert.match(a,/productionAiEnabled:false/);
  assert.match(a,/installedNativeGuiVerified:false/);
});
test("build CI applies source overlay only after immutable owner/source identity checked",()=>{
  const native=read(".github/workflows/original-native-source-verify.yml");
  const release=read(".github/workflows/release-integration.yml");
  assert.ok(native.indexOf("Check immutable ORIGINAL native source identity")<native.indexOf("Apply reviewed release-only native compatibility overlay"));
  assert.match(native,/apply-reviewed-native-overlays\.mjs/);
  assert.match(release,/apply-reviewed-native-overlays\.mjs ai/);
  assert.ok(release.indexOf("Validate ORIGINAL native sources")<release.indexOf("Release-only A08 test fixture"));
});

test("release-only native overlay handles Windows CRLF without changing native owner Git blob gate",()=>{
  const a=read("scripts/release/apply-reviewed-native-overlays.mjs");
  assert.match(a,/wasCrLf=disk\.includes/);
  assert.match(a,/disk\.replace\(\/\\r\\n\/g,"\\n"\)/);
  assert.match(a,/wasCrLf\?normalized\.replace/);
  assert.match(a,/assert\.equal\(blob,item\.originalBlob/);
});
