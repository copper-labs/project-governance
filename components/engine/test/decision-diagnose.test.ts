import { test, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, realpathSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../../harness/src/store/store.ts";
import { proposeAction, authorizeAction } from "../../harness/src/ops/actions.ts";
import { defaultPolicy } from "../../harness/src/ops/authority.ts";
import { WorkflowStore } from "../src/workflow-store.ts";
import { resolveWorkflowRecipe } from "../src/workflow-catalog.ts";
import { recipeDigest } from "../src/workflow-types.ts";
import { durableJson, digest, fileDigest } from "../src/core.ts";
import { diagnoseWorkflow } from "../src/workflow-diagnose.ts";
import { diagnosticEpisodeId, diagnosticOperationId, resolveDiagnosticManifest } from "../src/diagnostic-manifest.ts";
import { processFingerprint } from "../src/process-owner.ts";

const originalState = process.env.XDG_STATE_HOME;
const testState = mkdtempSync(join(tmpdir(), "diagnostic-state-"));
process.env.XDG_STATE_HOME = testState;
after(() => { if (originalState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = originalState; rmSync(testState, { recursive: true, force: true }); });

function fixture(t: { after: (fn: () => void) => void }, count = 2, mode = "off", effect = "choose-read", resources: string[] = []) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "diagnostic-"))), database = join(root, "ledger.sqlite");
  const continuity = new Store(database), store = new WorkflowStore(database), policy = defaultPolicy();
  const task = continuity.createTask("diagnose a failed test", [{ kind: "scope", provenance: "operator", body: root }]);
  t.after(() => { store.close(); continuity.close(); rmSync(root, { recursive: true, force: true }); });
  const operations = Object.fromEntries(["parent", ...Array.from({ length: count }, (_, i) => `probe-${i}`)].map(id => [id,
    { argv: [process.execPath, "-e", `console.log(${JSON.stringify(id)})`], cwd: root, effect: "read" }]));
  durableJson(join(root, "config/governance/operations.json"), { version: 1, operations });
  durableJson(join(root, "config/governance/profile.yaml"), { continuity: { decisions: { mode, allowed_data_classes: ["diagnostic"], consumers: { DL05: { mode, effect } } } } });
  const rawRecipe = (id: string) => ({ version: 1, id, workspace: root, inputs: [], resources, stages: [{ id: "read", operation: id, deadlineMs: 2000 }], deadlineMs: 4000, policyRevision: policy.revision, claims: [] });
  const grant = (id: string, operationId: string) => {
    const request = { operation: "check" as const, scope: [root], targets: [], destination: null, policyRevision: policy.revision };
    const action = authorizeAction(continuity, proposeAction(continuity, task.taskId, request), request, policy, root), recipe = resolveWorkflowRecipe(rawRecipe(id));
    const binding = { taskId: task.taskId, taskVersion: task.version, actionId: action.actionId, authorityRef: "host:fixture", recipe, recipeDigest: recipeDigest(recipe), operationId };
    store.authorizeWorkflow(binding); return binding;
  };
  const parent = store.submit(grant("parent", "parent")), claimed = store.claim(parent.id, parent.revision, "parent-owner");
  store.stage(parent.id, "parent-owner", "read", "running");
  store.stage(parent.id, "parent-owner", "read", "failed", { state: "failed", exitCode: 1, cleanup: "confirmed", startedAt: "start", endedAt: "end", log: "", inputValidity: "valid", detail: "fixture failure" });
  const failed = store.transition(parent.id, "parent-owner", claimed.revision, "failed"), id = diagnosticEpisodeId(failed, "read");
  const probes = Array.from({ length: count }, (_, i) => {
    const probeId = `probe-${i}`, binding = grant(probeId, diagnosticOperationId(id, probeId));
    return { id: probeId, description: `Inspect ${i}`, recipe: rawRecipe(probeId), binding: { actionId: binding.actionId, authorityRef: binding.authorityRef, operationId: binding.operationId } };
  });
  const manifest = { version: 1, parentRunId: parent.id, stageId: "read", deadline: Date.now() + 20000, target: { kind: "workspace", id: root }, probes,
    baseline: { revision: "runbook-1", probeOrder: probes.slice(0, 3).map(probe => probe.id) } };
  const options = { workersDirectory: join(root, "workers"), registryPath: join(root, "resources.sqlite"), token: "" };
  return { root, database, store, manifest, options, parent: failed, task, continuity };
}

function schema(path: string) { const db = new DatabaseSync(path); try { return db.prepare("SELECT value FROM meta WHERE key='engine_schema'").get()!.value; } finally { db.close(); } }

