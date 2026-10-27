import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { durableJson, digest } from "../src/core.ts";
import { runNativeCheckCommand } from "../src/native-check-command.ts";
import { processLiveFingerprint, type CommandReceipt } from "../src/process-owner.ts";
import { recoverCommandOwner } from "../src/command-owner-recovery.ts";
import { removeFinishedCommandFixture } from "./support/finished-command-fixture.ts";

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

for (const outcome of ["success", "failure", "lost"] as const) test(`native checker joins delayed cleanup proof without replay: ${outcome}`, async () => {
  const root = mkdtempSync(join(tmpdir(), "native-cleanup-recovery-")), directory = join(root, "command");
  const executions = join(root, "executions");
  let recovery: Promise<void> | undefined;
  try {
    const code = `require('node:fs').appendFileSync(${JSON.stringify(executions)},'once\\n');console.log(JSON.stringify({status:'passed',findings:[]}));process.exit(${outcome === "failure" ? 7 : 0});`;
    const options = { id: "checker", root, directory, argv: [process.execPath, "-e", code], deadlineMs: 3000, env: {} };
    const completed = await runNativeCheckCommand(options);
    assert.ok("command_receipt" in completed);
    const identities = ["owner.json", "guardian.json"].map(name => JSON.parse(readFileSync(join(directory, name), "utf8")));
    const deadline = Date.now() + 5000;
    while (identities.some(owner => processLiveFingerprint(owner.pid) === owner.fingerprint) && Date.now() < deadline) await pause(20);
    assert.ok(identities.every(owner => processLiveFingerprint(owner.pid) !== owner.fingerprint));
    assert.equal(existsSync(join(directory, "owner-recovery.json")), false);
    // Seed only the observed uncertain-cleanup boundary; execution and launch originals remain bound.
    const original: CommandReceipt = { ...completed.command_receipt!, state: "unknown", cleanup: "unknown",
      ...(outcome === "lost" ? { reason: "owner-lost", exitCode: null, signal: null } : {}) };
    const path = join(directory, "result.json"); durableJson(path, original);
    const bytes = readFileSync(path);
    recovery = (async () => { await pause(150); recoverCommandOwner(directory, original.requestDigest, "test:delayed-native-cleanup"); })();
    const observed = await runNativeCheckCommand(options);
    await recovery;
    assert.ok("command_receipt" in observed);
    assert.equal(observed.command_receipt!.cleanup, "confirmed");
    assert.equal(observed.status, outcome === "success" ? "passed" : "failed");
    assert.equal(observed.command_receipt!.state, outcome === "lost" ? "unknown" : outcome === "success" ? "succeeded" : "failed");
    assert.ok("cleanup_recovery" in observed);
    assert.equal(observed.cleanup_recovery!.receiptDigest, digest(original));
    assert.deepEqual(readFileSync(path), bytes, "the immutable execution receipt is not rewritten");
    assert.equal(readFileSync(executions, "utf8"), "once\n", "cleanup observation cannot relaunch the checker");
  } finally {
    if (recovery) await recovery;
    await removeFinishedCommandFixture(root, ["command"]);
  }
});

test("native checker cannot pass from unbound cleanup proof", async () => {
  const root = mkdtempSync(join(tmpdir(), "native-cleanup-refusal-")), directory = join(root, "command");
  try {
    const options = { id: "checker", root, directory, argv: [process.execPath, "-e", "console.log(JSON.stringify({status:'passed',findings:[]}))"], deadlineMs: 3000, env: {} };
    const completed = await runNativeCheckCommand(options); assert.ok("command_receipt" in completed);
    const identities = ["owner.json", "guardian.json"].map(name => JSON.parse(readFileSync(join(directory, name), "utf8")));
    const deadline = Date.now() + 5000;
    while (identities.some(owner => processLiveFingerprint(owner.pid) === owner.fingerprint) && Date.now() < deadline) await pause(20);
    assert.ok(identities.every(owner => processLiveFingerprint(owner.pid) !== owner.fingerprint));
    const original: CommandReceipt = { ...completed.command_receipt!, state: "unknown", cleanup: "unknown" };
    durableJson(join(directory, "result.json"), original);
    recoverCommandOwner(directory, original.requestDigest, "test:bound-before-corruption");
    const proofPath = join(directory, "owner-recovery.json"), proof = JSON.parse(readFileSync(proofPath, "utf8"));
    durableJson(proofPath, { ...proof, receiptDigest: "sha256:" + "0".repeat(64) });
    const observed = await runNativeCheckCommand(options);
    assert.ok("command_receipt" in observed);
    assert.equal(observed.status, "failed"); assert.equal(observed.termination_reason, "cleanup-unknown");
    assert.equal(observed.command_receipt!.cleanup, "unknown");
    assert.equal("cleanup_recovery" in observed, false);
  } finally { await removeFinishedCommandFixture(root, ["command"]); }
});
