import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { BUILTIN_CHECKS, runBuiltinCheck } from "../src/builtin-checks.ts";
import { PackagedCheckerAssets } from "../src/checker-assets.ts";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
const defaults = fileURLToPath(new URL("../../../src/project_governance_runtime/defaults/", import.meta.url));

test("shared invocation reaches every built-in and fails closed for missing required input", async () => {
  const root = mkdtempSync(join(tmpdir(), "builtin-checks-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    mkdirSync(join(root, "config")); cpSync(join(defaults, "policies"), join(root, "config/policies"), { recursive: true });
    const scope = resolveChangeScope(root, { all: true }), subject = new ValidationSubject(root, scope);
    const request = { subject, scope, assets: new PackagedCheckerAssets(defaults), packIds: new Set<string>(BUILTIN_CHECKS), stage: "pre-commit", asOf: "2026-09-20T12:00:00Z" };
    for (const id of BUILTIN_CHECKS) {
      const result = await runBuiltinCheck({ ...request, id });
      assert.ok(["passed", "failed", "warning", "not-applicable"].includes(result.status), id);
      const invocationFailure = result.findings.some(finding => finding.rule_id === "checker.invocation-invalid");
      assert.equal(invocationFailure, ["commit-message", "pr-description"].includes(id), id);
    }
    assert.equal((await runBuiltinCheck({ ...request, id: "not-a-check" })).status, "failed");
    assert.equal((await runBuiltinCheck({ ...request, id: "format", asOf: "invalid" })).status, "failed");
    writeFileSync(join(root, "config/policies/source-comments.yaml"), "[]");
    const missingScope = resolveChangeScope(root, { all: true });
    const missing = await runBuiltinCheck({ ...request, id: "comments", scope: missingScope, subject: new ValidationSubject(root, missingScope) });
    assert.equal(missing.status, "failed");
    assert.equal(missing.findings[0]?.rule_id, "checker.invocation-invalid");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("packaged fixture lookup cannot alias a target path or traverse outside the fixture directory", () => {
  const assets = new PackagedCheckerAssets(defaults);
  assert.ok(assets.fixture("config/validation/fixtures/comment-quality/python-good.py"));
  assert.equal(assets.fixture("target/python-good.py"), null);
  assert.equal(assets.fixture("config/validation/fixtures/comment-quality/../python-good.py"), null);
  assert.throws(() => assets.schema("../secret"));
  assert.ok(assets.schema("secret-waivers"));
});

test("packaged defaults apply to an unconfigured repository but cannot hide staged policy deletion", async () => {
  const root = mkdtempSync(join(tmpdir(), "builtin-defaults-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  try {
    git("init", "-q");
    writeFileSync(join(root, "README.md"), "Example\n");
    const assets = new PackagedCheckerAssets(defaults);
    const run = (id: string, staged = false) => {
      const scope = resolveChangeScope(root, staged ? { staged: true } : { all: true });
      return runBuiltinCheck({ id, scope, subject: new ValidationSubject(root, scope), assets, packIds: new Set(BUILTIN_CHECKS), stage: "pre-commit", asOf: "2026-09-20T12:00:00Z" });
    };
    for (const id of ["naming", "comments", "maintainability", "dependencies"]) assert.equal((await run(id)).status, "passed", id);
    mkdirSync(join(root, "config")); cpSync(join(defaults, "policies"), join(root, "config/policies"), { recursive: true });
    git("add", "."); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "Policies");
    for (const name of ["code-quality", "source-comments", "dependency-freshness"]) rmSync(join(root, `config/policies/${name}.yaml`));
    git("add", "-u");
    for (const id of ["naming", "comments", "maintainability", "dependencies"]) assert.equal((await run(id, true)).status, "failed", id);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("later lifecycle secret checks widen a narrow candidate to the complete repository", async () => {
  const root = mkdtempSync(join(tmpdir(), "builtin-secret-scope-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  try {
    git("init", "-q"); writeFileSync(join(root, "ordinary.txt"), "before\n"); git("add", ".");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "Base");
    writeFileSync(join(root, "ordinary.txt"), "after\n"); git("add", ".");
    writeFileSync(join(root, "untracked.txt"), "ghp_" + "A".repeat(36));
    const scope = resolveChangeScope(root, { staged: true }), subject = new ValidationSubject(root, scope);
    const request = { id: "secrets", scope, subject, assets: new PackagedCheckerAssets(defaults), packIds: new Set(BUILTIN_CHECKS), asOf: "2026-09-20T12:00:00Z" };
    assert.equal((await runBuiltinCheck({ ...request, stage: "pre-commit" })).status, "passed");
    for (const stage of ["pre-push", "pre-pr", "ci-pr", "release"]) assert.equal((await runBuiltinCheck({ ...request, stage })).status, "failed", stage);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