test("off diagnostic runs two native reads, preserves parent failure and never replays children", async t => {
  const f = fixture(t);
  assert.equal(schema(f.database), "2");
  const result = await diagnoseWorkflow(f.database, f.manifest, f.options);
  assert.equal(schema(f.database), "3");
  assert.equal(result.children.length, 2); assert.ok(result.children.every(child => child.run.state === "succeeded" && child.method === "baseline"));
  assert.deepEqual(f.store.read(f.parent.id), f.parent);
  const repeat = await diagnoseWorkflow(f.database, f.manifest, f.options);
  assert.deepEqual(repeat.children.map(child => child.run.id), result.children.map(child => child.run.id));
  const reopened = new WorkflowStore(f.database); reopened.close(); assert.equal(schema(f.database), "3");
});

test("advice profiles and unknown selection cannot dispatch, while unknown receipts remain linked", async t => {
  const advice = fixture(t, 2, "auto", "advise"); let calls = 0;
  const stopped = await diagnoseWorkflow(advice.database, advice.manifest, { ...advice.options, token: "fixture", fetch: async () => { calls++; throw new Error("unexpected"); } });
  assert.equal(stopped.refusalReason, "diagnostic-effect-disabled"); assert.equal(stopped.persisted, false);
  assert.equal(stopped.children.length, 0); assert.equal(calls, 0); assert.equal(schema(advice.database), "2");
  assert.equal(advice.store.diagnosticRead(diagnosticEpisodeId(advice.parent, "read")), null);
  durableJson(join(advice.root, "config/governance/profile.yaml"), { continuity: { decisions: { mode: "off", consumers: { DL05: { mode: "off", effect: "choose-read" } } } } });
  const recovered = await diagnoseWorkflow(advice.database, advice.manifest, advice.options);
  assert.equal(recovered.persisted, true); assert.equal(recovered.children.length, 2);
  const f = fixture(t, 2, "auto");
  const unknown = await diagnoseWorkflow(f.database, f.manifest, { ...f.options, token: "fixture", fetch: async (_url, init) => {
    calls++; const payload = JSON.parse(String(init?.body)), keys = Object.keys(payload.questions.probe.criteria);
    return Response.json({ model: payload.model, answers: { probe: { type: "choice", choice: "unknown", confidence: 1,
      probabilities: Object.fromEntries(keys.map(key => [key, key === "unknown" ? 1 : 0])) } } });
  } });
  assert.equal(unknown.episode.closedReason, "selection-unknown"); assert.equal(unknown.children.length, 0); assert.equal(unknown.episode.decisions.length, 1);
});

test("submission cap survives competing coordinators and manifest changes", async t => {
  const f = fixture(t, 4);
  const first = diagnoseWorkflow(f.database, f.manifest, f.options);
  await assert.rejects(diagnoseWorkflow(f.database, f.manifest, f.options), /already owned/);
  const result = await first;
  assert.equal(result.children.length, 3); assert.equal(result.episode.closedReason, "probe-limit");
  await assert.rejects(diagnoseWorkflow(f.database, { ...f.manifest, deadline: f.manifest.deadline + 1000 }, f.options), /cannot reset/);
});

test("expired reserved child is reconciled without renewing the deadline or dispatching it", async t => {
  const f = fixture(t), manifest = { ...f.manifest, deadline: Date.now() + 1000 };
  const resolved = resolveDiagnosticManifest(manifest, f.parent);
  const owner = { token: "fixture-owner", pid: process.pid, fingerprint: processFingerprint(process.pid)!, host: hostname() };
  let episode = f.store.claimDiagnostic({ version: 1, id: resolved.id, requestDigest: resolved.requestDigest, parentRunId: f.parent.id, stageId: "read",
    catalogDigest: resolved.catalogDigest, deadline: resolved.deadline, owner: null, revision: 0, attempts: [], decisions: [], closedReason: null, createdAt: new Date().toISOString() }, owner, () => false);
  episode = f.store.reserveDiagnosticProbe(episode.id, owner.token, episode.revision, resolved.probes[0]!, { method: "baseline", decisionReceiptId: null });
  f.store.finishDiagnostic(episode.id, owner.token, episode.revision, null);
  await new Promise(resolve => setTimeout(resolve, Math.max(0, resolved.deadline - Date.now() + 10)));
  const result = await diagnoseWorkflow(f.database, manifest, f.options);
  assert.equal(result.children.length, 1); assert.equal(result.children[0]!.run.state, "blocked");
  assert.equal(result.episode.deadline, manifest.deadline);
  assert.equal(result.episode.closedReason, "deadline-or-cancelled-before-dispatch");
});

