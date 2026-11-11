import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// The same behavioral oracle qualifies source and the actual clean-installed archive.
const moduleUrl = (name: string) => process.env.GOVERNANCE_TEST_PACKAGE
  ? pathToFileURL(join(process.env.GOVERNANCE_TEST_PACKAGE, "dist/engine/src", `${name}.js`)).href
  : new URL(`../src/${name}.ts`, import.meta.url).href;
const { digest, durableJson }: typeof import("../src/core.ts") = await import(moduleUrl("core"));
const { recoverCommandOwner, hasConfirmedCommandCleanup, commandProcesses }: typeof import("../src/command-owner-recovery.ts") = await import(moduleUrl("command-owner-recovery"));
const { restartCommandGuardian }: typeof import("../src/command-guardian-restart.ts") = await import(moduleUrl("command-guardian-restart"));
const { processOwnerDigest, processLiveFingerprint, processIncarnation, observeCommand }: typeof import("../src/process-owner.ts") = await import(moduleUrl("process-owner"));

const { confirmCommandGuardianAcknowledgement }: typeof import("../src/command-guardian.ts") = await import(moduleUrl("command-guardian"));
const oldStart = "Thu Jan  1 00:00:00 1970";

/** Seed only the retained cleanup boundary around one real, inert replacement process. */
async function fixture(mode: "positive" | "legacy" | "original-live" | "missing") {
  const directory = mkdtempSync(join(tmpdir(), "command-incarnation-"));
  const inert = spawn(process.execPath, ["-e", "console.log('ready');setInterval(()=>{},1000)"], { stdio: ["ignore", "pipe", "pipe"] });
  await once(inert.stdout!, "data");
  const pid = inert.pid!, fingerprint = processLiveFingerprint(pid), incarnation = processIncarnation(pid);
  assert.ok(fingerprint); assert.ok(incarnation);
  const capability = mode === "legacy" ? {} : { processIdentityVersion: 1, processIdentityTimezone: "UTC" };
  const request = { version: 1, ...capability, id: "fixture", ownerDigest: processOwnerDigest(),
    operation: { argv: [process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(join(directory, "replayed"))},'bad')`],
      cwd: directory, env: {}, effect: "read", expectedExitCodes: [0] }, deadlineMs: 1000, outputLimit: 4096 };
  const requestDigest = digest(request), owner = { pid: 2_000_000_000, fingerprint: oldStart, ...(mode === "legacy" ? {} : { incarnation: oldStart }) };
  const child = { pid: 1_999_999_999, processGroup: 1_999_999_999, fingerprint: oldStart, ...(mode === "legacy" ? {} : { incarnation: oldStart }) };
  const members = [{ pid: child.pid, fingerprint: child.fingerprint, ...(child.incarnation ? { incarnation: child.incarnation } : {}) },
    { pid, fingerprint: mode === "original-live" ? fingerprint : oldStart,
      ...(mode === "legacy" || mode === "missing" ? {} : { incarnation: mode === "original-live" ? incarnation : oldStart }) }];
  const receipt = { version: 1, requestDigest, state: "unknown", cleanup: "unknown", exitCode: 0, signal: null,
    reason: "exit", startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), durationMs: 1,
    log: join(directory, "output.log"), logBytes: 0 };
  durableJson(join(directory, "request.json"), request);
  durableJson(join(directory, "owner.json"), { ...owner, ...capability, requestDigest });
  durableJson(join(directory, "guardian.json"), { ...owner, ...capability, requestDigest, version: 1 });
  durableJson(join(directory, "launch.json"), { version: 1, ...capability, requestDigest, state: "spawned", host: hostname(),
    startedAt: receipt.startedAt, owner, child });
  durableJson(join(directory, "group-members.json"), { version: 1, ...capability, requestDigest, group: child.processGroup,
    members, identityDigest: digest(members) });
  durableJson(join(directory, "result.json"), receipt);
  durableJson(join(directory, "check-result.json"), { status: "failed", cleanup: "unknown" });
  const original = readFileSync(join(directory, "result.json")), check = readFileSync(join(directory, "check-result.json"));
  return { directory, requestDigest, pid, fingerprint, incarnation, inert, original, check,
    async close() {
      // Only this fixture's live child handle is stopped; no recorded or reused PID is signalled.
      if (inert.exitCode === null) { inert.kill("SIGTERM"); await once(inert, "close"); }
      const guardian = JSON.parse(readFileSync(join(directory, "guardian.json"), "utf8"));
      const until = Date.now() + 5000;
      while (commandProcesses().some(row => row.pid === guardian.pid && (guardian.processIdentityVersion === 1 ? row.incarnation === guardian.incarnation : true)) && Date.now() < until)
        await new Promise(resolve => setTimeout(resolve, 20));
      assert.ok(!commandProcesses().some(row => row.pid === guardian.pid && (guardian.processIdentityVersion === 1 ? row.incarnation === guardian.incarnation : true)));
      rmSync(directory, { recursive: true, force: true });
    } };
}

test("positive cleanup proves the old incarnation ended without touching a live replacement", async () => {
  const f = await fixture("positive");
  try {
    const observed = recoverCommandOwner(f.directory, f.requestDigest, "test:original-owner");
    assert.equal(observed.receipt?.state, "unknown");
    assert.equal(observed.receipt?.cleanup, "unknown", "immutable execution evidence stays unchanged");
    assert.ok(hasConfirmedCommandCleanup(f.directory, observed.receipt!));
    const proofPath = join(f.directory, "owner-recovery.json"), proof = JSON.parse(readFileSync(proofPath, "utf8"));
    assert.equal(proof.processIdentityVersion, 1);
    assert.ok(proof.incarnationEvidence.identities.some((identity: {pid:number;currentIncarnation:string}) =>
      identity.pid === f.pid && identity.currentIncarnation === f.incarnation));
    durableJson(proofPath, { ...proof, incarnationEvidence: { ...proof.incarnationEvidence, identities: [] } });
    assert.equal(hasConfirmedCommandCleanup(f.directory, observed.receipt!), false, "incomplete positive readback cannot qualify cleanup");
    durableJson(proofPath, proof);
    assert.equal(processLiveFingerprint(f.pid), f.fingerprint, "the live replacement remains running");
    assert.deepEqual(readFileSync(join(f.directory, "result.json")), f.original);
    assert.deepEqual(readFileSync(join(f.directory, "check-result.json")), f.check, "a failed check is never promoted");
    assert.equal(existsSync(join(f.directory, "replayed")), false);
  } finally { await f.close(); }
});

test("a restarted guardian neither signals nor replays a reused live PID", async () => {
  const f = await fixture("positive");
  try {
    // The former guardian's PID now names a different, live fixture process too.
    durableJson(join(f.directory, "guardian.json"), { version: 1, requestDigest: f.requestDigest, pid: f.pid, fingerprint: oldStart, incarnation: oldStart, processIdentityVersion: 1, processIdentityTimezone: "UTC" });
    const outcome = await restartCommandGuardian(f.directory, f.requestDigest, "test:cleanup-only");
    const until = Date.now() + 5000;
    while (!existsSync(join(f.directory, "owner-recovery.json")) && Date.now() < until)
      await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(["reconciled", "guardian-running"].includes(outcome.state));
    assert.ok(existsSync(join(f.directory, "owner-recovery.json")));
    assert.equal(processLiveFingerprint(f.pid), f.fingerprint);
    assert.equal(existsSync(join(f.directory, "replayed")), false);
    assert.deepEqual(readFileSync(join(f.directory, "result.json")), f.original);
  } finally { await f.close(); }
});

for (const mode of ["legacy", "original-live", "missing"] as const) test(`cleanup refuses ${mode} incarnation evidence`, async () => {
  const f = await fixture(mode);
  try {
    assert.throws(() => recoverCommandOwner(f.directory, f.requestDigest, "test:must-refuse"));
    assert.equal(existsSync(join(f.directory, "owner-recovery.json")), false);
    assert.equal(processLiveFingerprint(f.pid), f.fingerprint);
    assert.deepEqual(readFileSync(join(f.directory, "result.json")), f.original);
  } finally { await f.close(); }
});


test("changed recovery timezone cannot turn a live original into replacement proof", async () => {
  const f = await fixture("original-live"), previous = process.env.TZ;
  try {
    process.env.TZ = "Pacific/Honolulu";
    assert.notEqual(processLiveFingerprint(f.pid), f.fingerprint, "exercise a changed caller start-time representation");
    assert.throws(() => recoverCommandOwner(f.directory, f.requestDigest, "test:cross-timezone-must-refuse"));
    assert.equal(existsSync(join(f.directory, "owner-recovery.json")), false);
    assert.deepEqual(readFileSync(join(f.directory, "result.json")), f.original);
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
    await f.close();
  }
});


test("UTC acknowledgment and pending observation do not inherit the recovery caller timezone", async () => {
  const f = await fixture("positive"), previous = process.env.TZ;
  try {
    const identity = { pid: f.pid, fingerprint: f.fingerprint, incarnation: f.incarnation,
      processIdentityVersion: 1, processIdentityTimezone: "UTC", requestDigest: f.requestDigest };
    durableJson(join(f.directory, "guardian.json"), { ...identity, version: 1 });
    durableJson(join(f.directory, "owner.json"), identity);
    rmSync(join(f.directory, "result.json"));
    process.env.TZ = "Pacific/Honolulu";
    assert.notEqual(processLiveFingerprint(f.pid), f.fingerprint);
    assert.equal(confirmCommandGuardianAcknowledgement(f.directory, f.requestDigest, f.pid), true);
    assert.equal(observeCommand(f.directory, f.requestDigest).state, "pending");
    const missing: Record<string, unknown> = { ...identity, version: 1 }; delete missing.incarnation;
    durableJson(join(f.directory, "guardian.json"), missing);
    assert.throws(() => confirmCommandGuardianAcknowledgement(f.directory, f.requestDigest, f.pid));
    durableJson(join(f.directory, "guardian.json"), { ...identity, version: 1, processIdentityTimezone: "Pacific/Honolulu" });
    assert.throws(() => confirmCommandGuardianAcknowledgement(f.directory, f.requestDigest, f.pid));
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
    // This placeholder is the test's inert child, not a real guardian coordinator.
    durableJson(join(f.directory, "guardian.json"), { pid: 2_000_000_000, fingerprint: oldStart });
    await f.close();
  }
});

test("missing or mixed UTC context never qualifies positive cleanup", async () => {
  for (const kind of ["request", "launch", "members"] as const) {
    const f = await fixture("positive");
    try {
      const path = join(f.directory, kind === "request" ? "request.json" : kind === "launch" ? "launch.json" : "group-members.json");
      const record = JSON.parse(readFileSync(path, "utf8"));
      if (kind === "members") record.processIdentityTimezone = "Pacific/Honolulu"; else delete record.processIdentityTimezone;
      durableJson(path, record);
      assert.throws(() => recoverCommandOwner(f.directory, f.requestDigest, "test:missing-utc-must-refuse"));
      assert.equal(existsSync(join(f.directory, "owner-recovery.json")), false);
    } finally { await f.close(); }
  }
});
