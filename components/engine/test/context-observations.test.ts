import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, realpathSync, appendFileSync, renameSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { digest, durableJson } from "../src/core.ts";
import { contextStateRoot } from "../src/context-command.ts";
import { codexUsageRecord, importContextUsage, contextObservationStatus, recordContextObservation, collectContextHostUsage, observeContextHostUsage, indexPromptEntry, publishContextObservation, associatePromptTask, currentTaskPromptEntry, readHostUsageWindow, publishUsageCursor } from "../src/context-observations.ts";
import { resolveTaskContext } from "../src/decision-task-binding.ts";
import { runtimeExecutionIdentity } from "../src/runtime-execution-identity.ts";
import { startupObserveCommand } from "../src/startup-observe-command.ts";
import { readContextProjection } from "../src/telemetry-projection.ts";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath, workContext } from "../../harness/src/store/location.ts";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

function usageFixture(t: import("node:test").TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "context-usage-delta-"))), prior = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  execFileSync("git", ["init", "-q"], { cwd: root, stdio: "pipe" });
  const state = contextStateRoot(root), transcript = join(root, "host.jsonl"), entryId = digest("incremental-entry").slice(7);
  const entry = { version: 1, entryId, workspace: root, worktreeLocator: workContext(root).locator, session: "thread", turn: "turn",
    runtimeVersion: "3.0.0-rc.10.9", archiveDigest: `sha256:${"a".repeat(64)}`, scopeKind: "provisional-session", status: "prepared" };
  durableJson(join(state, "prompt-entries", `${entryId}.json`), entry);
  indexPromptEntry(root, entryId, entry.session, entry.turn);
  const row = (responseId: string, output = 20) => JSON.stringify({ type: "token_usage_record", payload: {
    thread_id: entry.session, root_turn_id: entry.turn, response_id: responseId, usage: { input_tokens: 100, output_tokens: output },
  } }) + "\n";
  const event = { session_id: entry.session, turn_id: entry.turn, transcript_path: transcript };
  const cursor = () => {
    const directory = join(state, "native-usage-cursors");
    return existsSync(directory) ? JSON.parse(readFileSync(join(directory, readdirSync(directory)[0]!), "utf8")) : null;
  };
  t.after(() => {
    if (prior === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = prior;
    rmSync(root, { recursive: true, force: true });
  });
  return { root, state, transcript, entryId, entry, event, row, cursor };
}

test("explicit external evidence reads remain observable while credential paths stay refused", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "context-explicit-evidence-"))), old = process.env.XDG_STATE_HOME;
  const sibling = join(root, "sibling"), path = "docs/evidence/run/review.md", entryId = "d".repeat(64);
  process.env.XDG_STATE_HOME = join(root, "state");
  try {
    mkdirSync(join(sibling, "docs/evidence/run"), { recursive: true });
    execFileSync("git", ["init", "-q"], { cwd: sibling, stdio: "pipe" });
    writeFileSync(join(sibling, path), "Retained original review evidence.\n");
    writeFileSync(join(sibling, ".env"), "FIXTURE=not-eligible\n");
    durableJson(join(contextStateRoot(root), "prompt-entries", `${entryId}.json`), { version: 1, entryId,
      workspace: root, worktreeLocator: workContext(root).locator, session: "thread", turn: "turn", scopeKind: "provisional", status: "prepared" });
    assert.doesNotThrow(() => recordContextObservation(root, entryId, { kind: "expansion", path, sourceWorkspace: sibling }));
    const names = readdirSync(join(contextStateRoot(root), "context-observations"));
    const observation = JSON.parse(readFileSync(join(contextStateRoot(root), "context-observations", names[0]!), "utf8"));
    assert.equal(observation.source.path, path); assert.equal(observation.source.worktreeLocator, workContext(sibling).locator);
    assert.match(observation.source.digest, /^sha256:[a-f0-9]{64}$/u);
    assert.throws(() => recordContextObservation(root, entryId, { kind: "expansion", path: ".env", sourceWorkspace: sibling }), /eligible relative source path/);
  } finally {
    if (old === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = old;
    rmSync(root, { recursive: true, force: true });
  }
});

test("native response usage joins exact prompt identity, excludes cumulative counters and deduplicates", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "context-observations-"))), old = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    const store = new Store(defaultDbPath(root)), task = store.createTask("Record native usage", [], { worktree: root }); store.close();
    const entryId = digest("entry").slice(7), state = contextStateRoot(root), transcript = join(root, "host.jsonl");
    durableJson(join(state, "prompt-entries", `${entryId}.json`), { version: 1, entryId, workspace: root, worktreeLocator: workContext(root).locator, session: "thread", turn: "root-turn",
      scopeKind: "bound-task", binding: { taskId: task.taskId }, status: "prepared" });
    indexPromptEntry(root, entryId, "thread", "root-turn");
    const row = { type: "token_usage_record", payload: { thread_id: "thread", session_id: "internal-session", turn_id: "model-turn", root_turn_id: "root-turn", response_id: "response-1",
      usage: { input_tokens: 100, output_tokens: 20, cached_input_tokens: 50, reasoning_output_tokens: 5 }, thread_token_usage: { input_tokens: 90000 } } };
    writeFileSync(transcript, [{ type: "response_item", payload: { text: "private user prose" } }, row, row,
      { ...row, payload: { ...row.payload, thread_id: "different-thread", response_id: "foreign-response" } }].map(value => JSON.stringify(value)).join("\n") + "\n");
    const original = Store.prototype.recordUsage;
    Store.prototype.recordUsage = () => null;
    let result;
    try { result = importContextUsage(root, entryId, transcript); }
    finally { Store.prototype.recordUsage = original; }
    assert.equal(result.storeProjectionFailures, 1);
    assert.equal(result.recorded, 1); assert.equal(result.duplicates, 1);
    assert.equal(importContextUsage(root, entryId, transcript).recorded, 0);
    const reopened = new Store(defaultDbPath(root));
    try { assert.equal(reopened.usageTotals(task.taskId).inputTokens, 100); } finally { reopened.close(); }
    assert.equal(collectContextHostUsage(root, "thread", transcript).state, "observed");
    assert.equal(codexUsageRecord(row, "thread", "different-turn"), null);
    assert.equal(codexUsageRecord(row, "internal-session", "root-turn"), null);
    recordContextObservation(root, entryId, { kind: "expansion", path: "src/parser.ts" });
    recordContextObservation(root, entryId, { kind: "outcome", disposition: "accepted", evidence: "check-receipt:example" });
    assert.throws(() => recordContextObservation(root, entryId, { kind: "expansion", path: "../outside" }), /unsafe/);
    const report = contextObservationStatus(root);
    assert.deepEqual(report.usage, { responses: 1, inputTokens: 100, outputTokens: 20 });
    assert.equal(report.avoidedTokens, null);
    for (const name of readdirSync(join(state, "context-observations"))) assert.ok(!readFileSync(join(state, "context-observations", name), "utf8").includes("private user prose"));
    writeFileSync(transcript, '{"type":"unsupported-format"}\n');
    assert.equal(collectContextHostUsage(root, "thread", transcript).state, "format-unrecognized");
  } finally {
    if (old === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = old;
    rmSync(root, { recursive: true, force: true });
  }
});

