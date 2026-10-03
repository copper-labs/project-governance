import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { durableJson } from "../src/core.ts";
import { confirmCommandGuardianAcknowledgement } from "../src/command-guardian.ts";
import { processFingerprint, processLiveFingerprint, submitCommand, waitCommand } from "../src/process-owner.ts";

test("completed cleanup acknowledges an exited guardian without accepting missing proof or a reused live PID", async () => {
  const root = mkdtempSync(join(tmpdir(), "guardian-ack-"));
  let owners: Array<{ pid: number; fingerprint: string }> = [];
  try {
    const job = submitCommand(join(root, "job"), { id: "fast-completion", operation: {
      argv: [process.execPath, "-e", "process.exit(0)"], cwd: root, env: {}, expectedExitCodes: [0], effect: "read",
    }, deadlineMs: 3000, outputLimit: 4096 });
    const completed = await waitCommand(job.directory, job.requestDigest, 5000);
    assert.equal(completed.receipt?.cleanup, "confirmed");
    const read = (name: string) => JSON.parse(readFileSync(join(job.directory, name), "utf8"));
    const guardian = read("guardian.json"); owners = [read("owner.json"), guardian];
    const until = Date.now() + 5000;
    while (processFingerprint(guardian.pid) !== null && Date.now() < until)
      await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(processFingerprint(guardian.pid), null, "exercise an exited and reaped guardian");
    assert.throws(() => confirmCommandGuardianAcknowledgement(job.directory, job.requestDigest, guardian.pid), /mismatch/, "the initial worker gate remains strict");
    assert.equal(confirmCommandGuardianAcknowledgement(job.directory, job.requestDigest, guardian.pid, true), true);
    assert.equal(confirmCommandGuardianAcknowledgement(job.directory, job.requestDigest, process.pid), false);
    assert.throws(() => confirmCommandGuardianAcknowledgement(job.directory, "different-command", guardian.pid, true), /mismatch/);
    durableJson(join(job.directory, "result.json"), { ...completed.receipt!, cleanup: "unknown" });
    assert.throws(() => confirmCommandGuardianAcknowledgement(job.directory, job.requestDigest, guardian.pid, true), /mismatch/);
    durableJson(join(job.directory, "result.json"), completed.receipt!);
    durableJson(join(job.directory, "guardian.json"), { ...guardian, pid: process.pid, fingerprint: "different-owner" });
    assert.throws(() => confirmCommandGuardianAcknowledgement(job.directory, job.requestDigest, process.pid, true), /mismatch/);
    durableJson(join(job.directory, "guardian.json"), guardian);
  } finally {
    const until = Date.now() + 5000;
    while (owners.some(owner => processLiveFingerprint(owner.pid) === owner.fingerprint) && Date.now() < until)
      await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(owners.every(owner => processLiveFingerprint(owner.pid) !== owner.fingerprint), "retain evidence while fixture owners live");
    rmSync(root, { recursive: true, force: true });
  }
});
