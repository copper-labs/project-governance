import { test } from "node:test";
import assert from "node:assert/strict";
import { compiledRuntimeLock, compatibleNodeVersion } from "../src/runtime-lock.ts";
const lock = { schema_version: 2, package: "@organta/project-governance", version: "3.0.0-preview.1",
  artifact: { url: "https://example.invalid/releases/governance-3.0.0-preview.1.tgz", integrity: "sha512-" + Buffer.alloc(64).toString("base64") },
  source_commit: "a".repeat(40), node: ">=24.16.0 <25", configuration_schema: 1 };
test("compiled lock preserves exact identity without accepting a wheel or floating package version", () => {
  assert.deepEqual(compiledRuntimeLock(lock), lock);
  for (const patch of [{ schema_version: 1 }, { version: "latest" }, { version: "^3.0.0" }, { source_commit: "main" }, { package: "other" }, { wheel: "old.whl" }]) {
    assert.throws(() => compiledRuntimeLock({ ...lock, ...patch }));
  }
});
test("artifact locks reject credentials, insecure transport, queries and malformed integrity", () => {
  for (const url of ["http://example.invalid/a.tgz", "https://user:secret@example.invalid/a.tgz", "https://example.invalid/a.tgz?token=secret", "file://server/a.tgz"]) {
    assert.throws(() => compiledRuntimeLock({ ...lock, artifact: { ...lock.artifact, url } }));
  }
  assert.throws(() => compiledRuntimeLock({ ...lock, artifact: { ...lock.artifact, integrity: "sha512-short" } }));
  assert.equal(compatibleNodeVersion("v24.16.0"), true);
  for (const value of ["24.15.9", "25.0.0", "24.16.0-preview", "not-a-version"]) assert.equal(compatibleNodeVersion(value), false);
});
