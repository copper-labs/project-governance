import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { processLiveFingerprint } from "../src/process-owner.ts";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { commandExecutable, runNativeCheckCommand } from "../src/native-check-command.ts";
import { commandProcesses } from "../src/command-owner-recovery.ts";

const pause = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

async function until(predicate: () => boolean, milliseconds: number, message: string): Promise<void> {
  const deadline = Date.now() + milliseconds;
  while (!predicate() && Date.now() < deadline) await pause(20);
  assert.ok(predicate(), message);
}

test("native check verdicts preserve exit failure, structured output and timeout", async () => {
  const root = mkdtempSync(join(tmpdir(), "native-check-"));
  try {
    const run = (id: string, code: string, deadlineMs = 3000) => runNativeCheckCommand({ id, root, directory: join(root, id), argv: [process.execPath, "-e", code], deadlineMs, env: {} });
    const passing = "console.error('diagnostic');console.log(JSON.stringify({status:'passed',findings:[]}));";
    assert.equal((await run("pass", passing)).status, "passed");
    assert.equal((await run("exit", passing + "process.exit(7)")).status, "failed");
    assert.equal((await run("invalid", "console.log('not structured')")).integrity_failure, true);
    assert.equal((await run("timeout", "setInterval(()=>{},1000)", 100)).failure_kind, "timeout");
    assert.throws(() => commandExecutable("nonexistent-test-command", root, ":relative:"));
  } finally {
    // A terminal command receipt precedes the supervisor's final delivery/observation writes.
    // Preserve evidence until both recorded writers have exited; deletion is not cancellation.
    const owners=["pass","exit","invalid","timeout"].flatMap(id=>["owner.json","guardian.json"].flatMap(name=>{
      const path=join(root,id,name);return existsSync(path)?[JSON.parse(readFileSync(path,"utf8"))]:[];
    }));
    const deadline=Date.now()+5000;
    while(owners.some(owner=>processLiveFingerprint(owner.pid)===owner.fingerprint) && Date.now()<deadline)
      await new Promise(resolve=>setTimeout(resolve,50));
    assert.ok(owners.every(owner=>processLiveFingerprint(owner.pid)!==owner.fingerprint),"Recorded writers must exit before removing test evidence");
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing checker credentials fail admission without losing completed native proof", async () => {
  const root = mkdtempSync(join(tmpdir(), "native-check-credential-")), name = "ENGINE_NATIVE_TOKEN", previous = process.env[name];
  process.env[name] = randomUUID();
  try {
    const options = { id: "declared", root, directory: join(root, "declared"), argv: [process.execPath, "-e", "if(!process.env.ENGINE_NATIVE_TOKEN)process.exit(7);console.log(JSON.stringify({status:'passed',findings:[]}))"],
      deadlineMs: 3000, env: {}, credentialEnv: [name] };
    const original = await runNativeCheckCommand(options);
    assert.equal(original.status, "passed");
    delete process.env[name];
    const replay = await runNativeCheckCommand(options);
    assert.ok("command_receipt" in replay && "command_receipt" in original);
    assert.deepEqual(replay.command_receipt, original.command_receipt);
    assert.equal(replay.request_digest, original.request_digest);
    const missing = await runNativeCheckCommand({ ...options, id: "missing", directory: join(root, "missing") });
    assert.equal(missing.status, "failed"); assert.equal(missing.findings[0]?.rule_id, "checker.credential-unavailable");
    assert.equal(missing.process_failure, false); assert.equal(missing.integrity_failure, false);
    assert.equal(missing.exit_code, null); assert.equal(existsSync(join(root, "missing")), false);
    await assert.rejects(runNativeCheckCommand({ ...options, directory: join(root, "embedded"), env: { OPENAI_API_KEY: randomUUID() }, credentialEnv: [] }), /credentials cannot be embedded/);
    assert.equal(existsSync(join(root, "embedded")), false);
    await assert.rejects(runNativeCheckCommand({ ...options, directory: join(root, "startup-override"),
      env: { GOVERNANCE_STARTUP_TOKEN: randomUUID() }, credentialEnv: [] }), /credentials cannot be embedded/);
    assert.equal(existsSync(join(root, "startup-override")), false, "custom checker overrides cannot supply startup maintenance identity");
    for (const name of ["ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "anthropic_api_key"])
      await assert.rejects(runNativeCheckCommand({ ...options, directory: join(root, name),
        env: { [name]: randomUUID() }, credentialEnv: [] }), /credentials cannot be embedded/);
  } finally {
    if (previous === undefined) delete process.env[name]; else process.env[name] = previous;
    const owners = ["owner.json", "guardian.json"].flatMap(name => {
      const path = join(root, "declared", name); return existsSync(path) ? [JSON.parse(readFileSync(path, "utf8"))] : [];
    });
    const deadline = Date.now() + 5000;
    while (owners.some(owner => processLiveFingerprint(owner.pid) === owner.fingerprint) && Date.now() < deadline) await pause(50);
    assert.ok(owners.every(owner => processLiveFingerprint(owner.pid) !== owner.fingerprint));
    rmSync(root, { recursive: true, force: true });
  }
});

test("native checker waits for a recorded detached descendant without replay or unrelated cleanup", async () => {
  const root = mkdtempSync(join(tmpdir(), "native-check-detached-finish-"));
  const directory = join(root, "job"), release = join(root, "release-root"), childPath = join(root, "descendant.json");
  const parentGone = join(root, "parent-gone.json"), finished = join(root, "descendant-finished.json"), executions = join(root, "executions.log");
  const unrelated = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
  const unrelatedClosed = new Promise<void>(resolve => unrelated.once("close", () => resolve()));
  let childIdentity: { pid: number; fingerprint: string } | undefined;
  let unrelatedFingerprint: string | null = null;
  let running: ReturnType<typeof runNativeCheckCommand> | undefined;
  let verified = false;
  try {
    await until(() => Boolean(unrelated.pid && processLiveFingerprint(unrelated.pid)), 3000, "unrelated fixture must be observable");
    unrelatedFingerprint = processLiveFingerprint(unrelated.pid!);
    const childCode = `
      const fs=require('node:fs'), parent=Number(process.argv[1]);
      fs.writeFileSync(${JSON.stringify(childPath)},JSON.stringify({pid:process.pid,parent}));
      // A single-use build daemon may finish shutdown after the checker itself exits.
      process.on('SIGTERM',()=>{});
      const safety=setTimeout(()=>process.exit(9),20000);
      const timer=setInterval(()=>{
        let gone=process.ppid!==parent;
        try{process.kill(parent,0)}catch(error){if(error.code==='ESRCH')gone=true;else throw error;}
        if(!gone)return;
        clearInterval(timer);
        fs.writeFileSync(${JSON.stringify(parentGone)},JSON.stringify({at:Date.now()}));
        setTimeout(()=>{fs.writeFileSync(${JSON.stringify(finished)},JSON.stringify({at:Date.now()}));clearTimeout(safety);process.exit(0)},600);
      },20);
    `;
    const rootCode = `
      const fs=require('node:fs'),{spawn}=require('node:child_process');
      fs.appendFileSync(${JSON.stringify(executions)},'once\\n');
      const child=spawn(process.execPath,['-e',${JSON.stringify(childCode)},String(process.pid)],{detached:true,stdio:'ignore'});
      child.unref();
      const timer=setInterval(()=>{
        if(!fs.existsSync(${JSON.stringify(release)}))return;
        clearInterval(timer);console.log(JSON.stringify({status:'passed',findings:[]}));
      },20);
    `;
    const options = { id: "detached-finish", root, directory, argv: [process.execPath, "-e", rootCode], deadlineMs: 15000, env: {} };
    running = runNativeCheckCommand(options);
    await until(() => existsSync(childPath), 5000, "checker must launch its detached descendant");
    const descendant = JSON.parse(readFileSync(childPath, "utf8")) as { pid: number; parent: number };
    const fingerprint = processLiveFingerprint(descendant.pid);
    assert.ok(fingerprint, "fixture descendant must have a live identity");
    childIdentity = { pid: descendant.pid, fingerprint };
    assert.notEqual(commandProcesses().find(row => row.pid === descendant.pid)?.group, descendant.parent, "fixture must escape the checker's original process group");
    // Release only after the guardian has evidence of this exact descendant, not after a fixed delay.
    await until(() => {
      const path = join(directory, "group-members.json");
      if (!existsSync(path)) return false;
      const members = JSON.parse(readFileSync(path, "utf8")) as { group: number; members: Array<{ pid: number; fingerprint: string }> };
      assert.equal(members.group, descendant.parent);
      return members.members.some(member => member.pid === childIdentity!.pid && member.fingerprint === childIdentity!.fingerprint);
    }, 5000, "detached descendant must be recorded before root exit");
    writeFileSync(release, "finish");
    const result = await running;
    writeFileSync(join(root, "observed-result.json"), JSON.stringify(result, null, 2));
    assert.ok("command_receipt" in result, "native command must return its original terminal receipt");
    assert.equal(result.command_receipt?.exitCode, 0);
    assert.equal(result.command_receipt?.reason, "exit");
    assert.equal(result.command_receipt?.cleanup, "confirmed");
    assert.equal(result.status, "passed");
    assert.ok(existsSync(finished), "native owner must wait for descendant shutdown to finish");
    const shutdownMs = JSON.parse(readFileSync(finished, "utf8")).at - JSON.parse(readFileSync(parentGone, "utf8")).at;
    assert.ok(shutdownMs >= 500, "fixture must exercise shutdown beyond the former 100 ms group check");
    assert.notEqual(processLiveFingerprint(childIdentity.pid), childIdentity.fingerprint);
    assert.equal(processLiveFingerprint(unrelated.pid!), unrelatedFingerprint, "unrelated process must remain live");
    assert.equal(existsSync(join(directory, "owner-recovery.json")), false, "ordinary completion must not require guardian recovery");
    const replay = await runNativeCheckCommand(options);
    assert.ok("command_receipt" in replay);
    assert.equal(replay.request_digest, result.request_digest);
    assert.deepEqual(replay.command_receipt, result.command_receipt);
    assert.equal(readFileSync(executions, "utf8"), "once\n", "observation must not replay the checker");
    verified = true;
  } finally {
    writeFileSync(release, "finish");
    if (running) await running.catch(() => undefined);
    if (childIdentity) {
      const deadline = Date.now() + 5000;
      while (processLiveFingerprint(childIdentity.pid) === childIdentity.fingerprint && Date.now() < deadline) await pause(20);
      if (processLiveFingerprint(childIdentity.pid) === childIdentity.fingerprint) process.kill(childIdentity.pid, "SIGKILL");
      await until(() => processLiveFingerprint(childIdentity!.pid) !== childIdentity!.fingerprint, 3000, "owned descendant must finish before fixture cleanup");
    }
    if (unrelated.exitCode === null && unrelated.signalCode === null) unrelated.kill("SIGTERM");
    await unrelatedClosed;
    const writers = ["owner.json", "guardian.json"].flatMap(name => {
      const path = join(directory, name);
      return existsSync(path) ? [JSON.parse(readFileSync(path, "utf8")) as { pid: number; fingerprint: string }] : [];
    });
    await until(() => writers.every(writer => processLiveFingerprint(writer.pid) !== writer.fingerprint), 5000, "recorded writers must finish before fixture cleanup");
    // A failing-before receipt stays in the temporary fixture for diagnosis.
    if (verified) rmSync(root, { recursive: true, force: true });
    else console.error(`Preserved synthetic cleanup evidence: ${root}`);
  }
});
