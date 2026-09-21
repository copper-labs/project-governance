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
