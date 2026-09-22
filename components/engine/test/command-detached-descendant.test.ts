import { object } from "../src/core.ts";
import { providerJobCommand } from "../src/provider-job-command.ts";
const restartCommandGuardian = async (directory: string, digest: string, authority: string) =>
  object((await providerJobCommand("command-resume-cleanup", ["--directory", directory, "--digest", digest, "--authority", authority])).result);
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { commandProcesses, hasConfirmedCommandCleanup } from "../src/command-owner-recovery.ts";
import { processFingerprint, submitCommand, waitCommand } from "../src/process-owner.ts";
const pause = () => new Promise(resolve => setTimeout(resolve, 20));

for (const ending of ["worker-loss", "native-exit", "supervision-loss"] as const) test(`guardian owns an observed detached child across ${ending}`, async () => {
  const root = mkdtempSync(join(tmpdir(), "command-detached-child-"));
  let launch: { owner: {pid:number;fingerprint:string}; child: {pid:number;fingerprint:string} } | undefined;
  let descendant: {pid:number;fingerprint:string} | undefined;
  try {
    const script = "const fs=require('node:fs');const child=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});child.unref();fs.writeFileSync('descendant',String(child.pid));setInterval(()=>{if(fs.existsSync('finish'))process.exit(0)},20)";
    const job = submitCommand(join(root, "job"), { id: ending, operation: { argv: [process.execPath, "-e", script], cwd: root, env: {}, expectedExitCodes: [0], effect: "read" }, deadlineMs: 15000, outputLimit: 4096 });
    const until = Date.now() + 6000;
    while (Date.now() < until) {
      const path = join(job.directory, "group-members.json");
      if (existsSync(path) && existsSync(join(root, "descendant"))) {
        descendant = JSON.parse(readFileSync(path, "utf8")).members.find((member: {pid:number}) => member.pid === Number(readFileSync(join(root, "descendant"), "utf8")));
        if (descendant) break;
      }
      await pause();
    }
    assert.ok(descendant);
    launch = JSON.parse(readFileSync(join(job.directory, "launch.json"), "utf8")); assert.ok(launch);
    assert.notEqual(commandProcesses().find(row => row.pid === descendant!.pid)?.group, launch.child.pid);
    if (ending === "supervision-loss") {
      await assert.rejects(restartCommandGuardian(job.directory, job.requestDigest, "test:premature"), /worker still present/);
      const guardian = JSON.parse(readFileSync(join(job.directory, "guardian.json"), "utf8"));
      assert.equal(processFingerprint(guardian.pid), guardian.fingerprint); process.kill(guardian.pid, "SIGKILL");
      assert.equal(processFingerprint(launch.owner.pid), launch.owner.fingerprint); process.kill(launch.owner.pid, "SIGKILL");
      assert.equal(processFingerprint(launch.child.pid), launch.child.fingerprint); process.kill(launch.child.pid, "SIGKILL");
      const stoppedBy = Date.now() + 3000;
      while ([guardian, launch.owner, launch.child].some(record => processFingerprint(record.pid) === record.fingerprint) && Date.now() < stoppedBy) await pause();
      assert.equal(processFingerprint(descendant.pid), descendant.fingerprint);
      assert.equal((await restartCommandGuardian(job.directory, job.requestDigest, "test:resume-cleanup")).state, "guardian-running");
    } else if (ending === "worker-loss") {
      assert.equal(processFingerprint(launch.owner.pid), launch.owner.fingerprint); process.kill(launch.owner.pid, "SIGKILL");
    } else writeFileSync(join(root, "finish"), "exit normally");
    const observed = await waitCommand(job.directory, job.requestDigest, 7000);
    assert.equal(observed.receipt?.state, "unknown");
    if (ending === "native-exit") { assert.equal(observed.receipt?.cleanup, "unknown"); assert.equal(observed.receipt?.exitCode, 0); }
    const recoveredBy = Date.now() + 5000;
    while (!hasConfirmedCommandCleanup(job.directory, observed.receipt!) && Date.now() < recoveredBy) await pause();
    assert.equal(hasConfirmedCommandCleanup(job.directory, observed.receipt!), true);
    assert.notEqual(processFingerprint(descendant.pid), descendant.fingerprint);
    if (ending === "supervision-loss") {
      assert.equal((await restartCommandGuardian(job.directory, job.requestDigest, "test:replay")).state, "reconciled");
      assert.equal(Number(readFileSync(join(root, "descendant"), "utf8")), descendant.pid);
    }
  } finally {
    for (const record of [descendant, launch?.child, launch?.owner])
      if (record && processFingerprint(record.pid) === record.fingerprint) process.kill(record.pid, "SIGKILL");
    // Native cleanup can precede the guardian's final receipt/reconciliation writes.
    const path = join(root, "job", "guardian.json");
    if (existsSync(path)) {
      const guardian = JSON.parse(readFileSync(path, "utf8")), until = Date.now() + 5000;
      while (processFingerprint(guardian.pid) === guardian.fingerprint && Date.now() < until) await pause();
      assert.notEqual(processFingerprint(guardian.pid), guardian.fingerprint, `Retain evidence while guardian is alive: ${root}`);
    }
    rmSync(root, { recursive: true, force: true });
  }
});
