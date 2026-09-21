import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DecisionRuntime, type DecisionAsk } from "../src/decision-runtime.ts";
import { profileDecisionSettings } from "../src/decision-settings.ts";
import { digest } from "../src/core.ts";
import { readDecisionBudget } from "../src/decision-budget.ts";

test("repeat reuse binds evidence and configuration, and disabled polls cannot destroy receipts", async t => {
  const root = mkdtempSync(join(tmpdir(), "decision-runtime-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let calls = 0;
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["src/**"], consumers: { DL03: { mode: "auto" } } } } });
  const fetcher: typeof fetch = async () => {
    calls++;
    return Response.json({ model: settings.legacy.model, answers: { q1: { type: "noul", noul: 0.9 } } });
  };
  const runtime = new DecisionRuntime(settings, root, { token: "test-only", fetch: fetcher });
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
  const off = new DecisionRuntime({ ...settings, mode: "off" }, root, { token: "test-only", fetch: fetcher });
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
  const failing = new DecisionRuntime(settings, root, { token: "test-only", fetch: async () => { failures++; return new Response("unavailable", { status: 500 }); } });
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
    const runtime = new DecisionRuntime(settings, root, { token: "test-only", fetch: async () => Response.json({ model, answers: {}, usage: { input_tokens: 77, output_tokens: 8 } }) });
    const result = await runtime.ask({ ...ask, eventId: model });
    assert.equal(result.delivered, false); assert.equal(result.method, "baseline");
    assert.deepEqual(result.usage, { inputTokens: 77, outputTokens: 8 });
    assert.equal(result.reason, model === settings.legacy.model ? "no-usable-answers" : "invalid-or-unavailable");
  }
});