test("recent status retains native rollover and binding observations without private receipt contents", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "context-observation-status-"))), old = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  try {
    const state = contextStateRoot(root), kinds = ["startup-owner-rollover", "task-binding", "task-refresh", "task-switch"];
    for (const kind of kinds) {
      const path = join(state, "context-observations", `${digest(kind).slice(7)}.json`);
      const value = { version: 1, kind, entryId: "e".repeat(64), createdAt: new Date().toISOString(),
        binding: { taskId: "task", revision: "1" }, privateProse: "receipt-only private detail" };
      assert.equal(publishContextObservation(path, value, root), true);
      assert.equal(publishContextObservation(path, value, root), false);
      assert.equal(readFileSync(path, "utf8").includes(value.privateProse), true);
    }
    const report = contextObservationStatus(root);
    assert.equal(report.projection.state, "available");
    for (const kind of kinds) assert.equal(report.counts[`context-observations:${kind}`], 1);
    const projection = readContextProjection(state, root);
    assert.equal(JSON.stringify(projection).includes("receipt-only private detail"), false);
    assert.ok(projection.records.every(item => item.taskId === "task" && item.taskRevision === "1"));
    assert.deepEqual(report.usage, { inputTokens: null, outputTokens: null, responses: 0 });
  } finally {
    if (old === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = old;
    rmSync(root, { recursive: true, force: true });
  }
});

test("Stop collects its session's exactly linked turns and stays neutral without touching startup ownership", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "context-stop-usage-"))), old = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  try {
    execFileSync("git", ["init", "-q"], { cwd: root, stdio: "pipe" });
    const transcript = join(root, "host.jsonl"), state = contextStateRoot(root);
    const row = (turn: string) => ({ type: "token_usage_record", payload: { thread_id: "thread", root_turn_id: turn,
      response_id: `response-${turn}`, usage: { input_tokens: 100, output_tokens: 20 }, thread_token_usage: { input_tokens: 90000 } } });
    for (const turn of ["current", "earlier"]) {
      const entryId = digest(turn).slice(7);
      durableJson(join(state, "prompt-entries", `${entryId}.json`), { version: 1, entryId, workspace: root,
        worktreeLocator: workContext(root).locator, session: "thread", turn, scopeKind: "provisional-session", status: "prepared" });
      indexPromptEntry(root, entryId, "thread", turn);
    }
    writeFileSync(transcript, [{ type: "response_item", payload: { text: "PRIVATE_PROMPT_CANARY" } }, row("earlier"), row("current")]
      .map(value => JSON.stringify(value)).join("\n") + "\n");
    const event = { hook_event_name: "Stop", session_id: "thread", turn_id: "current", cwd: root, transcript_path: transcript };
    const eventFile = join(root, "event.json"); writeFileSync(eventFile, JSON.stringify(event));
    const moduleUrl = pathToFileURL(resolve("components/engine/src/startup-observe-command.ts")).href;
    const commandInput = { provider: "codex", eventStdin: true, workspace: root, registry: join(root, "never-created.sqlite"),
      receipts: join(root, "never-created-receipts"), installedScope: true };
    const neutral = execFileSync(process.execPath, ["--input-type=module", "--eval",
      `import {startupObserveCommand} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(await startupObserveCommand(${JSON.stringify(commandInput)})));`],
      { cwd: root, input: JSON.stringify(event), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 10000 });
    assert.deepEqual(JSON.parse(neutral), {}, "The native Stop response cannot ask the host to continue or block");
    const originalCwd = process.cwd(); process.chdir(root);
    try {
      const result = await startupObserveCommand({ provider: "codex", eventFile: "event.json", eventStdin: false, workspace: root,
        registry: join(root, "never-created.sqlite"), receipts: join(root, "never-created-receipts"), installedScope: true });
      assert.ok(result && typeof result === "object");
      assert.equal("action" in result && result.action, "observe");
      assert.equal("discover" in result && result.discover, false);
      assert.equal("decision" in result, false);
    } finally { process.chdir(originalCwd); }
    assert.equal(readdirSync(root).includes("never-created.sqlite"), false);
    const report = contextObservationStatus(root);
    assert.deepEqual(report.usage, { responses: 2, inputTokens: 200, outputTokens: 40 });
    const replay = observeContextHostUsage(root, event);
    assert.equal("recorded" in replay && replay.recorded, 0);
    for (const name of readdirSync(join(state, "context-observations"))) {
      const content = readFileSync(join(state, "context-observations", name), "utf8");
      assert.ok(!content.includes("PRIVATE_PROMPT_CANARY"));
      const receipt = JSON.parse(content);
      if (receipt.kind === "usage-collection") assert.equal(receipt.acceptance, "unknown");
    }
    writeFileSync(transcript, '{"type":"unsupported-format"}\n');
    assert.equal(observeContextHostUsage(root, event).state, "format-unrecognized");
    assert.equal(observeContextHostUsage(root, { ...event, transcript_path: join(root, "missing") }).state, "unavailable");
    assert.equal(observeContextHostUsage(root, { ...event, turn_id: null }).state, "missing-native-identity");
  } finally {
    if (old === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = old;
    rmSync(root, { recursive: true, force: true });
  }
});

