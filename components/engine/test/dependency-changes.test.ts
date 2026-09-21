import { test } from "node:test";
import assert from "node:assert/strict";
import { dependencyChange, evaluateDependencyChanges } from "../src/checkers/dependency-changes.ts";
import { parsePackageManifest } from "../src/checkers/dependency-manifests.ts";
const image = (dependencies: Record<string, string>) => parsePackageManifest("package.json", JSON.stringify({ dependencies }));
const workspace = { consumers: new Set(["package.json"]), versions: new Map([["local", "1.0.0"]]) };

test("dependency repairs retain existing exemption while new external coordinates require evidence", () => {
  const result = dependencyChange("package.json", image({ debt: "^1.0.0", unchanged: "^2.0.0" }), image({ debt: "1.0.0", unchanged: "^2.0.0", external: "3.0.0", local: "1.0.0" }), workspace);
  assert.deepEqual(result.findings, []); assert.equal(result.change.changed.size, 2); assert.equal(result.change.local.size, 1);
  const evaluated = evaluateDependencyChanges([result.change], new Map(), new Set(), new Map(), new Set());
  assert.equal(evaluated.findings.length, 1); assert.equal(evaluated.checked[0]?.["status"], "evidence-missing");
  const external = [...result.change.changed.keys()].find(key => !result.change.local.has(key))!;
  const invalid = evaluateDependencyChanges([result.change], new Map(), new Set([external]), new Map(), new Set());
  assert.equal(invalid.checked[0]?.["status"], "evidence-invalid"); assert.deepEqual(invalid.findings, []);
  assert.equal(evaluateDependencyChanges([result.change], new Map([[external, {}]]), new Set([external]), new Map(), new Set()).checked[0]?.["status"], "evidence-verified");
});
