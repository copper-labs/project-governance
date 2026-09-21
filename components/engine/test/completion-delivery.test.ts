import { digest } from "../src/core.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { captureCompletionTarget, deliverCommandCompletion } from "../src/completion-delivery.ts";
import { submitCommand, waitCommand } from "../src/process-owner.ts";

test("native queue receives only bound evidence; failed delivery retries without rerunning work", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "completion-test-"))), oldHome = process.env.CODEX_HOME, oldThread = process.env.CODEX_THREAD_ID;
  process.env.CODEX_HOME = root; process.env.CODEX_THREAD_ID = "11111111-1111-4111-8111-111111111111";
  try {
    const executable = join(root, "queue"), calls = join(root, "notices"), failing = join(root, "fail");
    writeFileSync(failing, "fail");
    writeFileSync(executable, `#!${process.execPath}\nconst fs=require('node:fs');if(process.argv.includes('--help')){console.log('--thread --message');process.exit(0)}fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(process.argv.slice(2))+'\\n');if(fs.existsSync(${JSON.stringify(failing)}))process.exit(1);\n`, { mode: 0o700 });
    const target = captureCompletionTarget(executable), nativeCalls = join(root, "native-calls");
    const request = { id: "completion-fixture", completion: target,
      operation: { argv: [process.execPath, "-e", `require('node:fs').appendFileSync(${JSON.stringify(nativeCalls)},'once');console.log('private output canary')`], cwd: root, env: {}, expectedExitCodes: [0], effect: "read" as const }, deadlineMs: 3000, outputLimit: 4096 };
    const handle = submitCommand(join(root, "job"), request);
    assert.equal((await waitCommand(handle.directory, handle.requestDigest, 5000)).receipt?.state, "succeeded");
    const receipt = join(handle.directory, "completion.json");
    for (let attempt = 0; attempt < 100; attempt++) {
      if (existsSync(receipt) && JSON.parse(readFileSync(receipt, "utf8")).state !== "sending" && !existsSync(join(handle.directory, "completion.lock"))) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(JSON.parse(readFileSync(receipt, "utf8")).state, "failed-or-uncertain");
    const evidenceBefore = readFileSync(join(handle.directory, "result.json"), "utf8");
    assert.equal(deliverCommandCompletion(handle.directory, handle.requestDigest).state, "failed-or-uncertain");
    rmSync(failing);
    const queued = deliverCommandCompletion(handle.directory, handle.requestDigest, true);
    assert.equal(queued.state, "queued"); assert.equal(queued.consumed, "unknown");
    assert.deepEqual(deliverCommandCompletion(handle.directory, handle.requestDigest, true), queued);
    assert.equal(readFileSync(nativeCalls, "utf8"), "once");
    assert.equal(readFileSync(calls, "utf8").trim().split("\n").length, 2);
    assert.ok(!readFileSync(calls, "utf8").includes("private output canary"));
    assert.equal(readFileSync(join(handle.directory, "result.json"), "utf8"), evidenceBefore);
    assert.throws(() => deliverCommandCompletion(handle.directory, "wrong"), /identity differs/);
  } finally {
    if (oldHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = oldHome;
    if (oldThread === undefined) delete process.env.CODEX_THREAD_ID; else process.env.CODEX_THREAD_ID = oldThread;
    rmSync(root, { recursive: true, force: true });
  }
});

test("delivery refuses changed executable or changed evidence instead of reusing a stale notice", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "completion-binding-"))), oldHome = process.env.CODEX_HOME, oldThread = process.env.CODEX_THREAD_ID;
  process.env.CODEX_HOME = root; process.env.CODEX_THREAD_ID = "22222222-2222-4222-8222-222222222222";
  try {
    const executable = join(root, "queue"), calls = join(root, "calls");
    const source = `#!${process.execPath}\nif(process.argv.includes('--help'))console.log('--thread --message');else require('node:fs').appendFileSync(${JSON.stringify(calls)},'sent');\n`;
    writeFileSync(executable, source, { mode: 0o700 });
    const target = captureCompletionTarget(executable);
    const request = { version: 1, completion: target };
    // Fixture receipts isolate delivery; no command is launched by this test.
    writeFileSync(join(root, "request.json"), JSON.stringify(request));
    const hash = digest(request);
    const result = { version: 1, requestDigest: hash, state: "succeeded", cleanup: "confirmed" };
    writeFileSync(join(root, "result.json"), JSON.stringify(result));
    writeFileSync(executable, source + "// changed\n");
    assert.throws(() => deliverCommandCompletion(root, hash), /host identity changed/);
    assert.equal(existsSync(calls), false);
    writeFileSync(executable, source);
    assert.equal(deliverCommandCompletion(root, hash).state, "queued");
    writeFileSync(join(root, "result.json"), JSON.stringify({ ...result, state: "failed" }));
    assert.throws(() => deliverCommandCompletion(root, hash, true), /evidence identity differs/);
    assert.equal(readFileSync(calls, "utf8"), "sent");
  } finally {
    if (oldHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = oldHome;
    if (oldThread === undefined) delete process.env.CODEX_THREAD_ID; else process.env.CODEX_THREAD_ID = oldThread;
    rmSync(root, { recursive: true, force: true });
  }
});
