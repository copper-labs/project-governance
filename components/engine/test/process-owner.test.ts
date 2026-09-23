import { durableJson } from "../src/core.ts";
import { recoverCommandOwner } from "../src/command-owner-recovery.ts";
import { reconcileCommand } from "../src/command-recovery.ts";
import { ResourceRegistry } from "../src/resources.ts";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cancelCommand, observeCommand, processFingerprint, submitCommand, waitCommand } from "../src/process-owner.ts";
import { removeFinishedCommandFixture } from "./support/finished-command-fixture.ts";

test("owned command preserves native failure and duplicate submission observes the same receipt", async () => {
  const dir = mkdtempSync(join(tmpdir(), "engine-command-"));
  try {
    const request = { id: "failure", operation: { argv: [process.execPath, "-e", "console.log('native assertion failed');process.exit(7)"], cwd: dir, env: {}, expectedExitCodes: [0], effect: "read" as const }, deadlineMs: 3000, outputLimit: 4096 };
    const first = submitCommand(join(dir, "job"), request);
    assert.equal(submitCommand(join(dir, "job"), request).submitted, false);
    const result = await waitCommand(first.directory, first.requestDigest, 5000);
    assert.equal(result.state, "terminal"); assert.equal(result.receipt?.state, "failed");
    assert.equal(result.receipt?.exitCode, 7); assert.equal(result.receipt?.cleanup, "confirmed");
    assert.match(readFileSync(result.receipt!.log, "utf8"), /native assertion failed/);
    assert.deepEqual(observeCommand(first.directory, first.requestDigest), result);
  } finally { rmSync(dir, { recursive: true }); }
});

test("deadline and cancellation terminate owned process groups without reporting a passing assertion", async () => {
  const dir = mkdtempSync(join(tmpdir(), "engine-command-"));
  try {
    for (const reason of ["deadline", "cancelled"] as const) {
      const submitted = submitCommand(join(dir, reason), { id: reason,
        operation: { argv: [process.execPath, "-e", "setInterval(()=>{},1000)"], cwd: dir, env: {}, expectedExitCodes: [0], effect: "local" },
        deadlineMs: reason === "deadline" ? 100 : 3000, outputLimit: 4096 });
      if (reason === "cancelled") cancelCommand(submitted.directory, submitted.requestDigest, "host:fixture");
      const result = await waitCommand(submitted.directory, submitted.requestDigest, 5000);
      assert.equal(result.state, "terminal"); assert.equal(result.receipt?.reason, reason);
      assert.equal(result.receipt?.cleanup, "confirmed"); assert.notEqual(result.receipt?.state, "succeeded");
    }
  } finally { await removeFinishedCommandFixture(dir, ["deadline", "cancelled"]); }
});

test("output flooding is bounded and publisher/model credentials are not inherited", async () => {
  const dir = mkdtempSync(join(tmpdir(), "engine-command-"));
  const previous = process.env["JEV_TOKEN"]; process.env["JEV_TOKEN"] = "synthetic-canary";
  try {
    const env = submitCommand(join(dir, "env"), { id: "env", operation: { argv: [process.execPath, "-e", "if(process.env.JEV_TOKEN)process.exit(9)"], cwd: dir, env: {}, expectedExitCodes: [0], effect: "read" }, deadlineMs: 3000, outputLimit: 4096 });
    assert.equal((await waitCommand(env.directory, env.requestDigest, 5000)).receipt?.state, "succeeded");
    const flood = submitCommand(join(dir, "flood"), { id: "flood", operation: { argv: [process.execPath, "-e", "console.log('x'.repeat(100000))"], cwd: dir, env: {}, expectedExitCodes: [0], effect: "read" }, deadlineMs: 3000, outputLimit: 512 });
    const result = await waitCommand(flood.directory, flood.requestDigest, 5000);
    assert.equal(result.receipt?.reason, "output-limit"); assert.equal(result.receipt?.logBytes, 512);
  } finally {
    if (previous === undefined) delete process.env["JEV_TOKEN"]; else process.env["JEV_TOKEN"] = previous;
    rmSync(dir, { recursive: true });
  }
});