test("long-lived chat collects append deltas and resumes at the exact complete-line byte offset", t => {
  const f = usageFixture(t), filler = JSON.stringify({ type: "response_item", payload: { text: "PRIVATE_PROMPT_CANARY " + "x".repeat(1400) } }) + "\n";
  const complete = filler.repeat(4500) + f.row("first"), second = Buffer.from(f.row("second").trimEnd().slice(0, -1) + ',"diagnostic":"🧪"}\n');
  const split = second.indexOf(Buffer.from("🧪")) + 2;
  writeFileSync(f.transcript, Buffer.concat([Buffer.from(complete), second.subarray(0, split)]));
  const first = observeContextHostUsage(f.root, f.event);
  assert.equal(first.state, "observed"); assert.equal("recorded" in first && first.recorded, 1);
  assert.equal(first.cursor?.state, "advanced");
  assert.equal(f.cursor().offset, Buffer.byteLength(complete));
  assert.equal(first.collectionWindow?.pendingBytes, split);
  appendFileSync(f.transcript, second.subarray(split));
  const appended = observeContextHostUsage(f.root, f.event);
  assert.equal(appended.state, "observed"); assert.equal("recorded" in appended && appended.recorded, 1);
  assert.equal(appended.collectionWindow?.mode, "incremental"); assert.equal(appended.readBytes, second.length);
  assert.ok(Number(appended.readBytes) < 1024, "Later collection does not reparse megabytes of earlier conversation");
  const unchanged = observeContextHostUsage(f.root, f.event);
  assert.equal(unchanged.state, "no-new-records"); assert.equal(unchanged.readBytes, 0);
  assert.deepEqual(contextObservationStatus(f.root).usage, { responses: 2, inputTokens: 200, outputTokens: 40 });
  assert.equal(JSON.stringify(f.cursor()).includes("PRIVATE_PROMPT_CANARY"), false);
  for (const name of readdirSync(join(f.state, "context-observations")))
    assert.equal(readFileSync(join(f.state, "context-observations", name), "utf8").includes("PRIVATE_PROMPT_CANARY"), false);
});

test("verified ordinary transcript append reports no new usage without confusing an unrecognized snapshot", t => {
  const f = usageFixture(t);
  writeFileSync(f.transcript, f.row("first"));
  assert.equal(observeContextHostUsage(f.root, f.event).cursor?.state, "advanced");
  const ordinary = JSON.stringify({ type: "response_item", payload: { text: "PRIVATE_PROMPT_CANARY" } }) + "\n";
  appendFileSync(f.transcript, ordinary);
  const appended = observeContextHostUsage(f.root, f.event);
  assert.equal(appended.state, "no-new-usage-records");
  assert.equal(appended.collectionWindow?.mode, "incremental");
  assert.equal(appended.readBytes, Buffer.byteLength(ordinary));
  assert.equal(appended.cursor?.state, "advanced");
  assert.equal(f.cursor().offset, Buffer.byteLength(f.row("first") + ordinary));
  assert.deepEqual(contextObservationStatus(f.root).usage, { responses: 1, inputTokens: 100, outputTokens: 20 });
  assert.equal(observeContextHostUsage(f.root, f.event).state, "no-new-records");
  assert.equal(collectContextHostUsage(f.root, "thread", f.transcript).state, "observed");
  writeFileSync(f.transcript, ordinary);
  assert.equal(observeContextHostUsage(f.root, f.event).state, "format-unrecognized");
  for (const name of readdirSync(join(f.state, "context-observations")))
    assert.equal(readFileSync(join(f.state, "context-observations", name), "utf8").includes("PRIVATE_PROMPT_CANARY"), false);
});

test("a malformed completed usage line retains its earlier cursor until corrected original evidence is readable", t => {
  const f = usageFixture(t), first = f.row("first");
  writeFileSync(f.transcript, first); observeContextHostUsage(f.root, f.event);
  appendFileSync(f.transcript, '{"type":"token_usage_record","payload":broken}\n');
  const invalid = observeContextHostUsage(f.root, f.event);
  assert.equal(invalid.state, "format-unrecognized");
  assert.equal(invalid.cursor?.state, "not-advanced"); assert.equal(f.cursor().offset, Buffer.byteLength(first));
  writeFileSync(f.transcript, first + f.row("second"));
  assert.equal(observeContextHostUsage(f.root, f.event).cursor?.state, "advanced");
  assert.equal(contextObservationStatus(f.root).usage.responses, 2);
});

test("native usage cursor detects rotation, truncation and a rewritten retained boundary", t => {
  const f = usageFixture(t);
  writeFileSync(f.transcript, f.row("first")); observeContextHostUsage(f.root, f.event);
  renameSync(f.transcript, f.transcript + ".rotated");
  writeFileSync(f.transcript, f.row("second") + '{"type":"other","padding":"' + "x".repeat(4096) + '"}\n');
  const rotated = observeContextHostUsage(f.root, f.event);
  assert.equal(rotated.collectionWindow?.mode, "reset"); assert.equal(rotated.collectionWindow?.reason, "file-replaced");
  writeFileSync(f.transcript, f.row("third"));
  const truncated = observeContextHostUsage(f.root, f.event);
  assert.equal(truncated.collectionWindow?.reason, "file-truncated");
  writeFileSync(f.transcript, f.row("fourh", 30));
  const rewritten = observeContextHostUsage(f.root, f.event);
  assert.equal(rewritten.collectionWindow?.reason, "boundary-rewritten");
  assert.equal(rewritten.cursor?.state, "advanced");
  assert.deepEqual(contextObservationStatus(f.root).usage, { responses: 4, inputTokens: 400, outputTokens: 90 });
});

