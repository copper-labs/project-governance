import { test } from "node:test";
import assert from "node:assert/strict";
import { analysisPolicy } from "../src/checkers/analysis-policy.ts";
import { adapterCapabilities } from "../src/checkers/native-analysis.ts";
const maintainability = { language_neutral_checks: ["physical-file-size"], active_adapters: Object.keys(adapterCapabilities), declaration_enrichment: "optional-native" };

test("maintainability policy retains fallback and exact shipped adapter coverage", () => {
  assert.deepEqual(analysisPolicy("policy.yaml", { maintainability }), []);
  for (const active_adapters of [[], [...maintainability.active_adapters, "invented"], [...maintainability.active_adapters, "python-ast"]]) {
    assert.deepEqual(analysisPolicy("policy.yaml", { maintainability: { ...maintainability, active_adapters } }).map(f => f["symbol"]), ["active_adapters"]);
  }
  assert.equal(analysisPolicy("policy.yaml", { maintainability: { ...maintainability, language_neutral_checks: [] } })[0]?.severity, "blocking");
  for (const malformed of [null, [], { maintainability: null }]) assert.equal(analysisPolicy("policy.yaml", malformed).length, 3);
});