test("native execution survives the submitting process exiting and reconnects without replay", async () => {
  const dir = mkdtempSync(join(tmpdir(), "engine-detached-"));
  try {
    const module = new URL("../src/process-owner.ts", import.meta.url).href;
    const request = { id: "detached", operation: { argv: [process.execPath, "-e", "setTimeout(()=>console.log('finished once'),250)"], cwd: dir, env: {}, expectedExitCodes: [0], effect: "read" }, deadlineMs: 3000, outputLimit: 4096 };
    const source = `import { submitCommand } from ${JSON.stringify(module)}; console.log(JSON.stringify(submitCommand(${JSON.stringify(join(dir, "job"))}, ${JSON.stringify(request)})));`;
    const submission = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", source], { encoding: "utf8", timeout: 3000 }));
    const result = await waitCommand(submission.directory, submission.requestDigest, 5000);
    assert.equal(result.receipt?.state, "succeeded");
    assert.equal(readFileSync(result.receipt!.log, "utf8"), "finished once\n");
    assert.deepEqual(observeCommand(submission.directory, submission.requestDigest), result);
  } finally { await removeFinishedCommandFixture(dir, ["job"]); }
});

test("structured stdout stays separate from diagnostic stderr under the shared output budget", async () => {
  const dir = mkdtempSync(join(tmpdir(), "engine-streams-"));
  try {
    const submitted = submitCommand(join(dir, "job"), { id: "streams", operation: { argv: [process.execPath, "-e", "console.error('diagnostic');console.log(JSON.stringify({status:'passed',findings:[]}))"], cwd: dir, env: {}, expectedExitCodes: [0], effect: "read" }, deadlineMs: 3000, outputLimit: 4096 });
    const result = await waitCommand(submitted.directory, submitted.requestDigest, 5000);
    assert.equal(result.receipt?.state, "succeeded");
    assert.equal(JSON.parse(readFileSync(result.receipt!.stdout!, "utf8")).status, "passed");
    assert.equal(readFileSync(result.receipt!.stderr!, "utf8"), "diagnostic\n");
    assert.equal(readFileSync(result.receipt!.stdout!).length + readFileSync(result.receipt!.stderr!).length, result.receipt!.logBytes);
  } finally { rmSync(dir, { recursive: true }); }
});

