import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, realpathSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { waitCommand, processFingerprint } from "../src/process-owner.ts";
import { submitProviderJob } from "../src/provider-job.ts";
import { reconcileCommand } from "../src/command-recovery.ts";
import { commandProcesses } from "../src/command-owner-recovery.ts";

type FixtureWriter = { pid: number; fingerprint: string };

async function waitFixtureWriters(writers: FixtureWriter[], until: number, root: string) {
  while (true) {
    const rows = commandProcesses();
    const live = writers.filter(writer => {
      if (!rows.some(row => row.pid === writer.pid)) return false;
      const fingerprint = processFingerprint(writer.pid);
      return fingerprint === null || fingerprint === writer.fingerprint;
    });
    if (!live.length) return;
    assert.ok(Date.now() < until, `Retain fixture evidence at ${root}; exact fixture writers remain live: ${JSON.stringify(live)}`);
    await new Promise(resolve => setTimeout(resolve, Math.min(50, Math.max(1, until - Date.now()))));
  }
}

function acknowledgedFixtureWriters(directory: string, requestDigest: string): FixtureWriter[] {
  return ["owner.json", "guardian.json"].map(name => {
    const record = JSON.parse(readFileSync(join(directory, name), "utf8"));
    assert.equal(record.requestDigest, requestDigest);
    assert.ok(Number.isSafeInteger(record.pid) && record.pid > 1 && typeof record.fingerprint === "string" && record.fingerprint.length);
    return { pid: record.pid, fingerprint: record.fingerprint };
  });
}

test("shared owner exchanges Codex messages and cleans persistent completion or parent-input requests", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "codex-owner-")));
  const jobs: Array<{ directory: string; requestDigest: string; until: number }> = [];
  try {
    const extra = join(root, "additional"); mkdirSync(extra);
    const scopeLine = `Additional roots: ${JSON.stringify([extra])}`;
    for (const callback of [false, true]) {
      const script = `const rl=require('node:readline').createInterface({input:process.stdin});const send=v=>console.log(JSON.stringify(v));setInterval(()=>{},1000);
rl.on('line',line=>{const v=JSON.parse(line);
if(v.id===0)send({id:0,result:{}});
if(v.id===1)send({id:1,result:{model:'fixture',reasoningEffort:'high',cwd:process.cwd(),approvalPolicy:'never',sandbox:{type:'dangerFullAccess'},thread:{id:'session'}}});
if(v.id===2){if(!v.params.input[0].text.includes(${JSON.stringify(scopeLine)}) || !v.params.input[0].text.endsWith('Assignment:\\nassignment'))process.exit(9);send({id:2,result:{turn:{id:'turn'}}});
if(${callback})send({id:33,method:'item/tool/requestUserInput'});
else {send({method:'item/completed',params:{item:{type:'agentMessage',id:'answer',phase:'final_answer',text:JSON.stringify({outcome:'completed',answer:'done',artifacts:[],sources:[],checks:[],remaining:[]})}}});send({method:'turn/completed',params:{turn:{id:'turn',status:'completed'}}});}}
if(v.id===33)require('node:fs').writeFileSync('callback.json',JSON.stringify(v));
});`;
      const executable = join(root, callback ? "callback-native" : "complete-native");
      writeFileSync(executable, `#!${process.execPath}\n${script}`); chmodSync(executable, 0o700);
      const submitted = await submitProviderJob(join(root, callback ? "callback" : "completed"), { id: callback ? "callback" : "completed", prompt: "assignment",
        provider: "codex", model: "fixture", effort: "high", requiredTools: [], additionalRoots: [extra],
        executable, workspace: root, registry: join(root, "registry.sqlite"), assignment: { role: "reviewer", constraints: "No publication", context: "" }, deadlineMs: 8000, outputLimit: 16384 });
      jobs.push({ ...submitted, until: Date.now() + 10000 });
      const result = await waitCommand(submitted.directory, submitted.requestDigest, 10000);
      assert.equal(result.receipt?.state, callback ? "failed" : "succeeded");
      assert.equal(result.receipt?.reason, callback ? "provider-blocked" : "provider-completed");
      assert.equal(result.receipt?.cleanup, "confirmed");
      const evidence = JSON.parse(readFileSync(result.receipt!.providerResult!, "utf8"));
      assert.equal(evidence.state, callback ? "blocked" : "succeeded");
      assert.equal(evidence.identity.conversationId, "session");
      assert.equal(evidence.identity.turnId, "turn");
      reconcileCommand(submitted.directory, submitted.requestDigest);
      if (callback) assert.deepEqual(JSON.parse(readFileSync(join(root, "callback.json"), "utf8")), { id: 33, result: { answers: {} } });
    }
  } finally {
    // Native cleanup does not end detached supervisor bookkeeping; retain their directory until both acknowledged writers exit.
    for (const job of jobs) await waitFixtureWriters(acknowledgedFixtureWriters(job.directory, job.requestDigest), job.until, root);
    rmSync(root, { recursive: true, force: true });
  }
});

test("fixture disposal waits for an exact writer that can publish after terminal evidence", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "codex-owner-quiescence-"))), terminal = join(root, "terminal.json"), late = join(root, "late-bookkeeping.json");
  const writer = spawn(process.execPath, ["--input-type=module", "-e", `
    import {writeFileSync} from 'node:fs';
    writeFileSync(${JSON.stringify(terminal)}, JSON.stringify({cleanup:'confirmed'}));
    process.send('terminal');
    process.on('message', () => { writeFileSync(${JSON.stringify(late)}, 'bookkeeping complete'); process.disconnect(); });
  `], { stdio: ["ignore", "ignore", "ignore", "ipc"] });
  const until = Date.now() + 10000;
  try {
    const [message] = await once(writer, "message", { signal: AbortSignal.timeout(Math.max(1, until - Date.now())) });
    assert.equal(message, "terminal");
    assert.equal(JSON.parse(readFileSync(terminal, "utf8")).cleanup, "confirmed");
    const fingerprint = processFingerprint(writer.pid!); assert.ok(fingerprint);
    let settled = false;
    const quiescence = waitFixtureWriters([{ pid: writer.pid!, fingerprint }], until, root).then(() => { settled = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false, "Terminal evidence cannot authorize disposal while its exact writer is live");
    writer.send("complete-bookkeeping");
    await quiescence;
    assert.equal(readFileSync(late, "utf8"), "bookkeeping complete", "Late publication must finish before directory removal");
  } finally {
    if (writer.connected) writer.send("complete-bookkeeping");
    // This spawn handle remains exact even when initial fingerprint inspection fails.
    if (writer.exitCode === null && writer.signalCode === null) {
      try { await once(writer, "close", { signal: AbortSignal.timeout(Math.max(1, until - Date.now())) }); }
      catch { assert.fail(`Retain fixture evidence at ${root}; exact spawned writer has not closed: ${writer.pid}`); }
    }
    rmSync(root, { recursive: true, force: true });
  }
});
