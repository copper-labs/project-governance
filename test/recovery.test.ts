import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store/store.ts";
import {
  authorizeAction, beginAction, prepareAction, proposeAction, recoverAction, recoverAll,
} from "../src/ops/actions.ts";
import { defaultPolicy, type AuthorityRequest } from "../src/ops/authority.ts";
import { RevisionConflict, type Action } from "../src/model/types.ts";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "harness-rec-"));
  const store = new Store(join(root, "state", "harness.db"));
  const task = store.createTask("write two files atomically", [
    { kind: "scope", provenance: "operator", body: root },
  ]);
  const req: AuthorityRequest = {
    operation: "check", scope: [root], destination: null,
    policyRevision: "policy-1", targets: [join(root, "one.txt")],
  };
  return { root, store, task, req, policy: defaultPolicy() };
}

/** Simulates a crash: an Action left mid-effect with only some of its outputs on disk. */
function interrupted(afterWriting: string[], root: string) {
  const { store, task, req, policy } = setup();
  let a = proposeAction(store, task.taskId, req);
  a = authorizeAction(store, a, req, policy, root);
  a = prepareAction(store, a, [join(root, "one.txt"), join(root, "two.txt")], "check both files exist");
  a = beginAction(store, a);
  for (const f of afterWriting) writeFileSync(f, "written");
  return { store, action: a };
}

test("an action prepared but never started returns to authorized", () => {
  const { root, store, task, req, policy } = setup();
  let a = proposeAction(store, task.taskId, req);
  a = authorizeAction(store, a, req, policy, root);
  a = prepareAction(store, a, ["out"], "re-run and compare");
  const resumed = recoverAction(store, a, () => {
    throw new Error("inspection must not be needed: nothing started");
  });
  assert.equal(resumed.status, "authorized");
  store.close();
});

test("a crash between two writes, with the outcome establishable, is corrected not replayed", () => {
  const root = mkdtempSync(join(tmpdir(), "harness-rec2-"));
  const { store, action } = interrupted([join(root, "one.txt"), join(root, "two.txt")], root);
  const resumed = recoverAction(store, action, (a: Action) => {
    const all = a.intendedOutputs.every((o) => existsSync(o.replace(/^.*?(\/tmp.*)$/, "$1")));
    return { established: true, completed: all, note: all ? "both outputs present" : "partial" };
  });
  assert.ok(["completed", "authorized"].includes(resumed.status));
  assert.match(resumed.refusedReason ?? "", /resumed by inspection/);
  store.close();
});

test("a crash whose outcome cannot be established becomes outcome-unknown and stops", () => {
  const root = mkdtempSync(join(tmpdir(), "harness-rec3-"));
  const { store, action } = interrupted([join(root, "one.txt")], root);
  const resumed = recoverAction(store, action, () => ({
    established: false,
    note: "one of two outputs present and the effect is not idempotent",
  }));
  assert.equal(resumed.status, "outcome-unknown", "uncertainty is retained, not resolved");
  assert.match(resumed.refusedReason ?? "", /not idempotent/);
  store.close();
});

test("an effect that succeeded with its receipt lost is not replayed on an assumption", () => {
  const root = mkdtempSync(join(tmpdir(), "harness-rec4-"));
  const { store, action } = interrupted([join(root, "one.txt"), join(root, "two.txt")], root);
  // The inspector cannot reach the remote system that would confirm the effect.
  const resumed = recoverAction(store, action, () => ({
    established: false,
    note: "remote response lost; the effect may or may not have landed",
  }));
  assert.equal(resumed.status, "outcome-unknown");
  store.close();
});

test("two resumers racing: the second does not act", () => {
  const root = mkdtempSync(join(tmpdir(), "harness-rec5-"));
  const { store, action } = interrupted([join(root, "one.txt")], root);
  const inspect = () => ({ established: true, completed: true, note: "outputs present" });
  const first = recoverAction(store, action, inspect);
  assert.equal(first.status, "completed");
  assert.throws(
    () => recoverAction(store, action, inspect),
    (e: unknown) => e instanceof RevisionConflict,
  );
  store.close();
});

test("recoverAll survives a losing racer without throwing", () => {
  const root = mkdtempSync(join(tmpdir(), "harness-rec6-"));
  const { store, action } = interrupted([join(root, "one.txt")], root);
  store.transitionAction(action.actionId, action.revision, "completed"); // another resumer won
  const results = recoverAll(store, () => ({ established: true, completed: true, note: "n/a" }));
  assert.equal(results.length, 0, "nothing is left unresolved");
  store.close();
});

test("state survives a process restart: a reopened store still holds the interruption", () => {
  const root = mkdtempSync(join(tmpdir(), "harness-rec7-"));
  const dbPath = join(root, "state", "harness.db");
  const store = new Store(dbPath);
  const task = store.createTask("survive a restart", [{ kind: "scope", provenance: "operator", body: root }]);
  const req: AuthorityRequest = {
    operation: "check", scope: [root], destination: null, policyRevision: "policy-1", targets: [root],
  };
  let a = proposeAction(store, task.taskId, req);
  a = authorizeAction(store, a, req, defaultPolicy(), root);
  a = prepareAction(store, a, [join(root, "x")], "inspect x");
  a = beginAction(store, a);
  store.close(); // the process dies here

  const reopened = new Store(dbPath);
  const unresolved = reopened.listUnresolvedActions();
  assert.equal(unresolved.length, 1, "the interrupted action is still there after a restart");
  assert.equal(unresolved[0]?.status, "in-progress");
  assert.equal(unresolved[0]?.reconcile, "inspect x", "the reconciliation method survived too");
  reopened.close();
  rmSync(root, { recursive: true, force: true });
});

test("a task revision invalidates an action authorized against the older version", () => {
  const { root, store, task, req, policy } = setup();
  const a = proposeAction(store, task.taskId, req);
  store.reviseTask(task.taskId, [{ kind: "constraint", provenance: "operator", body: "stop, do not proceed" }]);
  const decided = authorizeAction(store, a, req, policy, root);
  assert.equal(decided.status, "refused");
  assert.match(decided.refusedReason ?? "", /task revised/);
  store.close();
});
