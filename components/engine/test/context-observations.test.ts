import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { digest, durableJson } from "../src/core.ts";
import { contextStateRoot } from "../src/context-command.ts";
import { codexUsageRecord, importContextUsage, contextObservationStatus, recordContextObservation, collectContextHostUsage, indexPromptEntry } from "../src/context-observations.ts";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath } from "../../harness/src/store/location.ts";
import { execFileSync } from "node:child_process";

test("native response usage joins exact prompt identity, excludes cumulative counters and deduplicates", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "context-observations-"))), old = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    const store = new Store(defaultDbPath(root)), task = store.createTask("Record native usage", [], { worktree: root }); store.close();
    const entryId = digest("entry").slice(7), state = contextStateRoot(root), transcript = join(root, "host.jsonl");
    durableJson(join(state, "prompt-entries", `${entryId}.json`), { version: 1, entryId, workspace: root, session: "thread", turn: "root-turn",
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
