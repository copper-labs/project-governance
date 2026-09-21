import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, realpathSync, writeFileSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeGenerations } from "../src/runtime-generations.ts";
import { backupRuntimeState } from "../src/runtime-backup.ts";
import { inspectRuntimeBackup } from "../src/runtime-backup-inspection.ts";
import { hostInstructionBackupScope } from "../src/host-instruction-backup.ts";
import { COMPILED_HOST_BLOCK } from "../src/provider-guidance.ts";

test("maintenance backup includes WAL state, preserves files and retains failed recovery evidence", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "runtime-backup-"))), registry = join(root, "registry.sqlite");
  const generations = new RuntimeGenerations(registry), database = new DatabaseSync(join(root, "tasks.sqlite"));
  try {
    database.exec("PRAGMA journal_mode=WAL; CREATE TABLE evidence(value TEXT); INSERT INTO evidence VALUES('retained');");
    writeFileSync(join(root, "lock.json"), "authored lock");
    const inputs = [{ path: join(root, "tasks.sqlite"), kind: "sqlite" as const }, { path: join(root, "lock.json"), kind: "file" as const }];
    await assert.rejects(() => backupRuntimeState(registry, "unknown", "updater", inputs, join(root, "denied")), /maintenance/);
    const maintenance = generations.beginMaintenance("updater", 0);
    const result = await backupRuntimeState(registry, maintenance.token, maintenance.owner, inputs, join(root, "snapshot"));
    assert.equal(result.state, "verified");
    const copied = new DatabaseSync(join(root, "snapshot/0.sqlite"), { readOnly: true });
    try { assert.equal(copied.prepare("SELECT value FROM evidence").get()?.value, "retained"); } finally { copied.close(); }
    assert.equal(readFileSync(join(root, "snapshot/1.data"), "utf8"), "authored lock");
    assert.equal(inspectRuntimeBackup(join(root, "snapshot")).state, "verified");
    writeFileSync(join(root, "snapshot/1.data"), "corrupted copy");
    assert.throws(() => inspectRuntimeBackup(join(root, "snapshot")), /payload changed/);
    // Native SQLite backup yields; mutate the already copied file during the later database copy.
    const mutation = setImmediate(() => writeFileSync(join(root, "lock.json"), "concurrent edit"));
    try {
      await assert.rejects(() => backupRuntimeState(registry, maintenance.token, maintenance.owner,
        [inputs[1]!, inputs[0]!], join(root, "drift")), /File changed/);
      assert.equal(JSON.parse(readFileSync(join(root, "drift/backup.json"), "utf8")).state, "failed");
    } finally { clearImmediate(mutation); }
    await assert.rejects(() => backupRuntimeState(registry, maintenance.token, maintenance.owner,
      [{ path: join(root, "missing"), kind: "file" }], join(root, "failed")));
    assert.equal(JSON.parse(readFileSync(join(root, "failed/backup.json"), "utf8")).state, "failed");
    assert.throws(() => inspectRuntimeBackup(join(root, "failed")), /Invalid backup receipt/);
    assert.equal(generations.state().maintenance?.token, maintenance.token);
  } finally { database.close(); generations.close(); rmSync(root, { recursive: true, force: true }); }
});

test("host backup scope records absent entries, deduplicates aliases and rejects concurrent creation", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "host-backup-"))), registry = join(root, "registry.sqlite");
  const generations = new RuntimeGenerations(registry), database = new DatabaseSync(join(root, "tasks.sqlite"));
  try {
    writeFileSync(join(root, "AGENTS.md"), "Authored instructions"); symlinkSync("AGENTS.md", join(root, "CLAUDE.md"));
    writeFileSync(join(root, "AGENTS.override.md"), "");
    database.exec("CREATE TABLE evidence(value TEXT)");
    const scope = hostInstructionBackupScope(root, COMPILED_HOST_BLOCK);
    assert.equal(scope.inputs.length, 3);
    assert.deepEqual(scope.inputs.filter(input => input.kind === "absent").map(input => input.path), [join(root, "GEMINI.md")]);
    const maintenance = generations.beginMaintenance("host-updater", 0);
    const result = await backupRuntimeState(registry, maintenance.token, maintenance.owner, scope.inputs, join(root, "snapshot"));
    assert.equal(result.version, 3);
    assert.equal(inspectRuntimeBackup(join(root, "snapshot")).records.length, 3);
    const absent = scope.inputs.find(input => input.kind === "absent")!;
    const mutation = setImmediate(() => writeFileSync(absent.path, "New authored instructions"));
    try {
      await assert.rejects(() => backupRuntimeState(registry, maintenance.token, maintenance.owner,
        [absent, { path: join(root, "tasks.sqlite"), kind: "sqlite" }], join(root, "drift")), /absent backup source exists/);
    } finally { clearImmediate(mutation); }
    assert.equal(generations.state().maintenance?.token, maintenance.token);
    assert.equal(readFileSync(absent.path, "utf8"), "New authored instructions");
    // The historical absence record remains inspectable without claiming that the live path is still absent.
    assert.equal(inspectRuntimeBackup(join(root, "snapshot")).state, "verified");
  } finally { database.close(); generations.close(); rmSync(root, { recursive: true, force: true }); }
});
