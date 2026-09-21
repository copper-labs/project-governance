import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ResourceRegistry } from "../src/resources.ts";
import { resourceMaintenance } from "../src/resource-maintenance.ts";

test("explicit maintenance preserves registry history and records a single authorized migration", () => {
  const root = mkdtempSync(join(tmpdir(), "resource-maintenance-")), path = join(root, "registry.sqlite");
  const registry = new ResourceRegistry(path), host = registry.hostId;
  const leases = registry.acquire(["fixture:device"], "owner", "operation"); registry.close();
  const old = new DatabaseSync(path); old.exec("PRAGMA user_version=1");
  const args = ["--registry", path, "--authority", "operator:fixture", "--from-protocol", "1"];
  try {
    assert.throws(() => resourceMaintenance(args), /DRAIN_REQUIRED/);
    assert.equal(old.prepare("PRAGMA user_version").get()!.user_version, 1);
    old.prepare("UPDATE resources SET state='released',observation='cleanup' WHERE resource=?").run(leases[0]!.resource);
    const result = resourceMaintenance(args);
    assert.equal(result.hostId, host); assert.equal(result.protocol, 2);
    assert.deepEqual(resourceMaintenance(args), result);
    const events = old.prepare("SELECT data FROM events WHERE kind='protocol-migrated'").all();
    assert.equal(events.length, 1);
    assert.equal(JSON.parse(String(events[0]!.data)).authority, "operator:fixture");
    assert.equal(old.prepare("SELECT observation FROM resources").get()!.observation, "cleanup");
    const empty = join(root, "empty.sqlite"); writeFileSync(empty, "");
    assert.throws(() => resourceMaintenance(["--registry", empty, "--authority", "fixture", "--from-protocol", "1"]), /existing versioned/);
    assert.throws(() => resourceMaintenance(["--registry", path, "--authority", "fixture", "--from-protocol", "2"]), /protocol 1 to 2/);
  } finally { old.close(); rmSync(root, { recursive: true, force: true }); }
});