test("interrupted receipt publication cannot advance the native cursor or lose a response", t => {
  const f = usageFixture(t);
  writeFileSync(f.transcript, f.row("response"));
  writeFileSync(join(f.state, "context-observations"), "Unavailable receipt directory");
  const failed = observeContextHostUsage(f.root, f.event);
  assert.equal(failed.cursor?.state, "not-advanced"); assert.equal(f.cursor(), null);
  rmSync(join(f.state, "context-observations"));
  const recovered = observeContextHostUsage(f.root, f.event);
  assert.equal("recorded" in recovered && recovered.recorded, 1); assert.equal(recovered.cursor?.state, "advanced");
  assert.equal("recorded" in observeContextHostUsage(f.root, f.event) && contextObservationStatus(f.root).usage.responses, 1);
});

test("invalid cursor and absent original entry remain explicit until the original becomes available", t => {
  const f = usageFixture(t);
  writeFileSync(f.transcript, f.row("response")); observeContextHostUsage(f.root, f.event);
  const directory = join(f.state, "native-usage-cursors"), path = join(directory, readdirSync(directory)[0]!);
  writeFileSync(path, '{"version":99}\n');
  const invalid = observeContextHostUsage(f.root, f.event);
  assert.equal(invalid.collectionWindow?.reason, "cursor-invalid"); assert.equal(invalid.cursor?.state, "advanced");
  rmSync(path); rmSync(join(f.state, "prompt-entries", `${f.entryId}.json`));
  const missing = observeContextHostUsage(f.root, f.event);
  assert.equal(missing.state, "no-linked-entries"); assert.equal(missing.cursor?.state, "not-advanced");
  durableJson(join(f.state, "prompt-entries", `${f.entryId}.json`), f.entry);
  assert.equal(observeContextHostUsage(f.root, f.event).cursor?.state, "advanced");
  assert.equal(contextObservationStatus(f.root).usage.responses, 1);
});

test("usage keeps prompt generation separate from its later collector and never stamps historical archive identity", t => {
  const f = usageFixture(t);
  writeFileSync(f.transcript, f.row("response")); observeContextHostUsage(f.root, f.event);
  recordContextObservation(f.root, f.entryId, { kind: "expansion", path: "src/example.ts" });
  recordContextObservation(f.root, f.entryId, { kind: "outcome", disposition: "reopened", evidence: "original-reopen-evidence" });
  for (const name of readdirSync(join(f.state, "context-observations"))) {
    const observation = JSON.parse(readFileSync(join(f.state, "context-observations", name), "utf8"));
    assert.deepEqual(observation.collectorGeneration, runtimeExecutionIdentity());
    if (observation.kind === "usage-collection") assert.equal(observation.promptGeneration, null);
    else assert.deepEqual(observation.promptGeneration, { runtimeVersion: f.entry.runtimeVersion, archiveDigest: f.entry.archiveDigest });
  }
  const { runtimeVersion: _version, archiveDigest: _archive, ...unqualified } = f.entry;
  const id = digest("historical-unstamped-entry").slice(7);
  durableJson(join(f.state, "prompt-entries", `${id}.json`), { ...unqualified, entryId: id });
  const captured = recordContextObservation(f.root, id, { kind: "expansion", path: "src/unqualified.ts" });
  const original = JSON.parse(readFileSync(join(f.state, "context-observations", `${captured.id}.json`), "utf8"));
  assert.deepEqual(original.promptGeneration, { runtimeVersion: null, archiveDigest: null });
});

test("an explicit same-turn refresh links provider B without reallocating A's original prompt or usage", t => {
  const f = usageFixture(t), oldSession = process.env.HARNESS_SESSION;
  process.env.HARNESS_SESSION = f.entry.session;
  t.after(() => { if (oldSession === undefined) delete process.env.HARNESS_SESSION; else process.env.HARNESS_SESSION = oldSession; });
  const store = new Store(defaultDbPath(f.root)), where = workContext(f.root), workspace = store.workspace(where.locator, f.root);
  try {
    const first = store.createTask("Original A", [], { worktree: f.root }), attempt = store.bind(first.taskId, f.entry.session, workspace, f.root);
    const submittedAt = new Date(Date.now() - 1000).toISOString(), entry = { ...f.entry, submittedAt, scopeKind: "bound-task",
      binding: { taskId: first.taskId, revision: "1", attemptId: attempt.attemptId, status: "bound", source: "session" } };
    durableJson(join(f.state, "prompt-entries", `${f.entryId}.json`), entry);
    durableJson(join(f.state, "prompt-preparations", digest(f.entry.session).slice(7), `${digest(f.entry.turn).slice(7)}.json`),
      { entryId: f.entryId, session: f.entry.session, turn: f.entry.turn, submittedAt });
    const second = store.createTask("Switched B", [], { worktree: f.root }), active = store.bind(second.taskId, f.entry.session, workspace, f.root);
    const linked = associatePromptTask({ workspace: f.root, session: f.entry.session, taskId: second.taskId, revision: "1",
      attemptId: active.attemptId, requestedAt: new Date().toISOString() });
    assert.equal(linked.status, "refresh-required");
    const current = resolveTaskContext(f.root, { session: f.entry.session }).context!;
    const providerLink = currentTaskPromptEntry(f.root, current);
    assert.equal(providerLink?.bindingSource, "explicit-task-refresh");
    assert.equal("originalBinding" in providerLink! && providerLink.originalBinding?.taskId, first.taskId);
    assert.equal(providerLink?.entryId, f.entryId);
    writeFileSync(f.transcript, f.row("mixed-response"));
    const usage = importContextUsage(f.root, f.entryId, f.transcript);
    assert.equal(usage.storeProjection, "unallocated-multiple-tasks");
    assert.equal(store.usageTotals(first.taskId).inputTokens, null); assert.equal(store.usageTotals(second.taskId).inputTokens, null);
    assert.deepEqual(JSON.parse(readFileSync(join(f.state, "prompt-entries", `${f.entryId}.json`), "utf8")), entry);
  } finally { store.close(); }
});

