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
