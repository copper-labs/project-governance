import { fileDigest } from "../src/core.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { submitCommand, waitCommand, observeProviderEvents } from "../src/process-owner.ts";
const init = { type: "system", subtype: "init", model: "fixture", effort: "high", session_id: "session", permissionMode: "bypassPermissions" };
const publicText = { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Working on the assignment" } } };
const privateText = { type: "stream_event", event: { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "private-canary" } } };
const final = { type: "result", subtype: "success", structured_output: { outcome: "completed", answer: "done", artifacts: [], checks: [], sources: [], remaining: [] } };
test("shared owner requires native provider completion in addition to native exit success", async () => {
  const root = mkdtempSync(join(tmpdir(), "provider-owner-"));
  try {
    const cases = [
      { id: "success", events: [init, privateText, publicText, final], tools: [], reason: "exit", state: "succeeded" },
      { id: "missing-tools", events: [init, final], tools: ["command"], reason: "provider-blocked", state: "failed" },
      { id: "no-terminal", events: [init], tools: [], reason: "provider-stream-invalid", state: "failed" },
      { id: "wrong-model", events: [{ ...init, model: "different" }, final], tools: [], reason: "provider-stream-invalid", state: "failed" },
    ];
    for (const fixture of cases) {
      const submitted = submitCommand(join(root, fixture.id), { id: fixture.id,
        operation: { argv: [process.execPath, "-e", "process.stdout.write(" + JSON.stringify(fixture.events.map(event => JSON.stringify(event) + "\n").join("")) + ")"], cwd: root, env: {}, effect: "read", expectedExitCodes: [0] },
        provider: { kind: "claude", model: "fixture", effort: "high", requiredTools: fixture.tools }, deadlineMs: 3000, outputLimit: 8192 });
      const result = await waitCommand(submitted.directory, submitted.requestDigest, 5000);
      assert.equal(result.receipt?.state, fixture.state); assert.equal(result.receipt?.reason, fixture.reason);
      assert.equal(result.receipt?.cleanup, "confirmed");
      if (fixture.id === "success") {
        const progress = readFileSync(result.receipt!.providerEvents!, "utf8");
        assert.equal(progress.includes("private-canary"), false);
        const events = progress.trim().split("\n").map(line => JSON.parse(line));
        assert.deepEqual(events.map(event => event.sequence), [1, 2]);
        assert.equal(events[1].text, "Working on the assignment");
        assert.ok(events.every(event => event.requestDigest === submitted.requestDigest));
        const page = observeProviderEvents(submitted.directory, submitted.requestDigest, 0, 1);
        assert.equal(page.cursor, 1);
        assert.equal(observeProviderEvents(submitted.directory, submitted.requestDigest, page.cursor).cursor, 2);
        assert.deepEqual(observeProviderEvents(submitted.directory, submitted.requestDigest, 2).events, []);
        assert.throws(() => observeProviderEvents(submitted.directory, "wrong"), /identity mismatch/);
      }
      if (result.receipt?.providerResult) {
        assert.equal(result.receipt.providerResultDigest, fileDigest(result.receipt.providerResult));
        const evidence = JSON.parse(readFileSync(result.receipt.providerResult, "utf8"));
        assert.equal(evidence.requestDigest, submitted.requestDigest);
        assert.equal(evidence.identity.conversationId, "session");
        assert.equal(evidence.identity.model, "fixture");
        assert.equal(evidence.state, fixture.id === "success" ? "succeeded" : "blocked");
      }
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Gemini native events and framed stdin run through the same detached owner", async () => {
  const root = mkdtempSync(join(tmpdir(), "gemini-owner-"));
  try {
    const records = [{ event: "init", conversation_id: "session", init: { model: "fixture-high", effort: "high", permission_mode: "always-proceed" } },
      { event: "step_update", step_update: { step_type: "tool", step_index: 1, tool_name: "run_command", state: "DONE" } },
      { event: "result", result: { status: "SUCCESS", structured_output: { outcome: "completed", answer: "done", artifacts: [], checks: [], sources: [], remaining: [] } } }];
    const script = `let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{if(JSON.parse(input).event!=='user')process.exit(9);process.stdout.write(${JSON.stringify(records.map(record => JSON.stringify(record) + "\n").join(""))})})`;
    const submission = submitCommand(join(root, "job"), { id: "gemini", stdin: JSON.stringify({ event: "user", message: { content: "fixture assignment" } }) + "\n",
      provider: { kind: "gemini", model: "fixture-high", effort: "high", requiredTools: ["command"] },
      operation: { argv: [process.execPath, "-e", script], cwd: root, env: {}, effect: "read", expectedExitCodes: [0] }, deadlineMs: 3000, outputLimit: 8192 });
    const result = await waitCommand(submission.directory, submission.requestDigest, 5000);
    assert.equal(result.receipt?.state, "succeeded"); assert.equal(result.receipt?.cleanup, "confirmed");
    assert.deepEqual(observeProviderEvents(submission.directory, submission.requestDigest).events.map(event => event.kind), ["started", "tool"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
