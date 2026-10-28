import test from "node:test";
import assert from "node:assert/strict";
import { allowedTaskBudget, maxTaskModelRequests, reserveTaskModelRequest } from "../src/agent/task-runtime-budget.mjs";

test("legacy bounded budgets remain bounded", () => {
  assert.equal(allowedTaskBudget(8), true);
  assert.equal(allowedTaskBudget(48), true);
  assert.equal(allowedTaskBudget(999), false);
  assert.equal(maxTaskModelRequests(8), 9);
});
test("provider calls never exceed the owner-selected budget", () => {
  const state = { max_steps: 8, model_requests_reserved: 9, task_expires_at_ms: Date.now() + 10000 };
  const res = reserveTaskModelRequest(state);
  assert.equal(res.ok, false);
});
