import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeGenerations } from "../src/runtime-generations.ts";

test("protocol five maintenance survives migration and repair requirements survive reconnect", () => {
  const root = mkdtempSync(join(tmpdir(), "repair-admission-")), path = join(root, "registry.sqlite");
  try {
    const initial = new RuntimeGenerations(path);
    const maintenance = initial.beginMaintenance("repair-owner", 0);
    initial.close();
    const legacy = new DatabaseSync(path);
    legacy.exec("DROP TABLE completion_requirements; PRAGMA user_version=5;"); legacy.close();
    const migrated = new RuntimeGenerations(path);
    assert.equal(migrated.state().maintenance?.token, maintenance.token);
    migrated.requireRepair(maintenance.token, maintenance.owner, "preserved-inputs"); migrated.close();
    const resumed = new RuntimeGenerations(path);
    try {
      resumed.requireRepair(maintenance.token, maintenance.owner, "preserved-inputs");
      assert.throws(() => resumed.requireRepair(maintenance.token, maintenance.owner, "different-inputs"), /identity differs/);
      assert.throws(() => resumed.endMaintenance(maintenance.token, maintenance.owner), /preservation readback required/);
      assert.throws(() => resumed.finishMaintenance(maintenance.token, maintenance.owner, 0,
        { lockDigest: "lock", readback: "version", workspace: root }), /preservation readback required/);
      assert.equal(resumed.state().maintenance?.token, maintenance.token);
      assert.equal(resumed.finalization(maintenance.token, maintenance.owner), null);
    } finally { resumed.close(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("protocol six pending preservation obligation survives generalized completion migration", () => {
  const root = mkdtempSync(join(tmpdir(), "completion-migration-")), path = join(root, "registry.sqlite");
  try {
    const initial = new RuntimeGenerations(path), maintenance = initial.beginMaintenance("repair-owner", 0);
    initial.requireRepair(maintenance.token, maintenance.owner, "preserved-inputs"); initial.close();
    const legacy = new DatabaseSync(path);
    legacy.exec(`CREATE TABLE repair_requirements (token TEXT PRIMARY KEY, owner TEXT NOT NULL, digest TEXT NOT NULL);
      INSERT INTO repair_requirements SELECT token,owner,digest FROM completion_requirements;
      DROP TABLE completion_requirements; PRAGMA user_version=6;`);
    legacy.close();
    const migrated = new RuntimeGenerations(path);
    try {
      migrated.requireRepair(maintenance.token, maintenance.owner, "preserved-inputs");
      assert.throws(() => migrated.endMaintenance(maintenance.token, maintenance.owner), /preservation readback required/);
      assert.throws(() => migrated.finishMaintenance(maintenance.token, maintenance.owner, 0,
        { lockDigest: "lock", readback: "version", workspace: root, hostInstructionsDigest: "preserved-inputs" }), /preservation readback required/);
      migrated.finishMaintenance(maintenance.token, maintenance.owner, 0,
        { lockDigest: "lock", readback: "version", workspace: root, preservedInputsDigest: "preserved-inputs" });
      assert.equal(migrated.state().maintenance, null);
    } finally { migrated.close(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
