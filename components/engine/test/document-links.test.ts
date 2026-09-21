import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ValidationSubject, resolveChangeScope } from "../src/change-subject.ts";
import { documentLinkIssues } from "../src/checkers/document-links.ts";

test("documentation targets come from captured graph rather than unrelated working-tree additions", () => {
  const root = mkdtempSync(join(tmpdir(), "document-links-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
    writeFileSync(join(root, "README.md"), "Start\n"); git("add", "."); git("commit", "-qm", "base");
    writeFileSync(join(root, "README.md"), "[missing](target.md)\n[outside](../private.md)\n"); git("add", ".");
    const scope = resolveChangeScope(root, { staged: true });
    writeFileSync(join(root, "target.md"), "Later untracked content\n");
    const issues = documentLinkIssues(new ValidationSubject(root, scope), scope);
    assert.equal(issues.length, 2); assert.ok(issues.some(issue => issue.includes("does not exist"))); assert.ok(issues.some(issue => issue.includes("escapes")));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
