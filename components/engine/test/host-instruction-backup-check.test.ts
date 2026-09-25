import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeGenerations } from "../src/runtime-generations.ts";
import { backupRuntimeState } from "../src/runtime-backup.ts";
import { hostInstructionBackupScope } from "../src/host-instruction-backup.ts";
import { verifyHostInstructionBackup } from "../src/host-instruction-backup-check.ts";
import { installHostInstructions } from "../src/host-instruction-installation.ts";
import { PREVIOUS_LEGACY_STARTUP_BLOCK } from "../src/host-instruction-merge.ts";
import { COMPILED_HOST_BLOCK } from "../src/provider-guidance.ts";

test("host migration verifies backed originals, partial application and authored drift", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "host-backed-"))), registryPath = join(root, "registry.sqlite");
  const generations = new RuntimeGenerations(registryPath);
  try {
    writeFileSync(join(root, "AGENTS.md"), PREVIOUS_LEGACY_STARTUP_BLOCK+"\nAuthored guidance\n");
    const scope = hostInstructionBackupScope(root, COMPILED_HOST_BLOCK), maintenance = generations.beginMaintenance("fixture", 0), backup = join(root, "backup");
    await backupRuntimeState(registryPath, maintenance.token, maintenance.owner, scope.inputs, backup);
    assert.equal(verifyHostInstructionBackup(scope.plan, COMPILED_HOST_BLOCK, backup).complete, false);
    writeFileSync(join(root, "CLAUDE.md"), "");
    assert.throws(() => verifyHostInstructionBackup(scope.plan, COMPILED_HOST_BLOCK, backup), /outside the backed transition/);
    unlinkSync(join(root, "CLAUDE.md"));
    const first = scope.plan.writes[0]!; writeFileSync(join(root, first.path), first.content);
    const resumed = verifyHostInstructionBackup(scope.plan, COMPILED_HOST_BLOCK, backup);
    installHostInstructions(root, COMPILED_HOST_BLOCK, { expectedPlanDigest: resumed.remainingPlanDigest });
    assert.equal(verifyHostInstructionBackup(scope.plan, COMPILED_HOST_BLOCK, backup).complete, true);
    writeFileSync(join(root, "GEMINI.md"), "Concurrent authored text\n");
    assert.throws(() => verifyHostInstructionBackup(scope.plan, COMPILED_HOST_BLOCK, backup), /outside the backed transition/);
    const altered = structuredClone(scope.plan); altered.writes[0]!.content += "unapproved";
    assert.throws(() => verifyHostInstructionBackup(altered, COMPILED_HOST_BLOCK, backup), /differs from backed content/);
  } finally { generations.close(); rmSync(root, { recursive: true, force: true }); }
});

test("interrupted host application durably blocks lock-only finalization and recovery", async () => {
  const { requireHostInstructionCompletion } = await import("../src/host-instruction-transition.ts");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "host-admission-"))), registry = join(root, "registry.sqlite");
  let generations = new RuntimeGenerations(registry);
  try {
    writeFileSync(join(root, "AGENTS.md"), "Authored guidance\n");
    const scope = hostInstructionBackupScope(root, COMPILED_HOST_BLOCK), maintenance = generations.beginMaintenance("fixture", 0), backup = join(root, "backup");
    await backupRuntimeState(registry, maintenance.token, maintenance.owner, scope.inputs, backup);
    const required = requireHostInstructionCompletion(registry, scope.plan, COMPILED_HOST_BLOCK, backup, maintenance.token, maintenance.owner);
    const first = scope.plan.writes[0]!;
    writeFileSync(join(root, first.path), first.content);
    generations.close(); generations = new RuntimeGenerations(registry);
    assert.throws(() => generations.endMaintenance(maintenance.token, maintenance.owner), /completion readback required/);
    assert.throws(() => generations.rollback(0, maintenance.token, "rollback", true), /completion readback required/);
    assert.throws(() => generations.finishMaintenance(maintenance.token, maintenance.owner, 0, { lockDigest: "lock", readback: "version", workspace: root }), /completion readback required/);
    assert.throws(() => generations.requireCompletion(maintenance.token, maintenance.owner, "hostInstructionsDigest", "different"), /identity differs/);
    const resumed = requireHostInstructionCompletion(registry, scope.plan, COMPILED_HOST_BLOCK, backup, maintenance.token, maintenance.owner);
    assert.equal(resumed.hostInstructionsDigest, required.hostInstructionsDigest);
    assert.equal(resumed.complete, false);
    installHostInstructions(root, COMPILED_HOST_BLOCK, { expectedPlanDigest: resumed.remainingPlanDigest });
    assert.equal(verifyHostInstructionBackup(scope.plan, COMPILED_HOST_BLOCK, backup).complete, true);
    generations.finishMaintenance(maintenance.token, maintenance.owner, 0, { lockDigest: "lock", readback: "version", workspace: root, hostInstructionsDigest: resumed.hostInstructionsDigest });
    assert.equal(generations.state().maintenance, null);
  } finally { generations.close(); rmSync(root, { recursive: true, force: true }); }
});