test("catalog commands, action reuse and stale source cannot become executable advice", async t => {
  const f = fixture(t);
  const bad = structuredClone(f.manifest); bad.probes[0]!.binding.actionId = f.parent.binding.actionId;
  await assert.rejects(diagnoseWorkflow(f.database, bad, f.options), /distinct preauthorized/);
  const injection = structuredClone(f.manifest); (injection.probes[0]!.recipe as any).operations = { injected: {} };
  await assert.rejects(diagnoseWorkflow(f.database, injection, f.options), /cannot define operations/);
  durableJson(join(f.root, "config/governance/operations.json"), { version: 1, operations: { changed: {} } });
  await assert.rejects(diagnoseWorkflow(f.database, f.manifest, f.options), /not in the project catalog/);
  assert.equal(schema(f.database), "2"); assert.equal(digest(f.store.read(f.parent.id)), digest(f.parent));
});

test("auto selects an authorized probe, shadow executes the baseline, and grant changes fail closed", async t => {
  for (const mode of ["auto", "shadow"]) {
    const f = fixture(t, 2, mode); let calls = 0;
    const result = await diagnoseWorkflow(f.database, f.manifest, { ...f.options, token: "fixture", fetch: async (_url, init) => {
      calls++; const payload = JSON.parse(String(init?.body)), keys = Object.keys(payload.questions.probe.criteria), choice = keys.filter(key => key !== "unknown").at(-1)!;
      return Response.json({ model: payload.model, answers: { probe: { type: "choice", choice, confidence: 1,
        probabilities: Object.fromEntries(keys.map(key => [key, key === choice ? 1 : 0])) } } });
    } });
    assert.equal(result.children[0]!.probeId, mode === "auto" ? "probe-1" : "probe-0");
    assert.ok(result.children.every(child => child.method === (mode === "auto" ? "jev" : "baseline")));
    assert.equal(calls, 2); assert.equal(result.children.length, 2);
  }
  const f = fixture(t, 2, "auto");
  const rejected = await diagnoseWorkflow(f.database, f.manifest, { ...f.options, token: "fixture", fetch: async (_url, init) => {
    const payload = JSON.parse(String(init?.body)), keys = Object.keys(payload.questions.probe.criteria);
    f.continuity.reviseTask(f.task.taskId, [{ kind: "constraint", provenance: "operator", body: "scope changed" }]);
    return Response.json({ model: payload.model, answers: { probe: { type: "choice", choice: "probe-0", confidence: 1,
      probabilities: Object.fromEntries(keys.map(key => [key, key === "probe-0" ? 1 : 0])) } } });
  } });
  assert.equal(rejected.children.length, 0); assert.equal(rejected.episode.closedReason, "pre-dispatch-admission-changed");
});


test("pre-entry cancellation, expired deadlines and unavailable targets consume no episode", async t => {
  const f = fixture(t);
  const cancelled = await diagnoseWorkflow(f.database, f.manifest, { ...f.options, signal: AbortSignal.abort() });
  assert.equal(cancelled.persisted, false); assert.equal(schema(f.database), "2");
  const expired = await diagnoseWorkflow(f.database, { ...f.manifest, deadline: Date.now() - 1 }, f.options);
  assert.equal(expired.refusalReason, "deadline-or-cancelled-before-entry"); assert.equal(schema(f.database), "2");
  const simulator = "00000000-0000-0000-0000-000000000000";
  const native = fixture(t, 1, "off", "choose-read", [`ios-simulator:${simulator}`]);
  const manifest = { ...native.manifest, target: { kind: "ios-simulator", id: simulator } };
  const refused = await diagnoseWorkflow(native.database, manifest, native.options);
  assert.equal(refused.refusalReason, "target-unavailable"); assert.equal(refused.persisted, false);
  assert.equal(native.store.diagnosticRead(diagnosticEpisodeId(native.parent, "read")), null);
  assert.equal(schema(native.database), "2");
});

function reserved(f: ReturnType<typeof fixture>) {
  const manifest = resolveDiagnosticManifest(f.manifest, f.parent);
  const owner = { token: "fixture-reservation", pid: process.pid, fingerprint: processFingerprint(process.pid)!, host: hostname() };
  let episode = f.store.claimDiagnostic({ version: 1, id: manifest.id, requestDigest: manifest.requestDigest,
    parentRunId: f.parent.id, stageId: "read", catalogDigest: manifest.catalogDigest, deadline: manifest.deadline,
    owner: null, revision: 0, attempts: [], decisions: [], closedReason: null, createdAt: new Date().toISOString() }, owner, () => false);
  episode = f.store.reserveDiagnosticProbe(episode.id, owner.token, episode.revision, manifest.probes[0]!, { method: "baseline", decisionReceiptId: null });
  f.store.finishDiagnostic(episode.id, owner.token, episode.revision, null);
  const child = f.store.read(episode.attempts[0]!.childRunId);
  return f.store.claim(child.id, child.revision, "native-fixture-owner");
}

