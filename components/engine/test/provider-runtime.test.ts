import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { providerRuntime } from "../src/provider-runtime.ts";

test("standalone jobs need no runtime while governed or inherited jobs cannot fall back", () => {
  const root = mkdtempSync(join(tmpdir(), "provider-runtime-"));
  try {
    assert.equal(providerRuntime(root, {}), null);
    assert.throws(() => providerRuntime(root, { GOVERNANCE_GENERATION_TOKEN: "partial" }), /complete parent/);
    assert.throws(() => providerRuntime(root, { GOVERNANCE_PARENT_TASK: "legacy" }), /Legacy parent/);
    mkdirSync(join(root, "config/governance"), { recursive: true });
    writeFileSync(join(root, "config/governance/runtime.lock.yaml"), "schema_version: 1\n");
    assert.throws(() => providerRuntime(root, {}), /installed runtime/);
    assert.throws(() => providerRuntime(root, { GOVERNANCE_GENERATION_TOKEN: "token", GOVERNANCE_GENERATION_OWNER: "owner", GOVERNANCE_GENERATION_REGISTRY: join(root, "missing.sqlite") }), /runtime lock fields/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
