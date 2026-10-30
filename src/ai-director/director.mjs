// A01 task-scoped AI Director. Not connected to any engine until integration supplies
// a trusted owner-scoped adapter, durable journal and actual UI approval gateway.
import {validateDraft, validateSnapshot, sameSnapshot, advancedSnapshot, safeClone} from "./contracts.mjs";
import {planDigest} from "./plan-digest.mjs";

// Deterministic canonical SHA-256 shared with the independently validating
// native Rust reservation layer, including Unicode, array order and field order.
const digest = planDigest;
function checkPorts(adapter, approval, journal) {
  if (typeof adapter?.readSnapshot !== "function" || typeof adapter?.executeGuarded !== "function") {
    throw new Error("trusted native editor adapter required");
  }
  if (typeof approval?.request !== "function") throw new Error("trusted human approval gateway required");
  if (typeof journal?.append !== "function" || typeof journal?.reserve !== "function") throw new Error("durable audit journal with atomic task reservation required");
}
function view(task) {
  return safeClone({
    taskId: task.plan.taskId, status: task.status, planHash: task.hash,
    project: task.plan.snapshot, actions: task.plan.actions,
    instruction:task.plan.instruction,
    receipts: task.receipts, error: task.error ?? null
  });
}
export class AiDirector {
  #tasks = new Map();
  #adapter;
  #approval;
  #journal;
  constructor({adapter, approval, journal}) {
    checkPorts(adapter, approval, journal);
    this.#adapter = adapter;
    this.#approval = approval;
    this.#journal = journal;
  }
  get(taskId) {
    const task = this.#tasks.get(taskId);
    return task ? view(task) : null;
  }
  async prepare({taskId, instruction, actions, expectedSnapshot}) {
    if (this.#tasks.has(taskId)) throw new Error("duplicate task id; original task cannot be replayed");
    // Snapshot is trusted native state, not part of the language model output.
    const snapshot = validateSnapshot(await this.#adapter.readSnapshot());
    if (expectedSnapshot && !sameSnapshot(snapshot, validateSnapshot(expectedSnapshot))) {
      throw new Error("STALE_PROJECT_DURING_PREPARE: native project changed before plan reservation");
    }
    const plan = validateDraft({taskId, instruction, snapshot, actions});
    const hash = await digest(plan);
    const task = {plan, hash, status:"prepared", receipts:[], error:null, cancel:false, inFlight:false, intentLogged:false};
    // reserve() must atomically persist this task ID; restart may not re-approve it.
    // The native journal needs the ENTIRE validated draft to independently
    // recompute the plan hash. Project-only reservation is not authorization.
    const reserved = await this.#journal.reserve({
      taskId, planHash:hash, project:plan.snapshot, plan:safeClone(plan)
    });
    if (reserved !== true) throw new Error("task already reserved in durable journal");
    await this.#journal.append({event:"prepared", taskId, planHash:hash, project:plan.snapshot});
    this.#tasks.set(taskId, task);
    return view(task);
  }
  cancel(taskId) {
    const task = this.#tasks.get(taskId);
    if (!task) return false;
    if (["complete","denied","blocked","cancelled","uncertain"].includes(task.status)) return false;
    task.cancel = true;
    // Running native calls cannot be assumed cancelled; wait for their receipt.
    if (task.status === "prepared") task.status = "cancelled";
    return true;
  }
  async run(taskId) {
    const task = this.#tasks.get(taskId);
    if (!task) throw new Error("unknown task");
    if (task.status !== "prepared") throw new Error("task already consumed; no second approval or execution");
    task.status = "awaiting_approval";  // synchronous single-flight guard
    try {
      // Only an owner-operated UI may implement request(). AI text must never mint consent.
      const proof = await this.#approval.request({
        taskId, planHash:task.hash, project:task.plan.snapshot,
        actions:safeClone(task.plan.actions), instruction:task.plan.instruction
      });
      if (task.cancel) {
        task.status = "cancelled";
        await this.#journal.append({event:"cancelled_before_edit",taskId});
        return view(task);
      }
      if (proof?.granted !== true || proof.taskId !== taskId || proof.planHash !== task.hash) {
        task.status = "denied";
        await this.#journal.append({event:"approval_denied",taskId});
        return view(task);
      }
      await this.#journal.append({event:"approved", taskId, planHash:task.hash});
      task.status = "approved";
      let expected = task.plan.snapshot;
      for (let i=0; i<task.plan.actions.length; i++) {
        if (task.cancel) {
          task.status = "cancelled";
          await this.#journal.append({event:"cancelled_between_steps",taskId,after:i});
          return view(task);
        }
        const current = validateSnapshot(await this.#adapter.readSnapshot());
        if (!sameSnapshot(current, expected)) {
          task.status = "blocked";
          task.error = "STALE_PROJECT: manual/other edit or session change; replan from fresh native snapshot";
          await this.#journal.append({event:"stale_block",taskId,at:i});
          return view(task);
        }
        const key = await digest({planHash:task.hash, index:i, action:task.plan.actions[i]});
        // An intent write precedes any native mutation. Crash/retry remains uncertain,
        // never silently reruns the same key.
        await this.#journal.append({event:"step_intent",taskId,index:i,key,expected});
        task.intentLogged = true;
        task.status = "running";
        task.inFlight = true;
        let nativeReceipt;
        try {
          nativeReceipt = await this.#adapter.executeGuarded({
            action:safeClone(task.plan.actions[i]), expectedSnapshot:expected,
            idempotencyKey:key, taskId, stepIndex:i
          });
        } catch (error) {
          task.status = "uncertain";
          task.error = "NATIVE_OUTCOME_UNKNOWN: " + String(error?.message ?? error);
          await this.#journal.append({event:"step_uncertain",taskId,index:i,key});
          return view(task);
        } finally {
          task.inFlight = false;
        }
        // Never trust a success flag alone: adapter must atomically guard project
        // identity, check actual native changes, then read back the project.
        if (nativeReceipt?.guarded !== true || nativeReceipt?.nativeVerified !== true ||
          nativeReceipt.idempotencyKey !== key) {
          task.status = "uncertain";
          task.error = "NATIVE_PROOF_MISSING";
          await this.#journal.append({event:"verification_missing",taskId,index:i,key});
          return view(task);
        }
        const claimed = validateSnapshot(nativeReceipt.after);
        const observed = validateSnapshot(await this.#adapter.readSnapshot());
        if (!sameSnapshot(claimed, observed) || !advancedSnapshot(expected, observed)) {
          task.status = "uncertain";
          task.error = "NATIVE_READBACK_MISMATCH";
          await this.#journal.append({event:"readback_mismatch",taskId,index:i,key});
          return view(task);
        }
        const receipt = {index:i, type:task.plan.actions[i].type, idempotencyKey:key,
          before:expected, after:observed, nativeVerified:true};
        // Durable step receipt before progressing to another edit.
        await this.#journal.append({event:"step_verified",taskId,...receipt});
        task.receipts.push(receipt);
        task.intentLogged = false;
        expected = observed;
      }
      task.status = "complete";
      await this.#journal.append({event:"complete",taskId,steps:task.receipts.length});
      return view(task);
    } catch (error) {
      if (!["uncertain","blocked","complete"].includes(task.status)) {
        // After a logged native intent, even audit/readback failures are uncertain.
        task.status = task.intentLogged ? "uncertain" : "blocked";
        task.error = String(error?.message ?? error);
      }
      return view(task);
    }
  }
}
