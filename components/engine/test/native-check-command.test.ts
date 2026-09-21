import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { processFingerprint } from "../src/process-owner.ts";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { commandExecutable, runNativeCheckCommand } from "../src/native-check-command.ts";

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
    while(owners.some(owner=>processFingerprint(owner.pid)===owner.fingerprint) && Date.now()<deadline)
      await new Promise(resolve=>setTimeout(resolve,50));
    assert.ok(owners.every(owner=>processFingerprint(owner.pid)!==owner.fingerprint),"Recorded writers must exit before removing test evidence");
    rmSync(root, { recursive: true, force: true });
  }
});
