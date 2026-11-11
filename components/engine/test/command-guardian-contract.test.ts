import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const moduleUrl = (name: string) => process.env.GOVERNANCE_TEST_PACKAGE
  ? pathToFileURL(join(process.env.GOVERNANCE_TEST_PACKAGE, "dist/engine/src", `${name}.js`)).href
  : new URL(`../src/${name}.ts`, import.meta.url).href;
const { digest, durableJson }: typeof import("../src/core.ts") = await import(moduleUrl("core"));
const { processOwnerDigest, processLiveFingerprint, processIncarnation }: typeof import("../src/process-owner.ts") = await import(moduleUrl("process-owner"));
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Every real process in this race fixture belongs to this test and has its own close handle. */
async function inert(detached: boolean) {
  const child = spawn(process.execPath, ["-e", "console.log('ready');setInterval(()=>{},1000)"], { detached, stdio: ["ignore", "pipe", "pipe"] });
  const closed = once(child, "close");
  await once(child.stdout!, "data");
  const fingerprint = processLiveFingerprint(child.pid!); assert.ok(fingerprint);
  return { child, closed, identity: { pid: child.pid!, fingerprint, incarnation: processIncarnation(child.pid!)! } };
}

/** Stop only a still-live fixture child handle, never an identity borrowed from a receipt. */
async function finish(child: ChildProcess, closed: Promise<unknown>) {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  await closed;
}

for (const mode of ["missing-members", "legacy-members", "legacy-launch", "complete-after-intent"] as const)
test(`initial guardian validates the published incarnation contract: ${mode}`, async () => {
  const directory = mkdtempSync(join(tmpdir(), "guardian-contract-"));
  const owner = await inert(false), target = await inert(true);
  let guardian: ChildProcess | undefined, guardianClosed: Promise<unknown> | undefined;
  try {
    const request = { version: 1, processIdentityVersion: 1, processIdentityTimezone: "UTC", ownerDigest: processOwnerDigest(), id: "initial-contract",
      operation: { argv: [process.execPath, "-e", "throw new Error('native assignment must not replay')"],
        cwd: directory, env: {}, expectedExitCodes: [0], effect: "read" }, deadlineMs: 3000, outputLimit: 4096 };
    const requestDigest = digest(request), members = [target.identity];
    const intent = { version: 1, requestDigest, state: "intent", host: hostname(), owner: owner.identity, startedAt: new Date().toISOString() };
    const memberRecord = { version: 1, requestDigest, group: target.identity.pid, members, identityDigest: digest(members) };
    durableJson(join(directory, "request.json"), request);
    durableJson(join(directory, "owner.json"), { ...owner.identity, requestDigest, processIdentityVersion: 1, processIdentityTimezone: "UTC" });
    durableJson(join(directory, "launch.json"), intent);
    if (mode === "complete-after-intent") durableJson(join(directory, "group-members.json"), { ...memberRecord, processIdentityVersion: 1, processIdentityTimezone: "UTC" });
    guardian = spawn(process.execPath, [fileURLToPath(moduleUrl("command-guardian")), "--guardian", directory, requestDigest], { stdio: "ignore" });
    guardianClosed = once(guardian, "close");
    const acknowledgedBy = Date.now() + 5000;
    while (!existsSync(join(directory, "guardian.json")) && Date.now() < acknowledgedBy) await pause(20);
    assert.ok(existsSync(join(directory, "guardian.json")));
    if (mode === "complete-after-intent") {
      await pause(300);
      assert.equal(guardian.exitCode, null, "member publication before spawned launch must not invalidate the guardian");
      assert.equal(processLiveFingerprint(target.identity.pid), target.identity.fingerprint);
    }
    const launch = { ...intent, state: "spawned", ...(mode === "legacy-launch" ? {} : { processIdentityVersion: 1, processIdentityTimezone: "UTC" }),
      child: { ...target.identity, processGroup: target.identity.pid } };
    durableJson(join(directory, "launch.json"), launch);
    if (mode !== "missing-members") durableJson(join(directory, "group-members.json"),
      { ...memberRecord, ...(mode === "legacy-members" ? {} : { processIdentityVersion: 1, processIdentityTimezone: "UTC" }) });
    const launchBytes = readFileSync(join(directory, "launch.json"));
    const memberBytes = mode === "missing-members" ? null : readFileSync(join(directory, "group-members.json"));
    await pause(350);
    await finish(owner.child, owner.closed);
    const completedBy = Date.now() + 5000;
    while (guardian.exitCode === null && guardian.signalCode === null && Date.now() < completedBy) await pause(20);
    assert.ok(guardian.exitCode !== null || guardian.signalCode !== null, "guardian must settle within its fixture boundary");
    await guardianClosed;
    assert.deepEqual(readFileSync(join(directory, "launch.json")), launchBytes);
    if (memberBytes === null) assert.equal(existsSync(join(directory, "group-members.json")), false, "missing history cannot be recreated as positive proof");
    else assert.deepEqual(readFileSync(join(directory, "group-members.json")), memberBytes);
    if (mode === "complete-after-intent") {
      assert.equal(guardian.exitCode, 0);
      assert.ok(existsSync(join(directory, "owner-recovery.json")));
      assert.notEqual(processLiveFingerprint(target.identity.pid), target.identity.fingerprint, "the proven original child was cleaned up");
      const receipt = JSON.parse(readFileSync(join(directory, "result.json"), "utf8"));
      assert.equal(receipt.state, "unknown", "lost execution is never promoted to success");
    } else {
      assert.equal(guardian.exitCode, 2);
      assert.equal(processLiveFingerprint(target.identity.pid), target.identity.fingerprint, "unqualified metadata cannot grant signal authority");
      assert.equal(existsSync(join(directory, "owner-recovery.json")), false);
    }
  } finally {
    if (guardian && guardianClosed) await finish(guardian, guardianClosed);
    await finish(owner.child, owner.closed); await finish(target.child, target.closed);
    rmSync(directory, { recursive: true, force: true });
  }
});
