import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ValidationSubject, resolveChangeScope } from "../src/change-subject.ts";
import { checkMaintainability, type MaintainabilityOptions } from "../src/checkers/maintainability.ts";
import { adapterCapabilities } from "../src/checkers/native-analysis.ts";
import { maintainabilityInputs } from "../src/checkers/maintainability-inputs.ts";
const schema = JSON.parse(readFileSync(new URL("../../../src/project_governance_runtime/defaults/schemas/quality-disposition.schema.json", import.meta.url), "utf8"));
const options: MaintainabilityOptions = { policy: { maintainability: { language_neutral_checks: ["physical-file-size"], active_adapters: Object.keys(adapterCapabilities), declaration_enrichment: "optional-native", thresholds: { file_lines_blocking: 3, type_lines_blocking: 3 } } }, dispositions: { version: 2, owner: "team", dispositions: [] }, dispositionSchema: schema, prior: null, historyError: "", today: "2026-09-20" };

test("maintainability joins captured staged source, native analysis, and blocking findings", async () => {
  const root = mkdtempSync(join(tmpdir(), "maintainability-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
    writeFileSync(join(root, "sample.ts"), "class Example {}\n"); git("add", "."); git("commit", "-qm", "base");
    writeFileSync(join(root, "sample.ts"), "class Example {\n a = 1;\n b = 2;\n}\n"); git("add", ".");
    const scope = resolveChangeScope(root, { staged: true }), subject = new ValidationSubject(root, scope);
    writeFileSync(join(root, "sample.ts"), "class Example {}\n");
    const result = await checkMaintainability(subject, scope, options);
    assert.equal(result.status, "failed");
    assert.deepEqual(result.findings.map(f => f.rule_id), ["quality.large-type"]);
    assert.equal(result.coverage["typescript-compiler"], 1);
    const managed = await checkMaintainability(subject, scope, { ...options, managedPaths: new Set(["sample.ts"]) });
    assert.equal(managed.status, "passed");
    const lostHistory = await checkMaintainability(subject, scope, { ...options, historyError: "unavailable" });
    assert.ok(lostHistory.findings.some(f => f.rule_id === "quality.disposition-history-unreadable"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("policy and review history are read from captured Git images", () => {
  const root = mkdtempSync(join(tmpdir(), "maintainability-inputs-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
    mkdirSync(join(root, "config/policies"), { recursive: true });
    const policyPath = join(root, "config/policies/code-quality.yaml"), registry = join(root, "config/policies/code-quality-dispositions.yaml");
    writeFileSync(policyPath, JSON.stringify(options.policy));
    writeFileSync(registry, JSON.stringify({ ...options.dispositions, version: 1 }));
    git("add", "."); git("commit", "-qm", "base");
    writeFileSync(registry, JSON.stringify({ ...options.dispositions, owner: "reviewed" })); git("add", ".");
    const scope = resolveChangeScope(root, { staged: true }), subject = new ValidationSubject(root, scope);
    writeFileSync(policyPath, "maintainability: disabled"); writeFileSync(registry, "invalid: true");
    const inputs = maintainabilityInputs(subject, scope, schema, "2026-09-20");
    assert.deepEqual(inputs.policy, options.policy);
    assert.equal(inputs.dispositions["owner"], "reviewed");
    assert.equal(inputs.prior?.owner, "team");
    assert.equal(inputs.prior?.version, 1);
    assert.equal(inputs.historyError, "");
    git("rm", "-f", "config/policies/code-quality-dispositions.yaml");
    const deletion = resolveChangeScope(root, { staged: true });
    const deleted = maintainabilityInputs(new ValidationSubject(root, deletion), deletion, schema, "2026-09-20");
    assert.equal(deleted.dispositions["invalid_document_shape"], "deleted");
    assert.equal(deleted.prior?.owner, "team");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
