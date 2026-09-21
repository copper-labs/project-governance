import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { durableJson } from "../src/core.ts";
import { processFingerprint } from "../src/process-owner.ts";
import { inspectCheckRun } from "../src/check-status.ts";

test("check observation distinguishes live owner, incomplete run and matching terminal receipt", () => {
  const root = mkdtempSync(join(tmpdir(), "check-status-")), id = randomUUID(), directory = join(root, id);
  try {
    mkdirSync(directory);
    const intent = { version: 1, id, plan: { execution_order: [] }, owner: { pid: process.pid, fingerprint: processFingerprint(process.pid) } };
    durableJson(join(directory, "run.json"), intent);
    assert.equal(inspectCheckRun(id, root).state, "running");
    durableJson(join(directory, "run.json"), { ...intent, owner: { pid: process.pid, fingerprint: "different-process" } });
    assert.equal(inspectCheckRun(id, root).state, "incomplete");
    assert.equal(inspectCheckRun(id, root).status, "outcome-unknown");
    durableJson(join(directory, "result.json"), { run_id: id, status: "passed" });
    assert.equal(inspectCheckRun(id, root).state, "terminal");
    durableJson(join(directory, "result.json"), { run_id: randomUUID(), status: "passed" });
    assert.throws(() => inspectCheckRun(id, root));
    assert.throws(() => inspectCheckRun("../other", root));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("queued checks remain pending until claimed and never hide a failed worker", () => {
  const root = mkdtempSync(join(tmpdir(), "check-queued-")), id = randomUUID(), directory = join(root, id);
  try {
    mkdirSync(directory);
    const intent = { version: 1, id, state: "queued", plan: { execution_order: [] }, owner: null };
    durableJson(join(directory, "run.json"), intent);
    assert.equal(inspectCheckRun(id, root).state, "queued");
    durableJson(join(directory, "worker.claim"), {});
    assert.equal(inspectCheckRun(id, root).state, "incomplete");
    rmSync(join(directory, "worker.claim"));
    durableJson(join(directory, "failure.json"), { id, reason: "worker-incomplete" });
    assert.equal(inspectCheckRun(id, root).state, "incomplete");
    rmSync(join(directory, "failure.json"));
    durableJson(join(directory, "run.json"), { ...intent, state: "running" });
    assert.equal(inspectCheckRun(id, root).state, "incomplete");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
