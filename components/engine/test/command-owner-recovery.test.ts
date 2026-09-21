import { settleWorkflowCommandCleanup } from "../src/workflow-command-cleanup.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { digest, durableJson } from "../src/core.ts";
import { processFingerprint, submitCommand, waitCommand } from "../src/process-owner.ts";
import { recoverCommandOwner, hasConfirmedCommandCleanup } from "../src/command-owner-recovery.ts";
import { reconcileCommand } from "../src/command-recovery.ts";

for (const reason of ["exit", "cancelled"]) test(`later cleanup proof preserves ${reason} terminal bytes and cannot survive result drift`, async () => {
  const root = mkdtempSync(join(tmpdir(), "terminal-cleanup-recovery-"));
  try {
    const job = submitCommand(join(root, "job"), { id: "terminal", operation: {
      argv: [process.execPath, "-e", "process.exit(7)"], cwd: root, env: {}, expectedExitCodes: [0], effect: "read",
    }, deadlineMs: 3000, outputLimit: 4096 });
    const completed = await waitCommand(job.directory, job.requestDigest, 5000);
    assert.equal(completed.receipt?.state, "failed");
    const owner = JSON.parse(readFileSync(join(job.directory, "owner.json"), "utf8"));
    const guardian = JSON.parse(readFileSync(join(job.directory, "guardian.json"), "utf8"));
    const until = Date.now() + 3000;
    while ((processFingerprint(owner.pid) === owner.fingerprint || processFingerprint(guardian.pid) === guardian.fingerprint) && Date.now() < until)
      await new Promise(resolve => setTimeout(resolve, 20));
    assert.notEqual(processFingerprint(owner.pid), owner.fingerprint);
    assert.notEqual(processFingerprint(guardian.pid), guardian.fingerprint);
    // Seed the persisted terminal/uncertain-cleanup boundary after both fixture processes exited.
    const original = { ...completed.receipt!, reason, state: "unknown" as const, cleanup: "unknown" as const };
    const path = join(job.directory, "result.json"); durableJson(path, original);
    const bytes = readFileSync(path);
    assert.equal(hasConfirmedCommandCleanup(job.directory, original), false);
    assert.throws(() => reconcileCommand(job.directory, job.requestDigest), /confirmed cleanup/);
    const memberPath = join(job.directory, "group-members.json");
    const launch = JSON.parse(readFileSync(join(job.directory, "launch.json"), "utf8"));
    const members = { version: 1, requestDigest: job.requestDigest, group: launch.child.processGroup, members: [], identityDigest: digest([]) };
    const liveMembers = [...members.members, { pid: process.pid, fingerprint: processFingerprint(process.pid) }];
    durableJson(memberPath, { ...members, members: liveMembers, identityDigest: digest(liveMembers) });
    assert.throws(() => recoverCommandOwner(job.directory, job.requestDigest, "test:escaped-member"), /still present/);
    assert.deepEqual(readFileSync(path), bytes);
    durableJson(memberPath, members);
    assert.equal((await settleWorkflowCommandCleanup(job.directory,original,[0],0)).receipt.cleanup,"unknown");
    const settling=settleWorkflowCommandCleanup(job.directory,original,[0],1000);
    await new Promise(resolve=>setTimeout(resolve,50));
    const recovered = recoverCommandOwner(job.directory, job.requestDigest, "test:later-absence");
    const settled=await settling;
    assert.equal(settled.receipt.cleanup,"confirmed");assert.equal(settled.receipt.state,reason === "cancelled" ? "cancelled" : "failed");
    assert.equal(settled.recovery?.receiptDigest,digest(original));
    assert.equal((await settleWorkflowCommandCleanup(job.directory,original,[7],0)).receipt.state,reason === "cancelled" ? "cancelled" : "succeeded");
    assert.deepEqual(readFileSync(path), bytes);
    assert.equal(recovered.receipt?.state, "unknown"); assert.equal(recovered.receipt?.exitCode, 7);
    assert.equal(recovered.receipt?.cleanup, "unknown");
    assert.equal(hasConfirmedCommandCleanup(job.directory, original), true);
    assert.equal(reconcileCommand(job.directory, job.requestDigest).cleanupSource, "recovery-evidence");
    const proofPath = join(job.directory, "owner-recovery.json"), proofBytes = readFileSync(proofPath);
    assert.deepEqual(recoverCommandOwner(job.directory, job.requestDigest, "test:replay"), recovered);
    assert.deepEqual(readFileSync(proofPath), proofBytes);
    durableJson(memberPath, { ...members, members: liveMembers, identityDigest: digest(liveMembers) });
    assert.equal(hasConfirmedCommandCleanup(job.directory, original), false);
    assert.throws(() => reconcileCommand(job.directory, job.requestDigest), /confirmed cleanup/);
    durableJson(memberPath, members);
    durableJson(path, { ...original, exitCode: 9 });
    assert.throws(() => recoverCommandOwner(job.directory, job.requestDigest, "test:drift"), /refusing replacement/);
    assert.throws(() => reconcileCommand(job.directory, job.requestDigest), /confirmed cleanup/);
    assert.deepEqual(readFileSync(proofPath), proofBytes);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
