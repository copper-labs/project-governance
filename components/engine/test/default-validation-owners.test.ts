import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { executeChecks } from "../src/check-execution.ts";
import { PackagedCheckerAssets } from "../src/checker-assets.ts";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
import { loadSubjectPacks } from "../src/pack-configuration.ts";
import { buildPlan } from "../src/planning.ts";
import { lintCoverage, lintPlanBlockers } from "../src/lint-coverage.ts";
import { PROJECT_DEFAULTS } from "../src/runtime-project-defaults.ts";

const assets = fileURLToPath(new URL("../../../src/project_governance_runtime/", import.meta.url));
const stage = "pre-commit", asOf = "2026-10-06T12:00:00Z";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "default-validation-owners-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content);
  };
  git("init", "-q"); write("README.md", "Synthetic validation ownership fixture.\n"); git("add", ".");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Fixture baseline");
  const capture = () => {
    const scope = resolveChangeScope(root, { staged: true }), subject = new ValidationSubject(root, scope);
    const registry = loadSubjectPacks(subject, join(assets, "packs"));
    const plan = buildPlan(registry, { stage, mode: "impacted", changedPaths: scope.records.map(record => record.path) });
    return { scope, subject, registry, plan };
  };
  return { root, git, write, capture, clean: () => rmSync(root, { recursive: true, force: true }) };
}

test("default Java and JSONL owners enforce staged findings while the live checkout is repaired", async () => {
  const f = fixture();
  try {
    const java = "src/ExampleHelper.java", jsonl = "data/records.jsonl";
    const oversized = "class ExampleHelper {\n" + "  int value;\n".repeat(499) + "}\n";
    f.write(java, oversized); f.write(jsonl, '{"value":1}  \n'); f.git("add", ".");
    // The candidate owns the old name and bytes even after an unstaged repair replaces both.
    unlinkSync(join(f.root, java)); f.write("src/Example.java", "class Example {}\n"); f.write(jsonl, '{"value":1}\n');
    const captured = f.capture();
    assert.equal(captured.subject.read(java).toString(), oversized);
    assert.equal(readFileSync(join(f.root, jsonl), "utf8"), '{"value":1}\n');
    assert.equal(captured.plan.status, "ready");
    assert.deepEqual(captured.plan.path_matches[java], ["maintainability", "naming", "secrets"]);
    assert.deepEqual(captured.plan.path_matches[jsonl], ["format", "secrets"]);
    assert.deepEqual(captured.plan.selected_packs, ["format", "maintainability", "naming", "secrets"]);
    const request = { scope: captured.scope, subject: captured.subject, registry: captured.registry,
      assets: new PackagedCheckerAssets(join(assets, "defaults")), packIds: new Set(Object.keys(captured.registry)), stage, asOf };
    const result = await executeChecks(captured.registry, captured.plan, request);
    assert.equal(result.status, "failed");
    const command = (pack: string) => result.results.find(row => row.pack_id === pack)!.commands[0]!;
    assert.deepEqual(command("format").findings.map(finding => [finding.rule_id, finding.path, finding.line]), [["format.drift", jsonl, 1]]);
    assert.deepEqual(command("naming").findings.map(finding => [finding.rule_id, finding.path, finding.severity]), [["naming.vague-role", java, "blocking"]]);
    assert.deepEqual(command("maintainability").findings.map(finding => [finding.rule_id, finding.path, finding.actual]), [["quality.large-file", java, 501]]);
    assert.equal((command("maintainability").coverage as Record<string, number>).unenriched, 1);
    assert.equal(command("secrets").status, "passed");

    f.git("add", "-A");
    const clean = f.capture();
    assert.equal(clean.plan.status, "ready");
    const checked = await executeChecks(clean.registry, clean.plan, { ...request, scope: clean.scope, subject: clean.subject, registry: clean.registry });
    assert.equal(checked.status, "passed");
    assert.ok(checked.results.every(row => row.commands.every(command => command.findings.length === 0)));

    f.write("data/records.unknown", "unmapped\n"); f.git("add", "data/records.unknown");
    const unknown = f.capture();
    assert.equal(unknown.plan.status, "blocked");
    assert.deepEqual(unknown.plan.blockers, [{ code: "unknown-impact", message: "Changed paths have no validation owner.", paths: ["data/records.unknown"] }]);
  } finally { f.clean(); }
});

test("generic Java ownership does not establish first-source lint or JSONL record validation", async () => {
  const f = fixture();
  try {
    f.write("config/governance/profile.yaml", PROJECT_DEFAULTS["config/governance/profile.yaml"]!);
    f.write("src/Example.java", "class Example {}\n");
    // Format ownership retains its whitespace claim; record syntax and schema remain project-owned.
    f.write("data/records.jsonl", "not a JSON record\n"); f.git("add", ".");
    const captured = f.capture();
    assert.equal(captured.plan.status, "ready");
    const coverage = lintCoverage(captured.subject, captured.registry);
    assert.equal(coverage.status, "needs-setup");
    const findings: Array<Record<string, unknown>> = coverage.findings;
    assert.deepEqual(findings.map(finding => [finding.code, finding.path, finding.language]), [["lint-first-source-uncovered", "src/Example.java", "java"]]);
    assert.ok(lintPlanBlockers(captured.subject, captured.registry, stage, captured.plan.changed_paths, captured.plan.selected_packs, false, captured.scope)
      .some(finding => finding.code === "lint-first-source-uncovered" && finding.path === "src/Example.java"));
    const format = buildPlan(captured.registry, { stage, mode: "impacted", changedPaths: ["data/records.jsonl"] });
    const result = await executeChecks(captured.registry, format, { scope: captured.scope, subject: captured.subject, registry: captured.registry,
      assets: new PackagedCheckerAssets(join(assets, "defaults")), packIds: new Set(Object.keys(captured.registry)), stage, asOf });
    assert.equal(result.status, "passed");
    assert.deepEqual(result.results.find(row => row.pack_id === "format")!.commands[0]!.findings, []);
  } finally { f.clean(); }
});