test("a Stop append delta captures late responses for a prior linked turn before advancing the session cursor", t => {
  const f = usageFixture(t);
  writeFileSync(f.transcript, f.row("first"));
  observeContextHostUsage(f.root, f.event);
  const entryId = digest("next-entry").slice(7), entry = { ...f.entry, entryId, turn: "next-turn" };
  durableJson(join(f.state, "prompt-entries", `${entryId}.json`), entry);
  indexPromptEntry(f.root, entryId, entry.session, entry.turn);
  const next = JSON.stringify({ type: "token_usage_record", payload: { thread_id: entry.session, root_turn_id: entry.turn,
    response_id: "next-response", usage: { input_tokens: 50, output_tokens: 10 } } }) + "\n";
  appendFileSync(f.transcript, f.row("late-prior-response") + next);
  const captured = observeContextHostUsage(f.root, { ...f.event, turn_id: entry.turn });
  assert.equal(captured.state, "observed"); assert.equal("recorded" in captured && captured.recorded, 2);
  assert.equal(captured.cursor?.state, "advanced");
  assert.deepEqual(contextObservationStatus(f.root).usage, { responses: 3, inputTokens: 250, outputTokens: 50 });
  const originals = readdirSync(join(f.state, "context-observations")).map(name => JSON.parse(readFileSync(join(f.state, "context-observations", name), "utf8")));
  const late = originals.find(record => record.kind === "usage" && record.usage.responseId === "late-prior-response");
  assert.equal(late?.entryId, f.entryId); assert.equal(late?.usage.turn, f.entry.turn);
  assert.equal(observeContextHostUsage(f.root, { ...f.event, turn_id: entry.turn }).state, "no-new-records");
});

test("same-window conflicting response counters stay unqualified and cannot advance a cursor", t => {
  const f = usageFixture(t);
  writeFileSync(f.transcript, f.row("conflicting", 10) + f.row("conflicting", 30));
  const result = observeContextHostUsage(f.root, f.event);
  assert.equal("invalid" in result && result.invalid, 1);
  assert.equal("recorded" in result && result.recorded, 0);
  assert.equal(result.cursor?.state, "not-advanced"); assert.equal(f.cursor(), null);
  assert.deepEqual(contextObservationStatus(f.root).usage, { responses: 0, inputTokens: null, outputTokens: null });
  writeFileSync(f.transcript, f.row("conflicting", 30));
  assert.equal(observeContextHostUsage(f.root, f.event).cursor?.state, "advanced");
  assert.deepEqual(contextObservationStatus(f.root).usage, { responses: 1, inputTokens: 100, outputTokens: 30 });
});

test("a permanently ambiguous steered turn retains unknown originals and advances later unique deltas once", t => {
  const f = usageFixture(t), prefix = (JSON.stringify({ type: "response_item", payload: { text: "synthetic history " + "x".repeat(2000) } }) + "\n").repeat(1500);
  writeFileSync(f.transcript, prefix + f.row("before-steering")); observeContextHostUsage(f.root, f.event);
  const originals = readdirSync(join(f.state, "context-observations")).map(file => ({ file, bytes: readFileSync(join(f.state, "context-observations", file)) }));
  const childId = digest("same-turn-steered-entry").slice(7), child = { ...f.entry, entryId: childId };
  durableJson(join(f.state, "prompt-entries", `${childId}.json`), child); indexPromptEntry(f.root, childId, child.session, child.turn);
  const ambiguous = f.row("after-steering"); appendFileSync(f.transcript, ambiguous);
  const first = observeContextHostUsage(f.root, f.event);
  assert.equal(first.cursor?.state, "advanced"); assert.equal(first.readBytes, Buffer.byteLength(ambiguous));
  assert.equal("recorded" in first && first.recorded, 0); assert.equal("ambiguousTurns" in first && first.ambiguousTurns, 1);
  const unknown = "ambiguousOriginals" in first ? first.ambiguousOriginals[0]! : null;
  assert.equal(unknown?.reason, "unallocated-multiple-prompts"); assert.equal(unknown?.bytes, Buffer.byteLength(ambiguous));
  assert.equal(unknown?.offset, Buffer.byteLength(prefix + f.row("before-steering")));
  assert.equal(unknown?.digest, `sha256:${createHash("sha256").update(ambiguous).digest("hex")}`);
  for (let index = 0; index < 4; index++) {
    const entryId = digest(`later-unique-${index}`).slice(7), entry = { ...f.entry, entryId, turn: `later-turn-${index}` };
    durableJson(join(f.state, "prompt-entries", `${entryId}.json`), entry); indexPromptEntry(f.root, entryId, entry.session, entry.turn);
    const next = JSON.stringify({ type: "token_usage_record", payload: { thread_id: entry.session, root_turn_id: entry.turn,
      response_id: `later-response-${index}`, usage: { input_tokens: 50, output_tokens: 10 } } }) + "\n";
    appendFileSync(f.transcript, next); const result = observeContextHostUsage(f.root, { ...f.event, turn_id: entry.turn });
    assert.equal(result.cursor?.state, "advanced"); assert.equal(result.readBytes, Buffer.byteLength(next)); assert.equal("recorded" in result && result.recorded, 1);
  }
  assert.deepEqual(contextObservationStatus(f.root).usage, { responses: 5, inputTokens: 300, outputTokens: 60 });
  assert.equal(observeContextHostUsage(f.root, f.event).readBytes, 0);
  for (const original of originals) assert.deepEqual(readFileSync(join(f.state, "context-observations", original.file)), original.bytes);
});

