import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store/store.ts";
import { authorizeAction, proposeAction } from "../src/ops/actions.ts";
import { defaultPolicy, type AuthorityRequest } from "../src/ops/authority.ts";
import { runCheck } from "../src/ops/execution.ts";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "harness-exec-"));
  const store = new Store(":memory:");
  const task = store.createTask("verify the check", [
    { kind: "scope", provenance: "operator", body: root },
  ]);
  const req: AuthorityRequest = {
    operation: "check", scope: [root], destination: null,
    policyRevision: "policy-1", targets: [root],
  };
  let action = proposeAction(store, task.taskId, req);
  action = authorizeAction(store, action, req, defaultPolicy(), root);
  return { root, store, task, action };
}

test("a passing check records what it establishes, and no more", () => {
  const { root, store, task, action } = setup();
  const r = runCheck(store, action, {
    claim: "the suite passes", command: "true", args: [], cwd: root, subject: "sha256:abc",
  });
  assert.equal(r.exitCode, 0);
  assert.equal(r.evidence?.confirmation, "confirmed");
  assert.match(r.evidence?.establishes ?? "", /not acceptance of the task/,
    "passing checks are not acceptance");
  assert.match(r.evidence?.establishes ?? "", /sha256:abc/, "evidence is attributed to its subject");
  assert.equal(store.readAction(action.actionId)?.status, "completed");
  assert.equal(store.listEvidence(task.taskId).length, 1);
  store.close();
});

test("a failing check is refuted, not merely unconfirmed", () => {
  const { root, store, action } = setup();
  const r = runCheck(store, action, {
    claim: "the suite passes", command: "false", args: [], cwd: root, subject: "sha256:abc",
  });
  assert.notEqual(r.exitCode, 0);
  assert.equal(r.evidence?.confirmation, "refuted");
  store.close();
});

test("a check that does not finish establishes nothing", () => {
  const { root, store, action } = setup();
  const r = runCheck(store, action, {
    claim: "the slow suite passes", command: "sleep", args: ["5"], cwd: root,
    subject: "sha256:abc", timeoutMs: 150,
  });
  assert.equal(r.timedOut, true);
  assert.equal(r.evidence?.confirmation, "unconfirmed", "a timeout confirms nothing either way");
  assert.match(r.evidence?.establishes ?? "", /nothing/);
  store.close();
});

test("a receipt is kept and is content-addressed", () => {
  const { root, store, action } = setup();
  const r = runCheck(store, action, {
    claim: "echo works", command: "echo", args: ["hello"], cwd: root, subject: "sha256:abc",
  });
  const receipt = store.readArtifact(r.receiptArtifactId);
  assert.ok(receipt);
  assert.equal(receipt?.kind, "receipt");
  assert.equal(receipt?.provenance, "observed");
  assert.match(receipt?.artifactId ?? "", /^sha256:/);
  assert.match(receipt?.inline ?? "", /hello/);
  store.close();
});

test("execution is instrumented from the first run", () => {
  const { root, store, task, action } = setup();
  runCheck(store, action, { claim: "c", command: "true", args: [], cwd: root, subject: null });
  const totals = store.usageTotals(task.taskId);
  assert.equal(totals.calls, 1, "usage is emitted, not reconstructed later");
  assert.ok(totals.durationMs >= 0);
  store.close();
});

test("the action passes through prepared and in-progress on its way to completed", () => {
  const { root, store, action } = setup();
  const before = store.readAction(action.actionId)!;
  runCheck(store, action, { claim: "c", command: "true", args: [], cwd: root, subject: null });
  const after = store.readAction(action.actionId)!;
  assert.equal(after.status, "completed");
  assert.equal(after.revision, before.revision + 3, "prepared, in-progress, completed");
  assert.ok(after.reconcile, "a reconciliation method was recorded before the effect");
  store.close();
});
