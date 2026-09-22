import { test } from "node:test";
import assert from "node:assert/strict";
import { profileDecisionSettings, resolveConsumerMode } from "../src/decision-settings.ts";
import { DECISION_CONSUMER_IDS } from "../src/decision-schema.ts";

test("new features default off and effects default to advice independently", () => {
  const defaults = profileDecisionSettings({});
  for (const id of DECISION_CONSUMER_IDS) {
    assert.equal(resolveConsumerMode(defaults, id).mode, "off");
    assert.equal(defaults.consumers[id].effect, "advise");
    assert.deepEqual(defaults.questionIds[id], []);
  }
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "shadow", consumers: { DL01: { mode: "auto" } } } } });
  assert.equal(resolveConsumerMode(settings, "DL01").mode, "shadow");
  assert.equal(resolveConsumerMode(settings, "DL02").mode, "off");
  assert.equal(settings.consumers.DL01.effectSource, "default");
});

test("old question permission cannot silently authorize expanded context or device questions", () => {
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_questions: ["rank_optional_context", "rank_diagnostics", "advise_intent"] } } });
  assert.deepEqual(settings.questionIds.DL03, ["legacy.context-rank/1"]);
  assert.equal(settings.consumers.DL05.mode, "off");
  assert.equal(settings.consumers.DL04.mode, "off");
  const explicit = profileDecisionSettings({ continuity: { decisions: { mode: "auto", consumers: { DL03: { mode: "auto" } } } } });
  assert.deepEqual(explicit.questionIds.DL03, ["context.relevance/1"]);
});

test("unsupported effects and conflicting legacy/new declarations fail closed", () => {
  for (const decisions of [
    { consumers: { DL03: { mode: "auto", effect: "choose-local" } } },
    { allowed_questions: ["rank_optional_context"], consumers: { DL03: { mode: "auto" } } },
    { consumers: { DL99: { mode: "auto" } } },
    { budget: { max_calls: 0 } },
  ]) assert.throws(() => profileDecisionSettings({ continuity: { decisions } }));
});

test("RC4 keeps RC3 defaults while new quality and CI questions need exact opt-in", () => {
  const consumers = Object.fromEntries(DECISION_CONSUMER_IDS.map(id => [id, { mode: "auto" }]));
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", consumers } } });
  assert.deepEqual(settings.questionIds.DL01, ["test.assertion-support/1", "test.mocked-behavior/1", "test.expectation-weakened/1"]);
  assert.deepEqual(settings.questionIds.DL02, ["diff.rule-concern/1", "diff.task-relevance/1"]);
  assert.deepEqual(settings.questionIds.DL05, ["runtime.diagnostic-match/1", "runtime.next-probe/1", "runtime.next-probe/2"]);
  assert.deepEqual(settings.questionIds.DL07, ["validation.scenario-relevance/1", "validation.coverage-gap/1"]);
  const parse = (questions: unknown) => profileDecisionSettings({ continuity: { decisions: { mode: "auto", consumers: { DL01: { mode: "auto", questions } } } } });
  assert.deepEqual(parse(["test.requirement-support/1"]).questionIds.DL01, ["test.requirement-support/1"]);
  assert.deepEqual(parse([]).questionIds.DL01, []);
  for (const value of [["diff.rule-concern/1"], ["test.requirement-support/2"], ["test.requirement-support/1", "test.requirement-support/1"], "all"]) assert.throws(() => parse(value));
});

test("a flat category declaration changes config identity without enabling model routing", () => {
  const mapping = { providers: { claude: { assignment_classes: ["bounded-summary"], categories: {
    summarize: { description: "Summarize supplied evidence", model: "operator-model", effort: "high" },
  } } } };
  const parse = (model_routing: unknown) => profileDecisionSettings({ continuity: { model_routing, decisions: { mode: "auto", consumers: { DL03: { mode: "auto" } } } } });
  const settings = parse(mapping);
  assert.equal(resolveConsumerMode(settings, "DL08").mode, "off");
  assert.notEqual(settings.configDigest, parse(undefined).configDigest);
  assert.equal(settings.configDigest, parse(structuredClone(mapping)).configDigest);
  assert.throws(() => parse({ ...mapping, mode: "auto" }), /Unknown model routing/);
  assert.throws(() => parse({ providers: { other: {} } }), /Unknown model routing/);
  assert.throws(() => parse({ providers: { claude: { ...mapping.providers.claude, categories: { unknown: mapping.providers.claude.categories.summarize } } } }), /reserved/);
  assert.throws(() => profileDecisionSettings({ continuity: { decisions: { consumers: { DL03: { mode: "auto", effect: "route-model" } } } } }), /does not support/);
});
