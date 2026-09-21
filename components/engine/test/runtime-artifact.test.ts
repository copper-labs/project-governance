import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyRuntimeArchive } from "../src/runtime-artifact.ts";
import type { CompiledRuntimeLock } from "../src/runtime-lock.ts";
test("archive verifier rejects corruption, oversized input and symlink substitution", () => {
  const root = mkdtempSync(join(tmpdir(), "runtime-archive-"));
  try {
    const path = join(root, "package.tgz"), contents = Buffer.alloc(150000, 42);
    writeFileSync(path, contents);
    const lock: CompiledRuntimeLock = { schema_version: 2, package: "@organta/project-governance", version: "3.0.0",
      artifact: { url: "file:///package.tgz", integrity: "sha512-" + createHash("sha512").update(contents).digest("base64") },
      source_commit: "a".repeat(40), node: ">=24.16.0 <25", configuration_schema: 1 };
    assert.equal(verifyRuntimeArchive(path, lock).bytes, 150000);
    assert.throws(() => verifyRuntimeArchive(path, lock, 100), /bounded ordinary file/);
    symlinkSync(path, join(root, "alias.tgz"));
    assert.throws(() => verifyRuntimeArchive(join(root, "alias.tgz"), lock));
    contents[70000] = 43; writeFileSync(path, contents);
    assert.throws(() => verifyRuntimeArchive(path, lock), /integrity mismatch/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
