import test from 'node:test';
import assert from 'node:assert/strict';
import {checkOriginalTrees} from '../scripts/release/assert-original-source-tree.mjs';
import {readFileSync} from 'node:fs';
test('original native editor trees and canonical A08/U09 imports are byte-identical Git objects',()=>{
  const proof=checkOriginalTrees();
  assert.equal(proof.sourceIdentityVerified,true);
  assert.equal(proof.sourceTrees.length,6);
  assert.equal(proof.originalEditorsCompiled,false);
  assert.equal(proof.installedOriginalGuiVerified,false);
  assert.equal(proof.aiEditingE2eVerified,false);
  assert.equal(proof.releaseReady,false);
});
test('Windows CI parses native driver scripts before builds and does not claim original GUI release',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/release-integration.yml',import.meta.url),'utf8');
  assert.match(workflow,/Parse all installed Windows launcher scripts BEFORE expensive native build/);
  assert.match(workflow,/Language\.Parser\]::ParseFile/);
  assert.match(workflow,/assert-original-source-tree\.mjs/);
  const ps=readFileSync(new URL('../scripts/motion/run-windows-e2e.ps1',import.meta.url),'utf8');
  assert.match(ps,/\$\{webviewVersion\}: \$\(\$_\.Exception\.Message\)/);
  assert.doesNotMatch(ps,/\$webviewVersion: \$\(\$_\.Exception\.Message\)/);
});

test('original Motion owner text mutation and exclusion must use real native egui Rust tests',()=>{
  const wf=readFileSync(new URL('../.github/workflows/original-native-source-verify.yml',import.meta.url),'utf8');
  const native=readFileSync(new URL('../original-editors/Shuvi2-Motion/crates/ui-egui/src/shuvi_motion_owner.rs',import.meta.url),'utf8');
  const gate=readFileSync(new URL('../original-editors/Shuvi2-Motion/crates/ui-egui/src/shuvi_owner_gate.rs',import.meta.url),'utf8');
  assert.match(wf,/original-effectcraft-native-text-owner:/);
  assert.match(wf,/shuvi_motion_owner::tests/);
  assert.match(wf,/shuvi_owner_gate::tests/);
  assert.match(wf,/apply-reviewed-native-overlays\.mjs motion/);
  assert.ok(wf.lastIndexOf('Verify original EffectCraft owner source is EXACT upstream Git tree')<wf.lastIndexOf('Apply reviewed source-only EffectCraft owner-gate result type repair'));
  for(const test of ['creates_and_edits_actual_native_text_properties','no_duplicate_same_value_text_write','stale_revision_refuses_without_native_edit','chat_has_no_production_owner_permit'])assert.ok(native.includes(test),test);
  for(const test of ['guarded_exclusivity_blocks_actual_manual_mutation_without_bypass','real_native_manual_menu_and_control_share_exact_one_owner'])assert.ok(gate.includes(test),test);
});
