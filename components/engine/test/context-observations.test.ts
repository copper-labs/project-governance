import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { digest, durableJson } from "../src/core.ts";
import { contextStateRoot } from "../src/context-command.ts";
import { codexUsageRecord, importContextUsage, contextObservationStatus, recordContextObservation, collectContextHostUsage, observeContextHostUsage, indexPromptEntry, publishContextObservation } from "../src/context-observations.ts";
import { startupObserveCommand } from "../src/startup-observe-command.ts";
import { readContextProjection } from "../src/telemetry-projection.ts";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath, workContext } from "../../harness/src/store/location.ts";
import { execFileSync } from "node:child_process";

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

test("Stop collects only its exact turn and stays neutral without touching startup ownership", async () => {
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
    assert.deepEqual(report.usage, { responses: 1, inputTokens: 100, outputTokens: 20 });
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