test("an unlinked earlier turn advances unknown coverage and imports its exact original after a late entry", t => {
  const f = usageFixture(t);
  const prior = { ...f.entry, entryId: digest("prior-not-yet-linked").slice(7), turn: "prior-turn" };
  const late = JSON.stringify({ type: "token_usage_record", payload: { thread_id: prior.session, root_turn_id: prior.turn,
    response_id: "unlinked-prior-response", usage: { input_tokens: 50, output_tokens: 10 } } }) + "\n";
  writeFileSync(f.transcript, late + f.row("current-response"));
  const incomplete = observeContextHostUsage(f.root, f.event);
  assert.equal(incomplete.state, "observed"); assert.equal("recorded" in incomplete && incomplete.recorded, 1);
  assert.equal(incomplete.cursor?.state, "advanced"); assert.equal("unlinkedTurns" in incomplete && incomplete.unlinkedTurns, 1);
  durableJson(join(f.state, "prompt-entries", `${prior.entryId}.json`), prior);
  indexPromptEntry(f.root, prior.entryId, prior.session, prior.turn);
  const recovered = observeContextHostUsage(f.root, f.event);
  assert.equal("recorded" in recovered && recovered.recorded, 1); assert.equal(recovered.cursor?.state, "advanced");
  assert.deepEqual(contextObservationStatus(f.root).usage, { responses: 2, inputTokens: 150, outputTokens: 30 });
  assert.equal(observeContextHostUsage(f.root, f.event).state, "no-new-records");
});

test("a permanently rejected or legacy turn never pins later ordinary session deltas", t => {
  const f = usageFixture(t), turn = "rejected-or-legacy-turn";
  const original = JSON.stringify({ type: "token_usage_record", payload: { thread_id: f.entry.session, root_turn_id: turn,
    response_id: "unlinked-response", usage: { input_tokens: 50, output_tokens: 10 } } }) + "\n";
  // A historical preparation marker is not a live owner; it may remain after refusal or an interrupted analytics write.
  durableJson(join(f.state, "prompt-preparations", digest(f.entry.session).slice(7), "historical.json"),
    { version: 1, entryId: digest("never-indexed").slice(7), session: f.entry.session, turn, submittedAt: "2026-01-01T00:00:00.000Z" });
  durableJson(join(f.state, "prompt-rejections", `${digest({ provider: "codex", reason: "prompt-unavailable-or-over-limit", session: f.entry.session, turn }).slice(7)}.json`),
    { version: 1, status: "not-delivered", reason: "prompt-unavailable-or-over-limit", createdAt: "2026-01-01T00:00:00.000Z" });
  writeFileSync(f.transcript, original + f.row("first-linked"));
  const first = observeContextHostUsage(f.root, f.event);
  assert.equal(first.cursor?.state, "advanced"); assert.equal("unlinkedTurns" in first && first.unlinkedTurns, 1);
  for (let index = 0; index < 5; index++) {
    const next = f.row(`ordinary-${index}`); appendFileSync(f.transcript, next);
    const result = observeContextHostUsage(f.root, f.event);
    assert.equal(result.cursor?.state, "advanced"); assert.equal(result.readBytes, Buffer.byteLength(next));
    assert.equal("recorded" in result && result.recorded, 1);
  }
  assert.deepEqual(contextObservationStatus(f.root).usage, { responses: 6, inputTokens: 600, outputTokens: 120 });
  assert.equal(observeContextHostUsage(f.root, f.event).readBytes, 0);
  const unknown = readdirSync(join(f.state, "context-observations")).map(name => JSON.parse(readFileSync(join(f.state, "context-observations", name), "utf8")))
    .find(item => item.kind === "usage-collection" && item.collection.unlinkedTurns === 1);
  assert.equal(unknown.acceptance, "unknown"); assert.equal(unknown.collection.missingUsage, "unknown");
  assert.equal(unknown.collection.unlinkedOriginals[0].offset, 0);
  assert.equal(unknown.collection.unlinkedOriginals[0].bytes, Buffer.byteLength(original));
});

test("late entry recovery reads the retained usage original even after the normal delta exceeds a snapshot window", t => {
  const f = usageFixture(t), turn = "late-entry-turn", entryId = digest("eventual-entry").slice(7);
  const original = JSON.stringify({ type: "token_usage_record", payload: { thread_id: f.entry.session, root_turn_id: turn,
    response_id: "eventual-response", usage: { input_tokens: 70, output_tokens: 12 } } }) + "\n";
  writeFileSync(f.transcript, original + f.row("first")); observeContextHostUsage(f.root, f.event);
  appendFileSync(f.transcript, (JSON.stringify({ type: "response_item", payload: { text: "PRIVATE_PROMPT_CANARY " + "x".repeat(2000) } }) + "\n").repeat(4300));
  observeContextHostUsage(f.root, f.event);
  durableJson(join(f.state, "prompt-entries", `${entryId}.json`), { ...f.entry, entryId, turn });
  indexPromptEntry(f.root, entryId, f.entry.session, turn);
  const recovered = observeContextHostUsage(f.root, f.event);
  assert.equal("recorded" in recovered && recovered.recorded, 1); assert.equal(recovered.readBytes, Buffer.byteLength(original));
  assert.deepEqual(contextObservationStatus(f.root).usage, { responses: 2, inputTokens: 170, outputTokens: 32 });
  assert.equal(observeContextHostUsage(f.root, f.event).readBytes, 0);
  const receipt = readdirSync(join(f.state, "context-observations")).map(name => JSON.parse(readFileSync(join(f.state, "context-observations", name), "utf8")))
    .find(item => item.kind === "usage" && item.usage.responseId === "eventual-response");
  assert.equal(receipt.entryId, entryId); assert.equal(receipt.source.offset, 0);
  assert.equal(receipt.source.bytes, Buffer.byteLength(original));
  assert.equal(receipt.source.windowDigest, `sha256:${createHash("sha256").update(original).digest("hex")}`);
  assert.equal(JSON.stringify(f.cursor()).includes("PRIVATE_PROMPT_CANARY"), false);
});

