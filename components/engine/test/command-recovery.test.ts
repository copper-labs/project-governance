import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { digest, durableJson } from "../src/core.ts";
import { RuntimeGenerations } from "../src/runtime-generations.ts";
import { reconcileCommand } from "../src/command-recovery.ts";
import { DatabaseSync } from "node:sqlite";

test("confirmed command cleanup releases only its retained runtime reader and supports replay", () => {
  const root = mkdtempSync(join(tmpdir(), "runtime-command-recovery-"));
  const registry = join(root, "generations.sqlite"), generations = new RuntimeGenerations(registry);
  try {
    // Seed the post-activation crash boundary; package activation is qualified separately.
    const fixture = new DatabaseSync(registry);
    fixture.prepare("UPDATE current SET revision=1,directory=? WHERE id=1").run(root); fixture.close();
    const runtime = { root, registry, directory: root, revision: 1, lockDigest: "fixture" };
    const request = { version: 1, id: "job", runtime };
    const hash = digest(request), reader = { registry, ...generations.acquire(`command:${hash}`) };
    const other = generations.acquire("other-owner");
    const directory = join(root, "job");
    durableJson(join(directory, "request.json"), request);
    durableJson(join(directory, "generation.json"), { requestDigest: hash, reader });
    const receipt = { version: 1, requestDigest: hash, state: "failed", cleanup: "unknown" };
    durableJson(join(directory, "result.json"), receipt);
    assert.throws(() => reconcileCommand(directory, hash), /confirmed cleanup/);
    assert.equal(generations.state().readers.length, 2);
    durableJson(join(directory, "result.json"), { ...receipt, cleanup: "confirmed" });
    durableJson(join(directory, "generation.json"), { requestDigest: hash, reader: { ...reader, token: other.token } });
    assert.throws(() => reconcileCommand(directory, hash), /ownership mismatch/);
    assert.equal(generations.state().readers.length, 2);
    durableJson(join(directory, "generation.json"), { requestDigest: hash, reader });
    assert.equal(reconcileCommand(directory, hash).state, "reconciled");
    assert.equal(reconcileCommand(directory, hash).state, "reconciled");
    assert.deepEqual(generations.state().readers.map(row => row.owner), ["other-owner"]);
    generations.release(other.token, other.owner);
  } finally { generations.close(); rmSync(root, { recursive: true, force: true }); }
});