test("owned stdin delivers literal assignments without putting them in argv or logs", async () => {
  const root = mkdtempSync(join(tmpdir(), "engine-stdin-"));
  try {
    const stdin = "private assignment: café\n$(do-not-execute)";
    const script = "let value='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>value+=chunk);process.stdin.on('end',()=>console.log(JSON.stringify({bytes:Buffer.byteLength(value),argv:process.argv})))";
    const request = { id: "stdin", stdin, operation: { argv: [process.execPath, "-e", script], cwd: root, env: {}, expectedExitCodes: [0], effect: "read" as const }, deadlineMs: 3000, outputLimit: 4096 };
    const submission = submitCommand(join(root, "job"), request);
    assert.equal(submitCommand(join(root, "job"), request).submitted, false);
    assert.throws(() => submitCommand(join(root, "job"), { ...request, stdin: "changed" }), /identity conflict/);
    const result = await waitCommand(submission.directory, submission.requestDigest, 5000);
    assert.equal(result.receipt?.state, "succeeded");
    const output = readFileSync(result.receipt!.stdout!, "utf8");
    assert.equal(JSON.parse(output).bytes, Buffer.byteLength(stdin));
    assert.equal(output.includes("private assignment"), false);
    assert.throws(() => submitCommand(join(root, "oversized"), { ...request, stdin: "a".repeat(500001) }), /maximum 500 KB/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("provider input rejection cannot be reported as a successful command", async () => {
  const root = mkdtempSync(join(tmpdir(), "engine-stdin-rejected-"));
  try {
    const submission = submitCommand(join(root, "job"), { id: "rejected", stdin: "x".repeat(500000),
      operation: { argv: [process.execPath, "-e", "process.stdin.destroy();setTimeout(()=>process.exit(0),100)"], cwd: root, env: {}, expectedExitCodes: [0], effect: "read" }, deadlineMs: 3000, outputLimit: 4096 });
    const result = await waitCommand(submission.directory, submission.requestDigest, 5000);
    assert.equal(result.receipt?.state, "failed"); assert.equal(result.receipt?.reason, "input-write-failed");
    assert.equal(result.receipt?.cleanup, "confirmed");
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("worker loss refuses live-group recovery and preserves unknown outcome after cleanup", async () => {
  const root = mkdtempSync(join(tmpdir(), "engine-owner-loss-"));
  const registry = new ResourceRegistry(join(root, "resources.sqlite"));
  let child: { pid: number; fingerprint: string } | undefined;
  let owner: { pid: number; fingerprint: string } | undefined;
  try {
    const request = { id: "owner-loss", coordination: { registry: registry.path, resources: ["fixture:owner-loss"] }, operation: { argv: [process.execPath, "-e", "setInterval(()=>{},1000)"], cwd: root, env: {}, expectedExitCodes: [0], effect: "read" as const }, deadlineMs: 10000, outputLimit: 4096 };
    const submitted = submitCommand(join(root, "job"), request);
    const launchPath = join(submitted.directory, "launch.json");
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      if (existsSync(launchPath)) {
        const launch = JSON.parse(readFileSync(launchPath, "utf8"));
        if (launch.state === "spawned") {
          assert.equal(launch.requestDigest, submitted.requestDigest);
          assert.equal(launch.child.processGroup, launch.child.pid);
          child = launch.child; owner = launch.owner; break;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(child?.fingerprint); assert.ok(owner?.fingerprint);
    const guardian = JSON.parse(readFileSync(join(submitted.directory, "guardian.json"), "utf8"));
    assert.equal(processFingerprint(guardian.pid), guardian.fingerprint);
    process.kill(guardian.pid, "SIGKILL");
    const acknowledged = JSON.parse(readFileSync(launchPath, "utf8"));
    durableJson(launchPath, { ...acknowledged, state: "intent" });
    assert.throws(() => recoverCommandOwner(submitted.directory, submitted.requestDigest, "test:recovery"), /launch acknowledgment/);
    durableJson(launchPath, { ...acknowledged, host: "other-host" });
    assert.throws(() => recoverCommandOwner(submitted.directory, submitted.requestDigest, "test:recovery"), /launch acknowledgment/);
    durableJson(launchPath, acknowledged);
    assert.equal(processFingerprint(owner.pid), owner.fingerprint);
    assert.throws(() => recoverCommandOwner(submitted.directory, submitted.requestDigest, "test:recovery"), /still present/);
    process.kill(owner.pid, "SIGKILL");
    const stoppedBy = Date.now() + 3000;
    while (processFingerprint(owner.pid) === owner.fingerprint && Date.now() < stoppedBy)
      await new Promise(resolve => setTimeout(resolve, 20));
    assert.notEqual(processFingerprint(owner.pid), owner.fingerprint);
    assert.equal(observeCommand(submitted.directory, submitted.requestDigest).state, "unknown");
    assert.equal(existsSync(join(submitted.directory, "result.json")), false);
    assert.equal(submitCommand(submitted.directory, request).submitted, false);
    assert.equal(processFingerprint(child.pid), child.fingerprint);
    assert.throws(() => recoverCommandOwner(submitted.directory, submitted.requestDigest, "test:recovery"), /still present/);
    assert.throws(() => registry.acquire(["fixture:owner-loss"], "other", "other"));
    process.kill(-child.pid, "SIGKILL");
    let recovered;
    const cleanupBy = Date.now() + 5000;
    while (Date.now() < cleanupBy) {
      try { recovered = recoverCommandOwner(submitted.directory, submitted.requestDigest, "test:recovery"); break; }
      catch (error) { if (!String(error).includes("still present")) throw error; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(recovered?.receipt?.state, "unknown");
    assert.equal(recovered?.receipt?.cleanup, "confirmed");
    assert.equal(recovered?.receipt?.reason, "owner-lost");
    assert.deepEqual(recoverCommandOwner(submitted.directory, submitted.requestDigest, "test:replay"), recovered);
    const recoveryPath = join(submitted.directory, "owner-recovery.json");
    const evidence = JSON.parse(readFileSync(recoveryPath, "utf8"));
    durableJson(recoveryPath, { ...evidence, receiptDigest: "changed" });
    assert.throws(() => reconcileCommand(submitted.directory, submitted.requestDigest), /confirmed cleanup/);
    assert.throws(() => registry.acquire(["fixture:owner-loss"], "other", "other"));
    durableJson(recoveryPath, evidence);
    reconcileCommand(submitted.directory, submitted.requestDigest);
    const newer = registry.acquire(["fixture:owner-loss"], "other", "other");
    reconcileCommand(submitted.directory, submitted.requestDigest);
    registry.assertHeld(newer[0]!);
    assert.equal(submitCommand(submitted.directory, request).submitted, false);
  } finally {
    registry.close();
    // Only this fixture's still-matching processes can be signalled.
    if (child && processFingerprint(child.pid) === child.fingerprint) process.kill(-child.pid, "SIGKILL");
    if (owner && processFingerprint(owner.pid) === owner.fingerprint) process.kill(owner.pid, "SIGKILL");
    rmSync(root, { recursive: true, force: true });
  }
});


for (const graceful of [false, true]) test(`guardian cleans after owner death with declared grace=${graceful} without claiming success`, async () => {
  const root = mkdtempSync(join(tmpdir(), "engine-guardian-"));
  let launch: { state: string; owner: { pid: number; fingerprint: string }; child: { pid: number; fingerprint: string } } | undefined;
  try {
    const script = graceful
      ? "const fs=require('node:fs');process.on('SIGTERM',()=>setTimeout(()=>{fs.writeFileSync('cleaned','yes');process.exit(0)},1500));fs.writeFileSync('ready','yes');setInterval(()=>{},1000)"
      : "process.on('SIGTERM',()=>{});require('node:fs').writeFileSync('ready','yes');setInterval(()=>{},1000)";
    const request = { id: "guardian", operation: { ...(graceful ? { terminationGraceMs: 3000 } : {}), argv: [process.execPath, "-e", script], cwd: root, env: {}, expectedExitCodes: [0], effect: "read" as const }, deadlineMs: 10000, outputLimit: 4096 };
    const job = submitCommand(join(root, "job"), request);
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      const path = join(job.directory, "launch.json");
      if (existsSync(path)) { launch = JSON.parse(readFileSync(path, "utf8")); if (launch?.state === "spawned") break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(launch?.state, "spawned"); assert.ok(launch);
    const readyBy = Date.now() + 3000;
    while (!existsSync(join(root, "ready")) && Date.now() < readyBy) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(existsSync(join(root, "ready")), true);
    assert.equal(processFingerprint(launch.owner.pid), launch.owner.fingerprint);
    process.kill(launch.owner.pid, "SIGKILL");
    const observed = await waitCommand(job.directory, job.requestDigest, 7000);
    assert.equal(observed.receipt?.state, "unknown");
    assert.equal(observed.receipt?.reason, "owner-lost");
    assert.equal(observed.receipt?.cleanup, "confirmed");
    assert.notEqual(processFingerprint(launch.child.pid), launch.child.fingerprint);
    assert.equal(submitCommand(job.directory, request).submitted, false);
    const proof = JSON.parse(readFileSync(join(job.directory, "owner-recovery.json"), "utf8"));
    assert.equal(proof.authority, "runtime:command-guardian");
    if (graceful) assert.equal(readFileSync(join(root, "cleaned"), "utf8"), "yes");
  } finally {
    if (launch?.child && processFingerprint(launch.child.pid) === launch.child.fingerprint) process.kill(-launch.child.pid, "SIGKILL");
    if (launch?.owner && processFingerprint(launch.owner.pid) === launch.owner.fingerprint) process.kill(launch.owner.pid, "SIGKILL");
    await removeFinishedCommandFixture(root, ["job"]);
  }
});


test("guardian cleans recorded group members after their original leader exits", async () => {
  const root = mkdtempSync(join(tmpdir(), "engine-guardian-members-"));
  let launch: { owner: { pid: number; fingerprint: string }; child: { pid: number; fingerprint: string } } | undefined;
  let descendant: { pid: number; fingerprint: string } | undefined;
  try {
    const script = "const cp=require('node:child_process');const child=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});require('node:fs').writeFileSync('descendant',String(child.pid));setInterval(()=>{},1000)";
    const job = submitCommand(join(root, "job"), { id: "members", operation: { argv: [process.execPath, "-e", script], cwd: root, env: {}, expectedExitCodes: [0], effect: "read" }, deadlineMs: 15000, outputLimit: 4096 });
    const until = Date.now() + 6000;
    while (Date.now() < until) {
      const path = join(job.directory, "group-members.json");
      if (existsSync(path) && existsSync(join(root, "descendant"))) {
        const members = JSON.parse(readFileSync(path, "utf8"));
        descendant = members.members.find((member: {pid:number}) => member.pid === Number(readFileSync(join(root, "descendant"), "utf8")));
        if (descendant) break;
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(descendant);
    launch = JSON.parse(readFileSync(join(job.directory, "launch.json"), "utf8")); assert.ok(launch);
    assert.equal(processFingerprint(launch.child.pid), launch.child.fingerprint);
    process.kill(launch.child.pid, "SIGKILL");
    const leaderBy = Date.now() + 3000;
    while (processFingerprint(launch.child.pid) === launch.child.fingerprint && Date.now() < leaderBy) await new Promise(resolve => setTimeout(resolve, 20));
    assert.notEqual(processFingerprint(launch.child.pid), launch.child.fingerprint);
    assert.equal(processFingerprint(descendant.pid), descendant.fingerprint);
    assert.equal(processFingerprint(launch.owner.pid), launch.owner.fingerprint);
    process.kill(launch.owner.pid, "SIGKILL");
    const observed = await waitCommand(job.directory, job.requestDigest, 7000);
    assert.equal(observed.receipt?.state, "unknown");
    assert.equal(observed.receipt?.cleanup, "confirmed");
    assert.notEqual(processFingerprint(descendant.pid), descendant.fingerprint);
  } finally {
    for (const record of [descendant, launch?.child, launch?.owner])
      if (record && processFingerprint(record.pid) === record.fingerprint) process.kill(record.pid, "SIGKILL");
    rmSync(root, { recursive: true, force: true });
  }
});

test("declared termination grace lets owned cleanup finish without converting cancellation into success", async () => {
  const dir = mkdtempSync(join(tmpdir(), "engine-grace-"));
  try {
    const request = { id: "grace", operation: {
      argv: [process.execPath, "-e", "const fs=require('node:fs');process.on('SIGTERM',()=>{setTimeout(()=>{fs.writeFileSync('cleaned','yes');process.exit(0)},1500)});fs.writeFileSync('ready','yes');setInterval(()=>{},1000)"],
      cwd: dir, env: {}, expectedExitCodes: [0], effect: "local" as const, terminationGraceMs: 3000,
    }, deadlineMs: 10000, outputLimit: 4096 };
    for (const grace of [0, -1, 30001, 1.5]) assert.throws(() => submitCommand(join(dir, 'invalid'), {
      ...request, operation: { ...request.operation, terminationGraceMs: grace },
    }), /termination grace/);
    const job = submitCommand(join(dir, "job"), request);
    const until = Date.now() + 5000;
    while (!existsSync(join(dir, 'ready')) && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 25));
    assert.ok(existsSync(join(dir, 'ready')));
    cancelCommand(job.directory, job.requestDigest, "host:grace-test");
    const result = await waitCommand(job.directory, job.requestDigest, 7000);
    assert.equal(readFileSync(join(dir, 'cleaned'), 'utf8'), 'yes');
    assert.equal(result.receipt?.state, 'cancelled');
    assert.equal(result.receipt?.cleanup, 'confirmed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
