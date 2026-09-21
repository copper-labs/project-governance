import { test } from "node:test";
import assert from "node:assert/strict";
import { profileDecisionConfig } from "../src/decision-configuration.ts";
import { DEFAULT_DECISIONS } from "../src/decisions.ts";
test("legacy profiles stay off and tracked policy maps to the provider contract", () => {
  assert.deepEqual(profileDecisionConfig({}), DEFAULT_DECISIONS);
  const config = profileDecisionConfig({ continuity: { decisions: { mode: "shadow", provider: "jev",
    config_revision: "review-1", allowed_questions: ["rank_optional_context"], allowed_data_classes: ["source"] } } });
  assert.equal(config.mode, "shadow"); assert.equal(config.revision, "review-1");
  assert.deepEqual(config.allowedDataClasses, ["source"]);
  assert.equal(config.deadlineMs, 1000);
});
test("invalid profiles, unknown providers and misspelled policy fail closed", () => {
  for (const decisions of [null, { provider: "other" }, { allowed_data_class: ["source"] }, { deadline_ms: 0 }, { mode: "on" }]) {
    assert.throws(() => profileDecisionConfig({ continuity: { decisions } }));
  }
});

test("configuration identity rejects coercible model values and non-text revisions", () => {
  for (const decisions of [
    { config_revision: 1 }, { config_revision: {} }, { config_revision: " " },
    { config_revision: "x".repeat(129) }, { config_revision: "revision\0suffix" },
    { model: ["jev-1.13.0"] },
  ]) assert.throws(() => profileDecisionConfig({ continuity: { decisions } }));
});
