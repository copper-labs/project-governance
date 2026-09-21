import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { ResourceRegistry } from "../src/resources.ts";

test("cross-repository owners contend atomically and cannot steal after reconnect", () => {
  const dir = mkdtempSync(join(tmpdir(), "engine-resource-"));
  const path = join(dir, "registry.sqlite");
  const a = new ResourceRegistry(path), b = new ResourceRegistry(path);
  try {
    assert.equal(a.hostId, b.hostId);
    const leases = a.acquire(["port:8081", "device:fixture"], "repo-a/run-1", "operation-a");
    assert.deepEqual(a.acquire(["device:fixture", "port:8081"], "repo-a/run-1", "operation-a"), leases);
    assert.throws(() => b.acquire(["build:free", "port:8081"], "repo-b/run-1", "operation-b"), /RESOURCE_BUSY/);
    assert.ok(!b.inspect().some(r => r.resource === "build:free"), "partial acquisition rolled back");
    a.release(leases, "fixture-adapter:all-effects-stopped");
    const next = b.acquire(["port:8081"], "repo-b/run-1", "operation-b")[0]!;
    assert.throws(() => a.release(leases, "stale-cleanup"), /STALE_OWNER/);
    assert.throws(() => a.acquire(["device:fixture", "port:8081"], "repo-a/run-1", "operation-a"), /STALE_OWNER/);
    assert.equal(next.generation, 2);
  } finally { a.close(); b.close(); rmSync(dir, { recursive: true }); }
});

test("resource obligation survives lost observers and a retained service transfers explicitly", () => {
  const dir = mkdtempSync(join(tmpdir(), "engine-resource-"));
  const path = join(dir, "registry.sqlite");
  let a = new ResourceRegistry(path);
  const lease = a.acquire(["metro:workspace:8088"], "run", "operation")[0]!;
  a.close(); a = new ResourceRegistry(path);
  try {
    assert.throws(() => a.acquire([lease.resource], "new-run", "other"), /BUSY/);
    const retained = a.transfer(lease, "development-session", "session-ack:1");
    assert.throws(() => a.assertHeld(lease), /STALE_OWNER/);
    a.assertHeld(retained);
    a.release([retained], "session:stopped");
    assert.equal(a.inspect()[0]!.state, "released");
  } finally { a.close(); rmSync(dir, { recursive: true }); }
});

test("an incompatible registry is refused without migration or data loss", () => {
  const dir = mkdtempSync(join(tmpdir(), "engine-resource-"));
  const path = join(dir, "registry.sqlite");
  const db = new DatabaseSync(path);
  db.exec("PRAGMA user_version=3; CREATE TABLE future(value TEXT); INSERT INTO future VALUES('preserve')"); db.close();
  try {
    assert.throws(() => new ResourceRegistry(path), /PROTOCOL_INCOMPATIBLE/);
    const check = new DatabaseSync(path);
    assert.equal(check.prepare("PRAGMA user_version").get()!["user_version"], 3);
    assert.equal(check.prepare("SELECT value FROM future").get()!["value"], "preserve"); check.close();
  } finally { rmSync(dir, { recursive: true }); }
});

test("workspace protocol upgrade requires drained prior holders and preserves host identity", () => {
  const dir = mkdtempSync(join(tmpdir(), "engine-resource-upgrade-"));
  const path = join(dir, "registry.sqlite");
  let registry = new ResourceRegistry(path);
  const host = registry.hostId;
  const leases = registry.acquire(["device:retained"], "owner", "operation");
  registry.close();
  const db = new DatabaseSync(path); db.exec("PRAGMA user_version=1"); db.close();
  try {
    assert.throws(() => new ResourceRegistry(path), /MIGRATION_REQUIRED/);
    assert.throws(() => new ResourceRegistry(path, { migrateFromProtocol1: true }), /DRAIN_REQUIRED/);
    const old = new DatabaseSync(path);
    assert.equal(old.prepare("PRAGMA user_version").get()!.user_version, 1);
    old.prepare("UPDATE resources SET state='released',observation=? WHERE resource=?").run("legacy adapter cleanup", leases[0]!.resource);
    old.close();
    registry = new ResourceRegistry(path, { migrateFromProtocol1: true, authority: "fixture migration" });
    assert.equal(registry.hostId, host);
    assert.equal(registry.inspect()[0]!.observation, "legacy adapter cleanup");
    registry.close();
  } finally { rmSync(dir, { recursive: true }); }
});
