import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digest } from "../src/core.ts";
import { mergePacks } from "../src/pack-configuration.ts";
import { buildPlan } from "../src/planning.ts";
import { profileDecisionSettings } from "../src/decision-settings.ts";
import { DecisionRuntime } from "../src/decision-runtime.ts";
import { validationAdvice, validationCounterfactual } from "../src/decision-validation-advice.ts";

test("CI v2 uses declared scenario meaning while preserving required plan and honest comparisons", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ci-advice-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const packs = mergePacks([
    { source: "config/validation/packs/static.yaml", origin: "target", value: { id: "static", enforcement: "blocking", stages: ["pre-push"], commands: ["fixture"], path_globs: ["src/**"], description: "Source checks" } },
    { source: "config/validation/packs/device.yaml", origin: "target", value: { id: "device", enforcement: "blocking", stages: ["pre-push"], commands: ["fixture"], path_globs: ["device/**"],
      decision_context: { purpose: "Exercise application launch", covers: ["launch on a selected simulator"], limits: ["does not prove physical-device behavior"] } } },
  ]);
  const plan = buildPlan(packs, { stage: "pre-push", mode: "impacted", changedPaths: ["src/feature.ts"] }), original = digest(plan);
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["src/**", "config/validation/packs/**"],
    consumers: { DL07: { mode: "auto", questions: ["validation.scenario-relevance/2", "validation.coverage-gap/2"] } } } } });
  let calls = 0;
  const runtime = new DecisionRuntime(settings, root, { token: "fixture", fetch: async (_url, init) => {
    calls++;
    const payload = JSON.parse(String(init?.body));
    assert.match(JSON.stringify(payload.questions), /Exercise application launch/);
    assert.match(JSON.stringify(payload.questions), /does not prove physical-device behavior/);
    assert.match(JSON.stringify(payload.questions), /Requirement to render/);
    return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(Object.keys(payload.questions).map(name => [name, { type: "noul", noul: 0.05 }])) });
  } });
  const advice = await validationAdvice(runtime, packs, plan, { workspace: root, taskId: "feature", taskRevision: "1" },
    { eventId: "ci", policyDigest: "policy", environment: "fixture", revision: "1", subjectDigest: "source", requirement: "Requirement to render the app" });
  assert.equal(calls, 1); assert.equal(advice.delivered, true);
  assert.equal(digest(plan), original); assert.deepEqual(plan.execution_order, ["static"]);
  const intent = { id: "native", root, scope: { subject_digest: "source" }, packs_digest: digest(packs) };
  const result = { run_id: "native", plan, results: [{ pack_id: "device", status: "failed" }] };
  const compared = validationCounterfactual(advice, intent, result);
  assert.equal(compared.comparisons[0]?.missedFailure, true); assert.equal(compared.savings, null);
  assert.equal(validationCounterfactual(advice, { ...intent, packs_digest: "changed" }, result).status, "unmatched");
  assert.equal(validationCounterfactual(advice, intent, { ...result, results: [] }).comparisons[0]?.nativeStatus, "not-observed");
});

test("malformed scenario metadata and competing question versions fail configuration", () => {
  assert.throws(() => mergePacks([{ source: "fixture", origin: "target", value: { id: "p", enforcement: "blocking", commands: ["fixture"], decision_context: { purpose: "Meaning", covers: [], limits: [], skip: true } } }]), /Unknown/);
  assert.throws(() => profileDecisionSettings({ continuity: { decisions: { consumers: { DL07: { questions: ["validation.coverage-gap/1", "validation.coverage-gap/2"] } } } } }), /one version/);
});
