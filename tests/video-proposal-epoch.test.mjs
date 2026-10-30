import {test} from "node:test";
import {strict as assert} from "node:assert";
import {createVideoProposalEpoch} from "../src/studios/video/proposal-epoch.mjs";
test("model completion from a prior tab session cannot be approved",()=>{
  const session=createVideoProposalEpoch();
  const first=session.begin();
  assert.equal(session.isCurrent(first),true);
  session.invalidate(); // switch to motion, or changed project
  const second=session.begin(); // switch back and new prompt
  assert.equal(session.isCurrent(first),false);
  assert.equal(session.isCurrent(second),true);
});
test("new prompt supersedes previous async response",()=>{
  const session=createVideoProposalEpoch();
  const first=session.begin(),second=session.begin();
  assert.equal(session.isCurrent(first),false);
  assert.equal(session.isCurrent(second),true);
  session.invalidate();
  assert.equal(session.isCurrent(second),false);
});
test("stale or malformed response tokens never pass",()=>{
  const session=createVideoProposalEpoch();
  assert.equal(session.isCurrent(0),false);
  assert.equal(session.isCurrent(NaN),false);
  assert.equal(session.isCurrent(1),false);
  const current=session.begin();
  assert.equal(session.isCurrent(current),true);
  assert.equal(session.isCurrent("1"),false);
});
