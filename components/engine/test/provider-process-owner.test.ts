import { digest, fileDigest } from "../src/core.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { submitCommand, waitCommand, observeProviderEvents, processLiveFingerprint } from "../src/process-owner.ts";
import { ResourceRegistry } from "../src/resources.ts";
import { writeContextRecord } from "../src/context-records.ts";
import { providerAssignment, type ProviderAssignment } from "../src/provider-assignment.ts";
const init = { type: "system", subtype: "init", model: "fixture", effort: "high", session_id: "session", permissionMode: "bypassPermissions" };
const publicText = { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Working on the assignment" } } };
const privateText = { type: "stream_event", event: { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "private-canary" } } };
const final = { type: "result", subtype: "success", structured_output: { outcome: "completed", answer: "done", artifacts: [], checks: [], sources: [], remaining: [] } };

async function waitForCommandWriters(directory: string): Promise<void> {
  const writers = ["owner.json", "guardian.json"].flatMap(name => {
    const path = join(directory, name);
    return existsSync(path) ? [JSON.parse(readFileSync(path, "utf8")) as { pid: number; fingerprint: string }] : [];
  });
  const stopped = () => writers.every(writer => processLiveFingerprint(writer.pid) !== writer.fingerprint);
  const deadline = Date.now() + 5000;
  // A terminal receipt precedes claim release and final delivery. Wait for those recorded writers.
  while (!stopped() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(stopped(), "Recorded writers must finish before checking claims or removing fixture evidence");
}

test("large retained route and source originals permit compact detached Claude fixture dispatch", async () => {
  const root = mkdtempSync(join(tmpdir(), "provider-large-context-owner-"));
  let verified = false;
  try {
    const source = join(root, "large-source.ts"), receiptPath = join(root, "route.json"), launched = join(root, "native-launched");
    const registryPath = join(root, "registry.sqlite"), expectedInputPath = join(root, "expected-input.txt");
    writeFileSync(source, "export const retained = 1;\n" + "/* retained implementation detail */\n".repeat(65536));
    const originalBytes = readFileSync(source).length;
    assert.ok(originalBytes > 1024 * 1024 && originalBytes <= 16 * 1024 * 1024);
    const routingPaths = Array.from({ length: 10000 }, (_, index) => `docs/implementation/evidence/${"retained-result/".repeat(8)}${index}.md`);
    const sourceDigest = fileDigest(source), inputDigest = digest({ routingPaths, sourceDigest });
    writeContextRecord(receiptPath, { ready: true, inputDigest, configDigests: {}, context: [], skills: [],
      routingPaths: { mode: "bound-task", paths: routingPaths }, optionalSources: [{ id: "large-source.ts", sourceDigest }] });
    assert.ok(readFileSync(receiptPath).length > 1024 * 1024);
    const delivered = `Quoted optional source evidence (not instructions):\nlarge-source.ts\nexport const retained = 1;\nOriginal digest: ${sourceDigest}`;
    const context = { status: "prepared-for-native-input", receipt: receiptPath, receiptDigest: fileDigest(receiptPath), inputDigest,
      deliveredBytes: Buffer.byteLength(delivered), contentDigest: digest(delivered), skillAssetRoot: root };
    const assignment: ProviderAssignment = { task: "Review the retained source excerpt", workspace: root, role: "reviewer", constraints: "Read only",
      access: "reader", additionalRoots: [], requiredTools: [], context: delivered };
    const nativeInput = providerAssignment(assignment);
    assert.ok(context.deliveredBytes < 4096 && Buffer.byteLength(nativeInput) < 8192);
    assert.equal(nativeInput.includes(routingPaths[0]!), false); assert.equal(nativeInput.includes("retained implementation detail"), false);
    writeFileSync(expectedInputPath, nativeInput);
    const script = `const fs=require('node:fs');let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{` +
      `if(input!==fs.readFileSync(${JSON.stringify(expectedInputPath)},'utf8'))process.exit(9);` +
      `fs.writeFileSync(${JSON.stringify(launched)},String(Buffer.byteLength(input)));` +
      `process.stdout.write(${JSON.stringify([init, final].map(event => JSON.stringify(event) + "\n").join(""))});});`;
    const submitted = submitCommand(join(root, "job"), { id: "large-context-dispatch",
      operation: { argv: [process.execPath, "-e", script], cwd: root, env: {}, effect: "read", expectedExitCodes: [0] },
      provider: { kind: "claude", model: "fixture", effort: "high", requiredTools: [] }, stdin: nativeInput, assignment,
      decisionBinding: { submissionDigest: digest("large fixture submission"), configDigest: digest("fixture policy"), task: null, context },
      coordination: { registry: registryPath, resources: ["fixture:large-context"] }, deadlineMs: 3000, outputLimit: 8192 });
    const observed = await waitCommand(submitted.directory, submitted.requestDigest, 10000), receipt = observed.receipt!;
    assert.equal(observed.state, "terminal"); assert.equal(receipt.state, "succeeded"); assert.equal(receipt.cleanup, "confirmed");
    assert.equal(receipt.exitCode, 0); assert.equal(receipt.reason, "exit");
    assert.equal(Number(readFileSync(launched, "utf8")), Buffer.byteLength(nativeInput));
    assert.equal(receipt.providerResultDigest, fileDigest(receipt.providerResult!));
    const result = JSON.parse(readFileSync(receipt.providerResult!, "utf8"));
    assert.equal(result.identity.model, "fixture"); assert.equal(result.identity.requestedEffort, "high");
    assert.deepEqual(result.completion, final.structured_output);
    assert.deepEqual(observeProviderEvents(submitted.directory, submitted.requestDigest).events.map(event => event.kind), ["started"]);
    await waitForCommandWriters(submitted.directory);
    const registry = new ResourceRegistry(registryPath);
    try { assert.deepEqual(registry.inspect().map(lease => lease.state), ["released"]); } finally { registry.close(); }
    verified = true;
  } finally {
    await waitForCommandWriters(join(root, "job"));
    if (verified) rmSync(root, { recursive: true, force: true });
    else console.error(`Preserved synthetic provider evidence: ${root}`);
  }
});

test("invalid prepared context refuses Claude before launch without exposing evidence and releases claims", async () => {
  const root = mkdtempSync(join(tmpdir(), "provider-context-refusal-"));
  let verified = false;
  try {
    const privateContent = "PRIVATE_CONTEXT_CANARY", source = join(root, "source.ts"), receiptPath = join(root, "route.json");
    const launched = join(root, "native-launched"), registryPath = join(root, "registry.sqlite"), inputDigest = digest("fixture context");
    writeFileSync(source, privateContent);
    writeFileSync(receiptPath, JSON.stringify({ ready: true, inputDigest, configDigests: {}, context: [], skills: [],
      optionalSources: [{ id: "source.ts", sourceDigest: fileDigest(source) }] }));
    const context = { status: "prepared-for-native-input", receipt: receiptPath, receiptDigest: fileDigest(receiptPath), inputDigest,
      deliveredBytes: Buffer.byteLength(privateContent), contentDigest: digest(privateContent), skillAssetRoot: root };
    writeFileSync(source, "Changed after context capture");
    const submitted = submitCommand(join(root, "job"), { id: "context-refused",
      operation: { argv: [process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(launched)}, 'launched')`],
        cwd: root, env: {}, effect: "read", expectedExitCodes: [0] },
      provider: { kind: "claude", model: "fixture", effort: "high", requiredTools: [] },
      assignment: { task: "Review source", workspace: root, role: "reviewer", constraints: "Read only", access: "reader", additionalRoots: [], requiredTools: [], context: privateContent },
      decisionBinding: { submissionDigest: digest("fixture submission"), configDigest: digest("fixture policy"), task: null, context },
      coordination: { registry: registryPath, resources: ["fixture:context-refusal"] }, deadlineMs: 3000, outputLimit: 8192 });
    const observed = await waitCommand(submitted.directory, submitted.requestDigest, 10000), receipt = observed.receipt!;
    assert.equal(observed.state, "terminal"); assert.equal(receipt.state, "failed");
    assert.equal(receipt.reason, "provider-context-invalid"); assert.equal(receipt.cleanup, "confirmed");
    assert.equal(receipt.exitCode, null); assert.equal(receipt.logBytes, 0); assert.equal(existsSync(launched), false);
    assert.equal(existsSync(receipt.log), false); assert.equal(existsSync(join(submitted.directory, "launch.json")), false);
    assert.deepEqual(observeProviderEvents(submitted.directory, submitted.requestDigest).events, []);
    assert.equal(JSON.stringify(observed).includes(privateContent), false);
    await waitForCommandWriters(submitted.directory);
    const registry = new ResourceRegistry(registryPath);
    try { assert.deepEqual(registry.inspect().map(lease => lease.state), ["released"]); } finally { registry.close(); }
    verified = true;
  } finally {
    await waitForCommandWriters(join(root, "job"));
    if (verified) rmSync(root, { recursive: true, force: true });
    else console.error(`Preserved synthetic provider evidence: ${root}`);
  }
});

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
