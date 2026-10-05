import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isTestFile, testQualityFindings, checkTestQuality, checkProse } from "../src/checkers/advisory.ts";
import { ValidationSubject, resolveChangeScope } from "../src/change-subject.ts";
import { normalizeCheck } from "../src/checker-results.ts";

test("test selection excludes support and generated paths while retaining explicitly named tests", () => {
  for (const path of ["tests/behavior.ts", "lib/sample.test.ts", "src/BehaviorTest.kt", "tests/helpers/explicit.test.js"]) assert.equal(isTestFile(path), true, path);
  for (const path of ["tests/helpers/example.ts", "node_modules/a.test.ts", "build/ExampleTest.kt", "src/example.ts"]) assert.equal(isTestFile(path), false, path);
  assert.deepEqual(testQualityFindings("test.py", "getter = example()\n").map(f => f.rule_id), ["test-quality.no-assertion", "test-quality.hollow-accessor"]);
  assert.deepEqual(testQualityFindings("test.py", "# state contract\nassert result\n"), []);
});

test("semantic test conventions extend native capture without changing static selection", () => {
  const options = { extensions: new Set([".py", ".kt", ".kts", ".swift", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"]), nativeTestDirectories: true };
  for (const path of ["src/commonTest/kotlin/Behavior.kt", "src/androidUnitTest/kotlin/Behavior.kt", "src/iosArm64Test/kotlin/Behavior.kt",
    "Tests/FeatureTests/Behavior.swift", "FeatureTests/Behavior.swift", "FeatureUITests/Behavior.swift", "src/FeatureTestCase.swift", "test_feature.py", "feature_test.py",
    "ui/behavior.test.jsx", "spec/behavior.ts", "tests/fixtures/explicit.test.ts"]) assert.equal(isTestFile(path, options), true, path);
  for (const path of ["src/commonMain/kotlin/Behavior.kt", "src/Contest.kt", "Tests/FeatureTests/helpers/Behavior.swift", "tests/fixtures/data.py",
    "tests/support/behavior.ts", "build/BehaviorTest.kt", "src/testing/Behavior.swift"]) assert.equal(isTestFile(path, options), false, path);
  assert.equal(isTestFile("src/commonTest/kotlin/Behavior.kt"), false);
  assert.equal(isTestFile("Tests/FeatureTests/Behavior.swift"), false);
  assert.equal(isTestFile("ui/behavior.test.jsx"), false);
});

test("advisory content does not become a blocking policy; unreadable test bytes do", () => {
  const root = mkdtempSync(join(tmpdir(), "engine-advisory-"));
  try {
    mkdirSync(join(root, "docs")); mkdirSync(join(root, "tests"));
    writeFileSync(join(root, "docs/guide.md"), "TODO and TBD\n");
    writeFileSync(join(root, "tests/example.ts"), "getter();\n");
    const subject = new ValidationSubject(root, resolveChangeScope(root, { all: true }));
    assert.equal(checkTestQuality(subject, ["tests/example.ts"]).status, "warning");
    const prose = checkProse(subject, ["docs/guide.md"]);
    assert.equal(prose.finding_count, 2); assert.ok(prose.findings.every(f => f.severity === "advisory"));
    writeFileSync(join(root, "tests/example.ts"), Buffer.from([0xff]));
    assert.equal(checkTestQuality(subject, ["tests/example.ts"]).status, "failed");
    writeFileSync(join(root, "docs/guide.md"), Buffer.from([0xff]));
    const unreadable = checkProse(subject, ["docs/guide.md"]);
    assert.equal(normalizeCheck({ stdout: JSON.stringify(unreadable), stderr: "", exit_code: 0, termination_reason: "completed" }, []).status, "failed");
  } finally { rmSync(root, { recursive: true }); }
});
