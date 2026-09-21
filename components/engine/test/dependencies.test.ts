import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ValidationSubject, resolveChangeScope } from "../src/change-subject.ts";
import { checkDependencies } from "../src/checkers/dependencies.ts";

test("dependency checker joins staged package changes to captured exact release evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "dependencies-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  const write = (path: string, value: unknown) => writeFileSync(join(root, path), JSON.stringify(value));
  const options = { policyPath: "config/policy.yaml", evidencePath: "config/evidence.yaml", overridesPath: "config/overrides.yaml", asOf: "2026-09-20" };
  try {
    git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture"); mkdirSync(join(root, "config"));
    write("config/policy.yaml", { version: 1, owner: "team", minimum_age_days: 14, override_max_days: 7, fail_closed_when_unknown: true, evidence_path: options.evidencePath });
    write("package.json", { dependencies: {} }); git("add", "."); git("commit", "-qm", "base");
    write("package.json", { dependencies: { pkg: "1.2.3" } });
    write(options.evidencePath, { version: 2, owner: "team", records: [{ ecosystem: "npm", name: "pkg", version: "1.2.3", artifact_type: "direct", published_at: "2026-09-01", evaluated_at: "2026-09-15", source_url: "https://registry.npmjs.org/pkg/1.2.3" }] });
    git("add", "."); const scope = resolveChangeScope(root, { staged: true });
    write("package.json", { dependencies: { other: "9.0.0" } }); write(options.evidencePath, {});
    const result = checkDependencies(new ValidationSubject(root, scope), scope, options);
    assert.equal(result.status, "passed"); assert.equal(result.checked[0]?.["status"], "evidence-verified");
    git("add", "."); const changed = resolveChangeScope(root, { staged: true });
    const rejected = checkDependencies(new ValidationSubject(root, changed), changed, options);
    assert.equal(rejected.status, "failed"); assert.ok(rejected.findings.some(f => f.rule_id === "dependency.evidence-invalid"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