test("a changed deferred usage original cannot acquire attribution from a later entry", t => {
  const f = usageFixture(t), turn = "changed-before-entry", entryId = digest("changed-entry").slice(7);
  const row = (output: number) => JSON.stringify({ type: "token_usage_record", payload: { thread_id: f.entry.session, root_turn_id: turn,
    response_id: "changed-response", usage: { input_tokens: 50, output_tokens: output } } }) + "\n";
  const original = row(10); writeFileSync(f.transcript, original + f.row("first")); observeContextHostUsage(f.root, f.event);
  writeFileSync(f.transcript, row(30) + f.row("first"));
  durableJson(join(f.state, "prompt-entries", `${entryId}.json`), { ...f.entry, entryId, turn }); indexPromptEntry(f.root, entryId, f.entry.session, turn);
  const changed = observeContextHostUsage(f.root, f.event);
  assert.equal("deferred" in changed && changed.deferred.unavailableRanges, 1);
  assert.equal("deferred" in changed && changed.deferred.skippedCurrentResponses, 1);
  assert.equal("deferred" in changed && changed.deferred.skippedCurrentTurns, 1);
  assert.equal("deferred" in changed && changed.deferred.skippedCurrentOriginals[0]!.digest,
    `sha256:${createHash("sha256").update(row(30)).digest("hex")}`);
  assert.deepEqual(contextObservationStatus(f.root).usage, { responses: 1, inputTokens: 100, outputTokens: 20 });
  assert.equal(changed.cursor?.state, "advanced"); assert.equal(observeContextHostUsage(f.root, f.event).readBytes, 0);
});

for (const mode of ["rotation", "truncation"] as const) {
  test(`${mode} keeps a late entry's unavailable original explicit without pinning new work`, t => {
    const f = usageFixture(t), turn = `unlinked-${mode}`, entryId = digest(`late-${mode}`).slice(7);
    const original = JSON.stringify({ type: "token_usage_record", payload: { thread_id: f.entry.session, root_turn_id: turn,
      response_id: `original-${mode}`, usage: { input_tokens: 50, output_tokens: 10 } } }) + "\n";
    writeFileSync(f.transcript, original + f.row("first")); observeContextHostUsage(f.root, f.event);
    if (mode === "rotation") renameSync(f.transcript, f.transcript + ".rotated");
    writeFileSync(f.transcript, f.row("new-linked"));
    durableJson(join(f.state, "prompt-entries", `${entryId}.json`), { ...f.entry, entryId, turn }); indexPromptEntry(f.root, entryId, f.entry.session, turn);
    const next = observeContextHostUsage(f.root, f.event);
    assert.equal("deferred" in next && next.deferred.unavailableRanges, 1); assert.equal(next.cursor?.state, "advanced");
    assert.deepEqual(contextObservationStatus(f.root).usage, { responses: 2, inputTokens: 200, outputTokens: 40 });
    assert.equal(observeContextHostUsage(f.root, f.event).readBytes, 0);
  });
}

test("late entry validates conflicting counters across original ranges before any attribution", t => {
  const f = usageFixture(t), turn = "late-conflict", entryId = digest("late-conflict-entry").slice(7);
  const row = (output: number) => JSON.stringify({ type: "token_usage_record", payload: { thread_id: f.entry.session, root_turn_id: turn,
    response_id: "same-late-response", usage: { input_tokens: 50, output_tokens: output } } }) + "\n";
  writeFileSync(f.transcript, row(10)); observeContextHostUsage(f.root, f.event);
  appendFileSync(f.transcript, row(30)); observeContextHostUsage(f.root, f.event);
  durableJson(join(f.state, "prompt-entries", `${entryId}.json`), { ...f.entry, entryId, turn }); indexPromptEntry(f.root, entryId, f.entry.session, turn);
  const conflict = observeContextHostUsage(f.root, f.event);
  assert.ok("deferred" in conflict);
  assert.equal(conflict.deferred.retainedRanges, 2); assert.equal("recorded" in conflict && conflict.recorded, 0);
  assert.deepEqual(contextObservationStatus(f.root).usage, { responses: 0, inputTokens: null, outputTokens: null });
});

test("a changed same-offset cursor retains concurrent unknown ranges instead of overwriting them", t => {
  const f = usageFixture(t); writeFileSync(f.transcript, f.row("first")); observeContextHostUsage(f.root, f.event);
  const expected = f.cursor(), window = readHostUsageWindow(f.transcript, expected), directory = join(f.state, "native-usage-cursors"), path = join(directory, readdirSync(directory)[0]!);
  const range = { turn: "concurrent-unlinked", file: expected.file, offset: 0, bytes: Buffer.byteLength(f.row("first")),
    observedSize: expected.observedSize, digest: `sha256:${createHash("sha256").update(f.row("first")).digest("hex")}` };
  const concurrent = { ...expected, deferred: [range] }; durableJson(path, concurrent);
  const result = publishUsageCursor(f.root, f.entry.session, f.transcript, expected, window.checkpoint, [], 0);
  assert.deepEqual(result, { state: "retained", reason: "concurrent-cursor-already-recorded" }); assert.deepEqual(f.cursor(), concurrent);
});

