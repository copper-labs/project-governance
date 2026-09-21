import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../harness/src/store/store.ts";
import { proposeAction, authorizeAction } from "../../harness/src/ops/actions.ts";
import { defaultPolicy } from "../../harness/src/ops/authority.ts";
import { WorkflowStore } from "../src/workflow-store.ts";
import { parseRecipe, recipeDigest } from "../src/workflow-types.ts";
import { workflowOperation } from "../src/workflow-operation.ts";
import { attentionAdvice } from "../src/decision-attention.ts";
import { workflowStageExcerpt } from "../src/decision-device-advice.ts";
import { DecisionRuntime } from "../src/decision-runtime.ts";
import { profileDecisionSettings } from "../src/decision-settings.ts";
import { digest, durableJson } from "../src/core.ts";

test("attention only assesses a native-bound residual once and never changes delivery", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "attention-"))), database = join(root, "ledger.sqlite");
  const continuity = new Store(database), store = new WorkflowStore(database);
  t.after(() => { store.close(); continuity.close(); rmSync(root, { recursive: true, force: true }); });
  const task = continuity.createTask("observe progress", [{ kind: "scope", provenance: "operator", body: root }]), policy = defaultPolicy();
  const request = { operation: "check" as const, scope: [root], targets: [], destination: null, policyRevision: policy.revision };
  const action = authorizeAction(continuity, proposeAction(continuity, task.taskId, request), request, policy, root);
  const recipe = parseRecipe({ version: 1, id: "observe", workspace: root, inputs: [], resources: [], operations: {
    read: { argv: [process.execPath, "-e", "console.log('progress')"], cwd: root, effect: "read" } },
    stages: [{ id: "first", operation: "read", deadlineMs: 1000 }, { id: "second", operation: "read", dependsOn: ["first"], deadlineMs: 1000 }],
    deadlineMs: 3000, policyRevision: policy.revision, claims: [] });
  const binding = { taskId: task.taskId, taskVersion: task.version, actionId: action.actionId, authorityRef: "host:fixture", operationId: "fixture", recipe, recipeDigest: recipeDigest(recipe) };
  store.authorizeWorkflow(binding); const initial = store.submit(binding); store.claim(initial.id, initial.revision, "fixture");
  const commands = join(root, "commands"), directory = join(commands, `${initial.id}-0`), log = join(directory, "output.log");
  mkdirSync(directory, { recursive: true }); writeFileSync(log, "Some progress requires interpretation of the active procedure.\n");
  const command = { version: 1, id: `${initial.id}:first`, operation: workflowOperation(recipe, initial.id, recipe.stages[0]!, commands), deadlineMs: 1000, outputLimit: 10000, ownerDigest: "fixture" };
  durableJson(join(directory, "request.json"), command);
  const result = { state: "succeeded" as const, exitCode: 0, cleanup: "confirmed" as const, startedAt: "start", endedAt: "end", log, inputValidity: "valid" as const, detail: "read complete" };
  durableJson(join(directory, "result.json"), { version: 1, requestDigest: digest(command), ...result, signal: null, reason: "complete", durationMs: 10, logBytes: 70 });
  store.stage(initial.id, "fixture", "first", "running"); store.stage(initial.id, "fixture", "first", "succeeded", result);
  const native = { run: store.read(initial.id), stages: store.stages(initial.id), events: store.events(initial.id) };
  const scope = { workspace: root, taskId: task.taskId, taskRevision: String(task.version) };
  const event = native.events.find((event: any) => event.kind === "stage:succeeded") as any;
  const envelope = { version: 1, runId: initial.id, eventSequence: event.sequence,
    excerptDigest: workflowStageExcerpt(native.run, native.stages[0]!)!.digest, purpose: "observe work", procedure: "wait for the second stage" };
  let calls = 0;
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["diagnostic"], consumers: { DL06: { mode: "auto" } } } } });
  const fetcher = (async (_url, init) => {
    calls++; const payload = JSON.parse(String(init?.body)), keys = Object.keys(payload.questions.attention.criteria);
    return Response.json({ model: payload.model, answers: { attention: { type: "choice", choice: "covered-by-active-procedure", confidence: 1,
      probabilities: Object.fromEntries(keys.map(key => [key, key === "covered-by-active-procedure" ? 1 : 0])) } } });
  }) as typeof fetch;
  const runtime = new DecisionRuntime(settings, join(root, "state"), { token: "fixture", fetch: fetcher });
  assert.equal((await attentionAdvice(runtime, native, null, scope)).eligible, 0); assert.equal(calls, 0);
  const first = await attentionAdvice(runtime, native, envelope, scope);
  assert.equal(first.delivered, true); assert.equal(first.actualAvoidedTurns, null);
  assert.equal((await attentionAdvice(runtime, native, { ...envelope, procedure: "different ongoing procedure" }, scope)).unassessed, 1);
  assert.equal(calls, 1); assert.deepEqual(store.read(initial.id), native.run);
  assert.equal((await attentionAdvice(runtime, { ...native, run: { ...native.run, state: "failed" } }, envelope, scope)).reason, "protected-state");
  const shadow = new DecisionRuntime({ ...settings, mode: "shadow" }, join(root, "shadow"), { token: "fixture", fetch: fetcher });
  const projection = await attentionAdvice(shadow, native, envelope, scope);
  assert.equal(projection.delivered, false); assert.equal(projection.disposition, null); assert.equal(projection.reason, "shadow");
  const noToken = new DecisionRuntime(settings, join(root, "off"), { token: "", fetch: fetcher });
  const unavailable = await attentionAdvice(noToken, native, envelope, scope);
  assert.equal(unavailable.reason, "missing-token"); assert.equal(unavailable.unassessed, 1);
  assert.equal((await attentionAdvice(shadow, native, envelope, scope)).unassessed, 0);
  const beforeProtected = calls;
  writeFileSync(log, "Warning: process needs attention\n");
  const protectedEnvelope = { ...envelope, excerptDigest: workflowStageExcerpt(native.run, native.stages[0]!)!.digest };
  assert.equal((await attentionAdvice(runtime, native, protectedEnvelope, scope)).reason, "protected-output");
  assert.equal(calls, beforeProtected);
});