test("failed or uncertain child outcomes stop diagnosis and retain native ownership", async t => {
  for (const state of ["failed", "unknown"] as const) {
    const f = fixture(t), child = reserved(f);
    f.store.stage(child.id, "native-fixture-owner", "read", "running");
    f.store.stage(child.id, "native-fixture-owner", "read", state, { state, exitCode: state === "failed" ? 1 : null,
      cleanup: state === "failed" ? "confirmed" : "unknown", startedAt: "start", endedAt: "end", log: "", inputValidity: "valid", detail: "fixture" });
    f.store.transition(child.id, "native-fixture-owner", child.revision, state);
    const result = await diagnoseWorkflow(f.database, f.manifest, f.options);
    assert.equal(result.episode.closedReason, "child-failed-or-unresolved"); assert.equal(result.children.length, 1);
    assert.equal(result.children[0]!.run.state, state); assert.equal(f.store.read(child.id).owner, "native-fixture-owner");
    assert.deepEqual(f.store.read(f.parent.id), f.parent);
  }
});

test("cleanup grace expiry requests cancellation without erasing a live child owner", async t => {
  const f = fixture(t), child = reserved(f), directory = join(f.options.workersDirectory, child.id);
  // A committed native dispatch fixture already has an owner; the coordinator may not spawn its replacement.
  durableJson(join(directory, "request.json"), { version: 1, database: f.database, runId: child.id,
    bindingDigest: digest(child.binding), registry: f.options.registryPath, commandsDirectory: join(directory, "commands"),
    workerDigest: fileDigest(fileURLToPath(new URL("../src/workflow-worker.ts", import.meta.url))),
    execution: { absoluteDeadline: f.manifest.deadline, outputLimit: 32768 } });
  t.mock.method(Date, "now", () => f.manifest.deadline + 60001);
  const result = await diagnoseWorkflow(f.database, f.manifest, f.options);
  assert.equal(result.episode.closedReason, "child-cleanup-still-owned");
  assert.equal(result.children[0]!.run.state, "running"); assert.equal(result.children[0]!.run.cancelRequested, true);
  assert.equal(f.store.read(child.id).owner, "native-fixture-owner");
});

test("no-call diagnostic capture records configuration and actual baseline exposure", async t => {
  const f = fixture(t, 1), assignmentPath = join(f.root, "assignment.json");
  durableJson(assignmentPath, { version: 1, id: "assignment", episodeId: "off-diag", experiment: "diagnostic", definitionVersion: "1", arm: "off",
    assignedAt: new Date(Date.now() - 1000).toISOString(), groupingUnit: f.task.taskId, sourceRevision: "source",
    scope: { workspace: f.root, taskId: f.task.taskId, taskRevision: String(f.task.version) } });
  const result = await diagnoseWorkflow(f.database, f.manifest, { ...f.options, assignmentPath }) as any;
  assert.equal(result.collection.status, "recorded");
  const capture = JSON.parse(readFileSync(result.collection.episode.path, "utf8"));
  assert.equal(capture.exposure.mode, "off"); assert.equal(capture.exposure.effect, "choose-read");
  assert.equal(capture.exposure.delivered, false); assert.equal(capture.exposure.probes[0].method, "baseline");
  const advice = fixture(t, 1, "auto", "advise"), refusalAssignment = join(advice.root, "assignment.json");
  durableJson(refusalAssignment, { ...capture.assignment, id: "refused", episodeId: "refused-then-retried",
    scope: { workspace: advice.root, taskId: advice.task.taskId, taskRevision: String(advice.task.version) } });
  const refused = await diagnoseWorkflow(advice.database, advice.manifest, { ...advice.options, assignmentPath: refusalAssignment }) as any;
  const originalCapture = readFileSync(refused.collection.episode.path, "utf8");
  assert.equal(refused.persisted, false); assert.equal(refused.collection.status, "recorded");
  durableJson(join(advice.root, "config/governance/profile.yaml"), { continuity: { decisions: { mode: "off", consumers: { DL05: { mode: "off", effect: "choose-read" } } } } });
  const retried = await diagnoseWorkflow(advice.database, advice.manifest, { ...advice.options, assignmentPath: refusalAssignment }) as any;
  assert.equal(retried.children.length, 1); assert.equal(retried.collection.reason, "episode-id-already-used");
  assert.equal(readFileSync(refused.collection.episode.path, "utf8"), originalCapture);
});
