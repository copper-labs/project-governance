import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
import { checkAppleDependencies } from "../src/checkers/apple-dependencies.ts";
const schema = JSON.parse(readFileSync(new URL("../../../src/project_governance_runtime/defaults/schemas/apple-dependency-exception.schema.json", import.meta.url), "utf8"));

test("Apple policy classifies captured deleted commands and requires work-bound approval", () => {
  const root = mkdtempSync(join(tmpdir(), "apple-dependencies-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
    writeFileSync(join(root, "install.sh"), "pod install\n"); git("add", "."); git("commit", "-qm", "base"); git("rm", "install.sh");
    const scope = resolveChangeScope(root, { staged: true }), subject = new ValidationSubject(root, scope);
    const options = { policy: { applies: "auto" }, exceptions: { version: 1, owner: "team", exceptions: [] as Record<string, unknown>[] }, schema, workId: "work-1", today: "2026-09-20", stage: "pre-commit" };
    assert.equal(checkAppleDependencies(subject, scope, options).findings[0]?.rule_id, "apple.cocoapods-exception-required");
    options.exceptions.exceptions.push({ work_id: "work-1", products: ["fixture"], path_globs: ["**/*.sh"], reason: "migration-bridge", rationale: "Preserve integration during the approved migration.", status: "approved", operator: "operator", approved_on: "2026-09-19", expires: "2026-10-01", spm_analysis: "The current integration requires an approved bridge.", compatibility_evidence: ["fixture"], compatibility_tests: ["fixture"], migration_or_deletion_gate: "operator-approved" });
    assert.equal(checkAppleDependencies(subject, scope, options).status, "passed");
    assert.equal(checkAppleDependencies(subject, scope, { ...options, workId: "other" }).status, "failed");
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("Apple discovery does not load unrelated large repository artifacts", () => {
  const root = mkdtempSync(join(tmpdir(), "apple-discovery-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init", "-q");
    writeFileSync(join(root, "large.bin"), Buffer.alloc(17 * 1024 * 1024));
    const scope = resolveChangeScope(root, { all: true });
    const result = checkAppleDependencies(new ValidationSubject(root, scope), scope, { policy: { applies: "auto" }, exceptions: {}, schema, workId: "", today: "2026-09-20", stage: "audit" });
    assert.equal(result.status, "not-applicable");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