test("rotation cannot restamp a changed earlier unlinked response through the current snapshot", t => {
  const f = usageFixture(t), turn = "rotated-before-entry", entryId = digest("rotated-entry").slice(7);
  const row = (output: number) => JSON.stringify({ type: "token_usage_record", payload: { thread_id: f.entry.session, root_turn_id: turn,
    response_id: "same-rotated-response", usage: { input_tokens: 50, output_tokens: output } } }) + "\n";
  writeFileSync(f.transcript, row(10) + f.row("first")); observeContextHostUsage(f.root, f.event);
  renameSync(f.transcript, f.transcript + ".rotated"); writeFileSync(f.transcript, row(30) + f.row("new-linked"));
  durableJson(join(f.state, "prompt-entries", `${entryId}.json`), { ...f.entry, entryId, turn }); indexPromptEntry(f.root, entryId, f.entry.session, turn);
  const changed = observeContextHostUsage(f.root, f.event);
  assert.ok("deferred" in changed);
  assert.equal(changed.deferred.unavailableRanges, 1); assert.equal(changed.cursor?.state, "advanced");
  assert.equal(changed.deferred.skippedCurrentResponses, 1); assert.equal(changed.deferred.skippedCurrentOriginals[0]!.offset, 0);
  assert.equal(changed.deferred.skippedCurrentOriginals[0]!.bytes, Buffer.byteLength(row(30)));
  assert.deepEqual(contextObservationStatus(f.root).usage, { responses: 2, inputTokens: 200, outputTokens: 40 });
});

test("an excluded-only current window retains exact skipped originals as unknown", t => {
  const f = usageFixture(t), original = f.row("excluded-only"); writeFileSync(f.transcript, original);
  const result = collectContextHostUsage(f.root, f.entry.session, f.transcript, { excludedTurns: new Set([f.entry.turn]) });
  assert.ok("skippedResponses" in result);
  assert.equal(result.state, "skipped-usage-records"); assert.equal(result.recorded, 0);
  assert.equal(result.skippedResponses, 1); assert.equal(result.skippedTurns, 1); assert.equal(result.skippedUsage, "unknown");
  assert.equal(result.skippedOriginals![0]!.offset, 0); assert.equal(result.skippedOriginals![0]!.bytes, Buffer.byteLength(original));
  assert.equal(result.skippedOriginals![0]!.digest, `sha256:${createHash("sha256").update(original).digest("hex")}`);
  assert.equal(result.cursorSafe, true); assert.equal(contextObservationStatus(f.root).usage.responses, 0);
});

test("near-cap deferred hints preserve unknown coverage while ordinary transcript reads stay incremental", t => {
  const f = usageFixture(t), turn = "historical-unlinked", limit = 8 * 1024 * 1024;
  const separator = JSON.stringify({ type: "response_item" }) + "\n";
  const chunk = (from: number, through: number) => Array.from({ length: through - from }, (_, index) => JSON.stringify({ type: "token_usage_record", payload: {
    thread_id: f.entry.session, root_turn_id: turn, response_id: `historical-${from + index}`, usage: { input_tokens: 50, output_tokens: 10 },
  } }) + "\n" + separator).join("");
  writeFileSync(f.transcript, chunk(0, 25000));
  const first = observeContextHostUsage(f.root, f.event); assert.equal(first.cursor?.state, "advanced");
  appendFileSync(f.transcript, chunk(25000, 50000));
  const second = observeContextHostUsage(f.root, f.event); assert.equal(second.cursor?.state, "advanced");
  const directory = join(f.state, "native-usage-cursors"), path = join(directory, readdirSync(directory)[0]!);
  const before = statSync(path).size; assert.ok(before > limit * 0.9 && before <= limit);
  const hints = f.cursor(); assert.ok(hints.deferred.length > 30000); assert.ok(hints.deferredOmittedRanges > 0);
  const next = f.row("ordinary-after-hint-pressure"); appendFileSync(f.transcript, next);
  const started = performance.now(), ordinary = observeContextHostUsage(f.root, f.event), elapsed = performance.now() - started;
  assert.equal(ordinary.cursor?.state, "advanced"); assert.equal(ordinary.readBytes, Buffer.byteLength(next));
  assert.equal("recorded" in ordinary && ordinary.recorded, 1); assert.equal("unlinkedTurns" in ordinary && ordinary.unlinkedTurns, 0);
  assert.ok("deferred" in ordinary); assert.equal(ordinary.deferred.retainedRanges, hints.deferred.length);
  assert.equal(ordinary.deferred.omittedRanges, hints.deferredOmittedRanges); assert.equal(ordinary.deferred.readBytes, 0);
  const after = statSync(path).size;
  t.diagnostic(JSON.stringify({ fixture: "synthetic-near-cap-unknown-hints", cursorBytesBefore: before, cursorBytesAfter: after,
    retainedRanges: hints.deferred.length, omittedRanges: hints.deferredOmittedRanges, reportedNativeReadBytes: ordinary.readBytes,
    advisoryHintReadBytesAtLeast: before * 2, advisoryHintDurableWriteBytes: after, ordinaryStopMs: Number(elapsed.toFixed(2)),
    limit: "Reported readBytes excludes hint I/O and boundary verification; measured time is one local observation, not a performance guarantee" }));
});

test("adjacent unlinked usage lines share one exact original range after Unicode transcript bytes", t => {
  const f = usageFixture(t), prefix = JSON.stringify({ type: "response_item", payload: { text: "PRIVATE_PROMPT_CANARY 🧪" } }) + "\n";
  const usage = Array.from({ length: 500 }, (_, index) => f.row(`adjacent-${index}`)).join("");
  writeFileSync(f.transcript, prefix + usage);
  const window = readHostUsageWindow(f.transcript);
  assert.equal(window.records.length, 500); assert.equal(window.recordRanges.length, 1);
  assert.equal(window.recordRanges[0]!.offset, Buffer.byteLength(prefix)); assert.equal(window.recordRanges[0]!.bytes, Buffer.byteLength(usage));
  assert.equal(window.recordRanges[0]!.digest, `sha256:${createHash("sha256").update(usage).digest("hex")}`);
  assert.equal(JSON.stringify(window.recordRanges).includes("PRIVATE_PROMPT_CANARY"), false);
});
