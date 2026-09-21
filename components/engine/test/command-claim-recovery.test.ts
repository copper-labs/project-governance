import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { digest, durableJson } from "../src/core.ts";
import { ResourceRegistry } from "../src/resources.ts";
import { reconcileCommandClaims } from "../src/command-claim-recovery.ts";

test("published cleanup reconciles retained claims and replay cannot release a newer holder", () => {
  const root = mkdtempSync(join(tmpdir(), "claim-recovery-"));
  const registry = new ResourceRegistry(join(root, "registry.sqlite"));
  try {
    const directory = join(root, "job");
    const request = { version: 1, id: "job", coordination: { registry: registry.path, resources: ["fixture:resource"] } };
    const hash = digest(request);
    durableJson(join(directory, "request.json"), request);
    const leases = registry.acquire(request.coordination.resources, hash, hash);
    const record = { requestDigest: hash, registry: registry.path, leases };
    durableJson(join(directory, "claims.json"), record);
    const receipt = { version: 1, requestDigest: hash, state: "succeeded", cleanup: "unknown" };
    durableJson(join(directory, "result.json"), receipt);
    assert.throws(() => reconcileCommandClaims(directory, hash), /Confirmed command cleanup/);
    registry.assertHeld(leases[0]!);
    durableJson(join(directory, "result.json"), { ...receipt, cleanup: "confirmed" });
    durableJson(join(directory, "claims.json"), { ...record, leases: [{ ...leases[0], resource: "other" }] });
    assert.throws(() => reconcileCommandClaims(directory, hash), /scope mismatch/);
    registry.assertHeld(leases[0]!);
    durableJson(join(directory, "claims.json"), record);
    reconcileCommandClaims(directory, hash);
    const newer = registry.acquire(request.coordination.resources, "new-owner", "new-operation");
    reconcileCommandClaims(directory, hash);
    registry.assertHeld(newer[0]!);
    assert.throws(() => reconcileCommandClaims(directory, "wrong"), /request mismatch/);
    durableJson(join(directory, "result.json"), { ...receipt, cleanup: "confirmed", changed: true });
    assert.throws(() => reconcileCommandClaims(directory, hash), /STALE_OWNER/);
    registry.assertHeld(newer[0]!);
  } finally { registry.close(); rmSync(root, { recursive: true, force: true }); }
});
