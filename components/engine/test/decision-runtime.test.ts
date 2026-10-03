import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DecisionRuntime, type DecisionAsk } from "../src/decision-runtime.ts";
import { profileDecisionSettings } from "../src/decision-settings.ts";
import { digest } from "../src/core.ts";
import { contextBudgetScope, readDecisionBudget } from "../src/decision-budget.ts";

test("larger context defaults stay in isolated scopes and explicit budgets still constrain both", async t => {
  const root = mkdtempSync(join(tmpdir(), "decision-scopes-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, declared, ordinaryCalls, contextCalls] of [
    ["default", undefined, 16, 17], ["explicit", { max_calls: 2, max_request_bytes: 4096 }, 2, 2],
  ] as const) {
    const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto",
      ...(declared ? { budget: declared } : {}), allowed_data_classes: ["source", "metadata"],
      allowed_source_paths: ["src/**"], allowed_metadata_paths: ["src/**"],
      consumers: { DL03: { mode: "auto", questions: ["context.relevance/1", "context.metadata-relevance/1"] } } } } });
    const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "test-only",
      fetch: async () => Response.json({ model: settings.legacy.model, answers: { q1: { type: "noul", noul: 0.9 } } }) });
    const scope = { workspace: root, taskId: name, taskRevision: "r1" }, invocation = digest(name).slice(7);
    for (const context of [false, true]) {
      const expectedCalls = context ? contextCalls : ordinaryCalls;
      const ask: DecisionAsk = { consumerId: "DL03", eventId: "first", scope,
        subject: { digest: digest(name), revision: "r1", environment: "test" }, policyDigest: digest("policy"),
        evidence: [{ id: "source", text: "example", sourceDigest: digest("example"), provenance: "captured", trust: "untrusted" }],
        coverage: { captured: 1, omitted: [], truncated: false, unavailable: [], limits: [] },
        questions: [{ name: "q1", definitionId: context ? "context.metadata-relevance/1" : "context.relevance/1", consumerId: "DL03", evidenceIds: ["source"] }],
        ...(context ? { metadataPaths: ["src/example.ts"], budgetPartition: "context-selection", budgetInvocationId: invocation } : { sourcePaths: ["src/example.ts"] }) };
      for (let index = 0; index < expectedCalls; index++) {
        const outcome = await runtime.ask({ ...ask, eventId: `${context}-${index}` });
        assert.equal(outcome.delivered, true);
        assert.deepEqual(outcome.budget.limits, context ? settings.contextBudget : settings.budget);
      }
      if (!context || declared) assert.equal((await runtime.ask({ ...ask, eventId: `${context}-overflow` })).reason, "budget-exhausted");
      assert.equal(readDecisionBudget(root, context ? contextBudgetScope(scope, invocation) : scope)?.calls, expectedCalls);
    }
  }
});

test("repeat reuse binds evidence and configuration, and disabled polls cannot destroy receipts", async t => {
  const root = mkdtempSync(join(tmpdir(), "decision-runtime-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let calls = 0;
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["src/**"], consumers: { DL03: { mode: "auto" } } } } });
  const fetcher: typeof fetch = async () => {
    calls++;
    return Response.json({ model: settings.legacy.model, answers: { q1: { type: "noul", noul: 0.9 } } });
  };
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "test-only", fetch: fetcher });
  const ask: DecisionAsk = { consumerId: "DL03", eventId: "event", scope: { workspace: root, taskId: "task", taskRevision: "r1" },
    subject: { digest: digest("source"), revision: "r1", environment: "test" },
    evidence: [{ id: "source", text: "example", sourceDigest: digest("example"), provenance: "captured", trust: "untrusted" }],
    coverage: { captured: 1, omitted: [], truncated: false, unavailable: [], limits: [] },
    questions: [{ name: "q1", definitionId: "context.relevance/1", consumerId: "DL03", evidenceIds: ["source"] }],
    sourcePaths: ["src/example.ts"], policyDigest: digest("policy") };
  assert.equal((await runtime.ask(ask)).delivered, true);
  assert.equal((await runtime.ask(ask)).reason, "repeated-observation");
  const alias = join(root, "alias"); symlinkSync(root, alias);
  assert.equal((await runtime.ask({ ...ask, scope: { ...ask.scope!, workspace: alias } })).reason, "repeated-observation");
  const off = new DecisionRuntime({ ...settings, mode: "off" }, root, { coordinationRoot: root, token: "test-only", fetch: fetcher });
  assert.equal((await off.ask(ask)).delivered, false);
  assert.equal((await runtime.ask(ask)).delivered, true);
  const changed = await runtime.ask({ ...ask, policyDigest: digest("new-policy") });
  assert.equal(changed.delivered, false);
  assert.equal(changed.reason, "repeated-observation-unavailable");
  assert.equal(calls, 1);
  const missingPaths = await runtime.ask({ ...ask, eventId: "second", sourcePaths: [] });
  assert.equal(missingPaths.reason, "source-scope-disabled");
  assert.equal(calls, 1);
  let failures = 0;
  const failing = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "test-only", fetch: async () => { failures++; return new Response("unavailable", { status: 500 }); } });
  assert.equal((await failing.ask({ ...ask, eventId: "failure" })).reason, "provider-error");
  const beforeCooldown = readDecisionBudget(root, ask.scope!);
  assert.equal((await failing.ask({ ...ask, eventId: "cooldown-event" })).reason, "cooldown");
  assert.deepEqual(readDecisionBudget(root, ask.scope!), beforeCooldown);
  assert.equal(failures, 1);
});

