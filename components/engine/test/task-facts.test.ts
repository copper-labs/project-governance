import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, symlinkSync, mkdirSync, rmSync, renameSync } from "node:fs";
import { join } from "node:path";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath, workContext } from "../../harness/src/store/location.ts";
import { readTaskFacts, resolvePlanReference, renderTaskFacts } from "../src/task-facts.ts";
import { resolveTaskContext } from "../src/decision-task-binding.ts";
import { authorizeAction, proposeAction } from "../../harness/src/ops/actions.ts";
import { defaultPolicy } from "../../harness/src/ops/authority.ts";
import { WorkflowStore } from "../src/workflow-store.ts";
import { digest } from "../src/core.ts";
import { fixture, path, runFixtureCheck } from "./fixtures/plan-progress.ts";

test("real task and plan progress remain separate from proof, and observation performs no writes", () => {
  const f = fixture(), database = defaultDbPath(f.root), store = new Store(database);
  try {
    writeFileSync(join(f.root, path), f.current().content.replace("Current/next: original.\n",
      "<!-- governance:notes progress -->\nCurrent/next: original.\n<!-- /governance:notes progress -->\n"));
    const ref = resolvePlanReference(f.root, path, "B1"), where = workContext(f.root);
    const task = store.createTask("Repair reconnect without losing cleanup", [{ kind: "plan-reference", provenance: "operator", body: JSON.stringify(ref) },
      { kind: "scope", provenance: "operator", body: f.root }, { kind: "acceptance", provenance: "operator", body: "Preserve cleanup evidence" }], { worktree: f.root });
    const attempt = store.bind(task.taskId, "long-lived-chat", store.workspace(where.locator, f.root), f.root);
    store.checkpoint(task.taskId, { attemptId: attempt.attemptId, summary: "Implementation is ready; proof has not run", next: "Run the narrow reconnect test", evidenceIds: [], subject: null });
    const before = store.exportJson(), planBefore = readFileSync(join(f.root, path));
    const facts = readTaskFacts(f.root, "long-lived-chat");
    assert.equal(facts.association.status, "associated"); assert.equal(facts.association.taskId, task.taskId);
    assert.equal(facts.plan?.status, "linked"); assert.deepEqual(facts.checks, []);
    assert.equal(facts.checkpoint?.attemptId, attempt.attemptId); assert.match(String(facts.checkpoint?.provenance), /caller-declared/);
    const { exportedAt: _beforeTime, ...beforeRows } = before;
    const { exportedAt: _afterTime, ...afterRows } = store.exportJson();
    assert.deepEqual(afterRows, beforeRows); assert.deepEqual(readFileSync(join(f.root, path)), planBefore);
    assert.equal(readTaskFacts(f.root, "other-chat").association.status, "session-unbound");
    const current = f.current();
    f.update({ version: 1, expected_digest: current.digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] });
    const progressed = readTaskFacts(f.root, "long-lived-chat");
    assert.equal(progressed.plan?.status, "linked");
    const items = (progressed.plan?.progress as { items: Array<{ id: string; completed: boolean }> }).items;
    assert.equal(items.find(item => item.id === "B1.I")?.completed, true);
    assert.equal(items.find(item => item.id === "B1.V")?.completed, false);
    assert.deepEqual(progressed.checks, []);
    writeFileSync(join(f.root, path), f.current().content.replace("Current/next: original.", "Current/next: run the narrow proof once."));
    const noted = readTaskFacts(f.root, "long-lived-chat");
    assert.equal(noted.plan?.status, "linked");
    assert.notEqual(noted.plan?.observed_file_digest, progressed.plan?.observed_file_digest);
    assert.deepEqual(noted.plan?.progress, { ...progressed.plan?.progress as object, plan_digest: f.current().digest });
    writeFileSync(join(f.root, path), readFileSync(join(f.root, path), "utf8").replace("Keep this exact prose", "Change the cleanup rule"));
    const stale = readTaskFacts(f.root, "long-lived-chat");
    assert.equal(stale.plan?.status, "definition-stale"); assert.equal(stale.plan?.progress, undefined);
    assert.ok(stale.unavailable.includes("plan-definition-stale"));
    assert.equal(readTaskFacts(f.root, "long-lived-chat", { expected: { taskId: "other", revision: "1" } }).association.status, "association-changed-during-preparation");
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("blocked and terminal progress is readable without making it executable or guessing a sibling", () => {
  const f = fixture(), store = new Store(defaultDbPath(f.root));
  try {
    const workspace = store.workspace(workContext(f.root).locator, f.root);
    let task = store.createTask("Finish the owned batch", [], { worktree: f.root });
    store.bind(task.taskId, "status-chat", workspace, f.root);
    for (const status of ["needs-input", "accepted", "cancelled"] as const) {
      task = store.reviseTask(task.taskId, [], { expectedVersion: task.version, status, authorityRef: "operator:fixture" });
      const facts = readTaskFacts(f.root, "status-chat");
      assert.equal(facts.task?.status, status); assert.equal(facts.association.status, "historical-bound-revision");
      assert.equal(facts.association.boundRevision, 1); assert.equal(facts.association.observedRevision, task.version);
      assert.equal(resolveTaskContext(f.root, { session: "status-chat" }).context, null);
      assert.equal(facts.plan, undefined); assert.ok(facts.unavailable.includes("plan-not-linked"));
    }
    const sibling = join(f.directory, "sibling");
    f.git("worktree", "add", "-qb", "sibling", sibling);
    assert.equal(readTaskFacts(sibling, "status-chat").association.status, "workspace-unbound");
    const fork = store.forkTask(task.taskId, { worktree: sibling });
    assert.equal(fork.items.some(item => item.kind === "plan-reference" && !item.revoked), false);
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("plan reference rejects absent batch, unstructured documents and symlink escapes", () => {
  const f = fixture();
  try {
    assert.throws(() => resolvePlanReference(f.root, path, "other"), /Unknown implementation batch/);
    mkdirSync(join(f.root, "docs/exec-plans/other"));
    writeFileSync(join(f.root, "docs/exec-plans/other/unstructured.md"), "# Ordinary plan\n");
    assert.throws(() => resolvePlanReference(f.root, "docs/exec-plans/other/unstructured.md", "B1"), /governance-plan/);
    symlinkSync(f.directory, join(f.root, "docs/exec-plans/escape"));
    assert.throws(() => resolvePlanReference(f.root, "docs/exec-plans/escape/private.md", "B1"), /symlink/);
    assert.throws(() => resolvePlanReference(f.root, "../private.md", "B1"), /unsafe/);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test("packet reduction keeps exact association and explicitly reports omitted facts", () => {
  const facts = { version: 1 as const, observed_at: "2026-10-05", association: { status: "associated", taskId: "exact-task", boundRevision: 1, observedRevision: 1 },
    task: { outcome: "long ".repeat(8000) }, plan: { status: "linked", path, batch: "B1", observed_file_digest: "original" }, unavailable: [], omitted: [] };
  const reduced = renderTaskFacts(facts, 1500);
  assert.match(reduced, /exact-task/); assert.match(reduced, /task-facts-packet-space/); assert.match(reduced, /plan.md/);
  assert.ok(Buffer.byteLength(reduced) <= 1500);
});

test("reference-only facts retain recorded status, original identities and honest limitations", () => {
  const facts = { version: 1 as const, observed_at: "2026-10-06", association: { status: "historical-bound-revision", taskId: "original-task",
    attemptId: "original-attempt", boundRevision: 2, observedRevision: 3 },
    task: { outcome: "The original task.", status: "accepted", mode: "single", acceptance_authority: "host-reported, not independently authenticated",
      execution_permission: "not granted by this snapshot" },
    plan: { status: "definition-stale", path, batch: "B1", recorded_definition_digest: "sha256:old", observed_definition_digest: "sha256:new", observed_file_digest: "sha256:current" },
    checkpoint: { checkpointId: "original-checkpoint", taskVersion: 2, attemptId: "original-attempt", summary: "A historical statement, not proof.",
      next: "Inspect the current original.", applicability: "historical-or-other-attempt", provenance: "caller-declared; not executed proof" },
    unavailable: ["plan-definition-stale"], omitted: ["Earlier results were not inspected."] };
  const parse = (text: string) => JSON.parse(text.split("\n")[1]!);
  assert.deepEqual(parse(renderTaskFacts(facts, 10000)), facts, "Default rendering includes the complete snapshot when it fits");
  const text = renderTaskFacts(facts, 10000, "references"), reduced = parse(text);
  assert.deepEqual(reduced.association, facts.association); assert.equal(reduced.task.status, "accepted");
  assert.equal(reduced.task.execution_permission, facts.task.execution_permission);
  assert.equal(reduced.task.acceptance_authority, facts.task.acceptance_authority);
  assert.equal(reduced.plan.status, "definition-stale"); assert.equal(reduced.plan.recorded_definition_digest, "sha256:old");
  assert.equal(reduced.plan.observed_definition_digest, "sha256:new"); assert.equal(reduced.plan.progress, undefined);
  assert.equal(reduced.checkpoint.checkpointId, facts.checkpoint.checkpointId); assert.equal(reduced.checkpoint.summary, undefined);
  assert.equal(reduced.unavailable_summary.original_digest, digest(facts.unavailable)); assert.equal(reduced.unavailable_summary.other_count, 1);
  assert.ok(reduced.unavailable.includes("task-facts-packet-space"));
  assert.equal(reduced.omitted_summary.original_digest, digest(facts.omitted)); assert.match(reduced.omitted.join(" "), /required guidance and selected evidence/);
  const bounded = renderTaskFacts({ ...facts, unavailable: ["Unknown original result: ".repeat(100)] }, 1200, "references"), minimal = parse(bounded);
  assert.ok(Buffer.byteLength(bounded) <= 1200); assert.deepEqual(minimal.association, facts.association);
  assert.equal(minimal.task.status, "accepted"); assert.equal(minimal.task.execution_permission, facts.task.execution_permission);
  assert.equal(minimal.plan, undefined); assert.equal(minimal.plan_status, facts.plan.status); assert.match(minimal.omitted.join(" "), /Full task details were omitted/);
  assert.equal(renderTaskFacts(facts, 0, "references"), "");
});

test("reference and minimal facts count real 15 and 64 action workflow gaps without copying growing original lists", () => {
  const f = fixture(), database = defaultDbPath(f.root), store = new Store(database);
  try {
    const workflows = new WorkflowStore(database); workflows.close();
    const task = store.createTask("Repair reconnect cleanup after its owner responds.", [
      { kind: "scope", provenance: "operator", body: f.root }], { worktree: f.root });
    store.bind(task.taskId, "mature-chat", store.workspace(workContext(f.root).locator, f.root), f.root);
    const policy = defaultPolicy(), request = { operation: "check" as const, scope: [f.root], targets: [], destination: null, policyRevision: policy.revision };
    const parse = (text: string) => JSON.parse(text.split("\n")[1]!);
    const snapshots = [];
    for (let index = 0; index < 64; index++) {
      const action = authorizeAction(store, proposeAction(store, task.taskId, request), request, policy, f.root);
      assert.equal(action.status, "authorized");
      if (index === 14 || index === 63) snapshots.push(readTaskFacts(f.root, "mature-chat"));
    }
    const presentations = snapshots.map(facts => {
      const original = digest(facts), count = facts.actions!.length;
      assert.equal(facts.unavailable.filter(reason => reason.startsWith("workflow-not-observed-in-window:")).length, count);
      assert.deepEqual(parse(renderTaskFacts(facts, Number.MAX_SAFE_INTEGER)), facts, "Full workflow-unknown originals stay exact");
      const text = renderTaskFacts(facts, 14000, "references"), reduced = parse(text);
      assert.deepEqual(reduced.unavailable_summary, { original_count: facts.unavailable.length, original_digest: digest(facts.unavailable),
        workflow_not_observed_actions: count, other_count: facts.unavailable.length - count });
      assert.deepEqual(reduced.omitted_summary, { original_count: facts.omitted.length, original_digest: digest(facts.omitted) });
      assert.ok(reduced.unavailable.includes("unavailable-details-in-original-snapshot"));
      assert.ok(reduced.omitted.some((reason: string) => reason.includes("required guidance and selected evidence")));
      assert.ok(!text.includes("workflow-not-observed-in-window:")); assert.equal(digest(facts), original);
      return text;
    });
    assert.equal(Buffer.byteLength(presentations[0]!), Buffer.byteLength(presentations[1]!), "15 to 64 originals must not grow the compact reservation");
    const many = { ...snapshots[1]!, plan: { status: "definition-stale", path: "p".repeat(10000) },
      unavailable: [...snapshots[1]!.unavailable, ...Array.from({ length: 400 }, (_, index) => `Unknown original ${index}: ` + "x".repeat(400))],
      omitted: Array.from({ length: 400 }, (_, index) => `Retained limitation ${index}: ` + "y".repeat(400)) };
    const minimalText = renderTaskFacts(many, 1400, "references"), minimal = parse(minimalText);
    assert.ok(Buffer.byteLength(minimalText) <= 1400); assert.deepEqual(minimal.association, many.association);
    assert.equal(minimal.task.status, many.task!.status); assert.equal(minimal.plan, undefined);
    assert.equal(minimal.unavailable_summary.original_count, many.unavailable.length);
    assert.equal(minimal.unavailable_summary.original_digest, digest(many.unavailable));
    assert.equal(minimal.unavailable_summary.workflow_not_observed_actions, 64);
    assert.equal(minimal.omitted_summary.original_digest, digest(many.omitted));
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});

test("prompt facts defer detailed historical proof, preserve attribution, deadline and missing-plan states", async () => {
  const f = fixture(), store = new Store(defaultDbPath(f.root));
  try {
    const reference = resolvePlanReference(f.root, path, "B1"), task = store.createTask("Finish the declared batch", [
      { kind: "plan-reference", provenance: "operator", body: JSON.stringify(reference) }], { worktree: f.root });
    store.bind(task.taskId, "proof-chat", store.workspace(workContext(f.root).locator, f.root), f.root);
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] });
    const check = await runFixtureCheck(f); assert.equal(check.status, "passed");
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.V", completed: true, run_id: check.run_id }] });
    const facts = readTaskFacts(f.root, "proof-chat", { runsRoot: join(f.directory, "runs"), qualifyHistoricalChecks: false });
    assert.equal(facts.checks?.[0]?.qualification, "original-outcome-only");
    assert.equal(facts.checks?.[0]?.task_attribution, "original-task-binding-unavailable");
    assert.equal(facts.checks?.[0]?.current_candidate_freshness, "unknown");
    const expired = readTaskFacts(f.root, "proof-chat", { runsRoot: join(f.directory, "runs"), deadlineAt: performance.now() - 1 });
    assert.equal(expired.checks?.[0]?.qualification, "qualification-deferred-deadline");
    mkdirSync(join(f.root, "docs/exec-plans/completed"));
    renameSync(join(f.root, path), join(f.root, "docs/exec-plans/completed/plan.md"));
    assert.ok(readTaskFacts(f.root, "proof-chat").unavailable.includes("plan-missing"));
  } finally { store.close(); rmSync(f.directory, { recursive: true, force: true }); }
});
