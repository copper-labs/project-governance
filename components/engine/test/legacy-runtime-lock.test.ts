import { test } from "node:test";
import assert from "node:assert/strict";
import { legacyRuntimeLock } from "../src/legacy-runtime-lock.ts";
test("migration preserves wheel identity without accepting unsafe artifact locations", () => {
  const lock = { schema_version: 1, package: "project-governance-runtime", version: "2.8.2",
    wheel: "project_governance_runtime-2.8.2-py3-none-any.whl", sha256: "a".repeat(64), source_commit: "b".repeat(40),
    python: ">=3.9,<4", configuration_schema: 2, release_base_url: "https://example.invalid/releases" };
  assert.deepEqual(legacyRuntimeLock(lock), lock);
  for (const update of [{ wheel: "../runtime.whl" }, { sha256: "missing" }, { source_commit: "main" },
    { release_base_url: "https://user:secret@example.invalid" }, { schema_version: 2 }, { configuration_schema: 0 }]) {
    assert.throws(() => legacyRuntimeLock({ ...lock, ...update }));
  }
});
