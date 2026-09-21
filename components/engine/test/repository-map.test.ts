import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverContext } from "../src/context-discovery.ts";
import { repositoryMap } from "../src/repository-map.ts";
import { ValidationSubject, resolveChangeScope } from "../src/change-subject.ts";

test("structural discovery uses captured metadata without executing scripts or adopting later edits", () => {
  const root = mkdtempSync(join(tmpdir(), "repository-map-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  try {
    git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "first", scripts: { test: "do-not-execute" }, dependencies: { dependency: "1" } }));
    writeFileSync(join(root, "AGENTS.md"), "Owner instructions");
    writeFileSync(join(root, "code.test.ts"), "test");
    git("add", "."); git("commit", "-qm", "fixture");
    const subject = new ValidationSubject(root, resolveChangeScope(root, { staged: true }));
    const first = repositoryMap(subject);
    assert.deepEqual(first.packages[0]!.targets, ["test"]);
    assert.deepEqual(first.packages[0]!.dependencies, ["dependency"]);
    assert.deepEqual(first.owners, ["AGENTS.md"]);
    assert.deepEqual(first.tests, ["code.test.ts"]);
    const discovered = discoverContext(subject, ["code.test.ts"]);
    assert.deepEqual(discovered.paths, ["package.json"]);
    assert.ok(!discovered.paths.includes("AGENTS.md"));
    assert.throws(() => discoverContext(subject, ["missing.ts"]), /existing ordinary/);
    assert.throws(() => discoverContext(subject, ["../outside.ts"]), /unsafe/);
    writeFileSync(join(root, "package.json"), '{"name":"changed"}');
    assert.equal(repositoryMap(subject).mapDigest, first.mapDigest);
    git("add", "package.json");
    const changed = repositoryMap(new ValidationSubject(root, resolveChangeScope(root, { staged: true })));
    assert.equal(changed.packages[0]!.name, "changed");
    assert.notEqual(changed.mapDigest, first.mapDigest);
    writeFileSync(join(root, "package.json"), '{bad'); git("add", "package.json");
    assert.equal(repositoryMap(new ValidationSubject(root, resolveChangeScope(root, { staged: true }))).issues.length, 1);
  } finally { rmSync(root, { recursive: true }); }
});
