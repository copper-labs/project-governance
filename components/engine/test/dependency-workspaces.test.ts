import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ValidationSubject, resolveChangeScope } from "../src/change-subject.ts";
import { workspaceMatches, localWorkspaceCoordinates } from "../src/checkers/dependency-workspaces.ts";

test("workspace patterns cannot widen local exemptions through unsupported syntax", () => {
  assert.equal(workspaceMatches("packages/a", "packages/*"), true);
  assert.equal(workspaceMatches("packages/a/b", "packages/*"), false);
  assert.equal(workspaceMatches("packages/a/b", "packages/**"), true);
  assert.equal(workspaceMatches("packages/.hidden", "packages/*"), false);
  assert.equal(workspaceMatches("packages/a", "packages/{a,b}"), false);
  assert.equal(workspaceMatches("packages/a", "../packages/*"), false);
});

test("workspace membership uses captured manifests and refuses ambiguous package names", () => {
  const root = mkdtempSync(join(tmpdir(), "dependency-workspaces-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
    writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }));
    for (const name of ["a", "b"]) { mkdirSync(join(root, "packages", name), { recursive: true }); writeFileSync(join(root, "packages", name, "package.json"), JSON.stringify({ name: "duplicate", version: "1.0.0" })); }
    git("add", "."); git("commit", "-qm", "base");
    const scope = resolveChangeScope(root, { staged: true }), subject = new ValidationSubject(root, scope);
    writeFileSync(join(root, "packages/b/package.json"), JSON.stringify({ name: "different", version: "2.0.0" }));
    const result = localWorkspaceCoordinates(subject);
    assert.equal(result.consumers.size, 3); assert.equal(result.versions.size, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