test("invalid answers never count as delivered and rejected envelopes retain native usage", async t => {
  const root = mkdtempSync(join(tmpdir(), "decision-invalid-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["src/**"], consumers: { DL03: { mode: "auto" } } } } });
  const ask: DecisionAsk = { consumerId: "DL03", eventId: "invalid", scope: { workspace: root, taskId: "task", taskRevision: "1" },
    subject: { digest: digest("source"), revision: "1", environment: "test" },
    evidence: [{ id: "source", text: "text", sourceDigest: digest("text"), provenance: "captured", trust: "untrusted" }],
    coverage: { captured: 1, omitted: [], truncated: false, unavailable: [], limits: [] },
    questions: [{ name: "q", definitionId: "context.relevance/1", consumerId: "DL03", evidenceIds: ["source"] }], sourcePaths: ["src/x"], policyDigest: digest("policy") };
  for (const model of [settings.legacy.model, "wrong-model"]) {
    const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "test-only", fetch: async () => Response.json({ model, answers: {}, usage: { input_tokens: 77, output_tokens: 8 } }) });
    const result = await runtime.ask({ ...ask, eventId: model });
    assert.equal(result.delivered, false); assert.equal(result.method, "baseline");
    assert.deepEqual(result.usage, { inputTokens: 77, outputTokens: 8 });
    assert.equal(result.reason, model === settings.legacy.model ? "no-usable-answers" : "invalid-or-unavailable");
  }
});

test("observation capability stays advisory and incompatible entries never reach transport", async t => {
  const root = mkdtempSync(join(tmpdir(), "decision-entry-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["diagnostic"], consumers: { DL05: { mode: "auto" } } } } });
  // Exercise the capability intersection before choose-read becomes a configurable public effect.
  settings.consumers.DL05.effect = "choose-read";
  settings.consumers.DL05.effectSource = "declared";
  let calls = 0;
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "test-only", fetch: async () => {
    calls++;
    return Response.json({ model: settings.legacy.model, answers: { probe: { type: "choice", choice: "logs", confidence: 0.9, probabilities: { logs: 0.9, unknown: 0.1 } } } });
  } });
  const ask: DecisionAsk = { consumerId: "DL05", entryKind: "workflow-observe", eventId: "observation",
    scope: { workspace: root, taskId: "task", taskRevision: "1" },
    subject: { digest: digest("failure"), revision: "1", environment: "test" },
    evidence: [{ id: "failure", text: "bundle unavailable", sourceDigest: digest("failure"), provenance: "captured", trust: "untrusted" }],
    coverage: { captured: 1, omitted: [], truncated: false, unavailable: [], limits: [] },
    questions: [{ name: "probe", definitionId: "runtime.next-probe/1", consumerId: "DL05", evidenceIds: ["failure"], candidates: [{ id: "logs", description: "Read service logs" }] }],
    policyDigest: digest("policy") };
  const observation = await runtime.ask(ask);
  assert.equal(observation.delivered, true);
  assert.equal(observation.effect, "advise");
  assert.equal(observation.configuredEffect, "choose-read");
  for (const entryKind of ["registered-default", "workflow-diagnose", "invented"] as const) {
    const rejected = await runtime.ask({ ...ask, eventId: entryKind, entryKind: entryKind as NonNullable<DecisionAsk["entryKind"]> });
    assert.equal(rejected.reason, "entry-effect-incompatible");
    assert.equal(rejected.delivered, false);
    assert.equal(rejected.budget.state, "not-required");
  }
  assert.equal(calls, 1);
});
