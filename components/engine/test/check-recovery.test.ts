import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { digest, durableJson } from "../src/core.ts";
import { reconcileCheckRun } from "../src/check-recovery.ts";
import { RuntimeGenerations } from "../src/runtime-generations.ts";

function fixture() {
  const state = realpathSync(mkdtempSync(join(tmpdir(), "check-recovery-"))), root = join(state, "project-governance", "check-runs"), id = randomUUID(), directory = join(root, id);
  mkdirSync(root, { recursive: true });
  const registry = join(root, "generation.sqlite"), generations = new RuntimeGenerations(registry);
  const db = new DatabaseSync(registry);
  db.prepare("UPDATE current SET revision=1,directory=? WHERE id=1").run(root); db.close();
  const reader = { registry, ...generations.acquire(`check:${id}`) }, other = generations.acquire("other");
  const plan = { execution_order: ["test"] }, scope = { subject: "fixture" }, packs = { test: {} };
  const work = { version: 1, id, root, runsRoot: root, generation: reader, plan, scope, packs };
  // A real exited process supplies absence, rather than relying on a guessed unused PID.
  const pid = Number(execFileSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" }));
  const intent = { version: 1, id, root, plan, scope, packs_digest: digest(packs), owner: { pid, fingerprint: "fixture" } };
  const commandDirectory = join(directory, digest("test").slice(7), "command-2");
  const request = { version: 1, id: `${id}:test:2`, operation: { cwd: root } }, hash = digest(request);
  const receipt = { version: 1, requestDigest: hash, state: "failed", cleanup: "confirmed" };
  const result = { version: 1, run_id: id, run_directory: directory, plan, status: "failed",
    results: [{ pack_id: "test", commands: [{ request_digest: hash, termination_reason: "outcome-unknown" }] }] };
  durableJson(join(directory, "dispatch.json"), work); durableJson(join(directory, "run.json"), intent);
  durableJson(join(directory, "result.json"), result); durableJson(join(commandDirectory, "request.json"), request);
  durableJson(join(commandDirectory, "result.json"), receipt);
  return { state, root, id, directory, generations, reader, other, work, intent, commandDirectory, receipt, result,
    reconcile: () => reconcileCheckRun(id, { root, workspace: root }),
    close: () => { generations.close(); rmSync(state, { recursive: true, force: true }); } };
}

test("stopped terminal check releases only its reader after native cleanup, preserving failure and replay", () => {
  const f = fixture();
  try {
    const original = readFileSync(join(f.directory, "result.json"));
    assert.equal(f.reconcile().state, "reconciled");
    assert.equal(f.reconcile().original_status, "failed");
    assert.deepEqual(f.generations.state().readers.map(row => row.owner), ["other"]);
    assert.deepEqual(readFileSync(join(f.directory, "result.json")), original);
    assert.equal(existsSync(join(f.directory, "reader-recovery.lock")), false);
  } finally { f.close(); }
});

test("public check recovery reports useful refusals and succeeds without a crash-prone outer lock", () => {
  const f = fixture();
  try {
    const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
    const invoke = () => spawnSync(process.execPath, [cli, "check-reconcile", "--run", f.id], {
      cwd: f.root, env: { ...process.env, XDG_STATE_HOME: f.state }, encoding: "utf8", timeout: 5000,
    });
    durableJson(join(f.commandDirectory, "result.json"), { ...f.receipt, cleanup: "unknown" });
    const refused = invoke();
    assert.equal(refused.status, 2, refused.stderr);
    assert.deepEqual(JSON.parse(refused.stdout), { state: "refused", run_id: f.id, reason: "Confirmed native command cleanup required" });
    assert.equal(f.generations.state().readers.length, 2);
    durableJson(join(f.commandDirectory, "result.json"), f.receipt);
    const succeeded = invoke();
    assert.equal(succeeded.status, 0, succeeded.stderr);
    assert.equal(JSON.parse(succeeded.stdout).original_status, "failed");
    assert.equal(invoke().status, 0);
    assert.equal(existsSync(join(f.directory, "reader-recovery.lock")), false);
    assert.deepEqual(f.generations.state().readers.map(row => row.owner), ["other"]);
  } finally { f.close(); }
});

test("check recovery refuses a live owner, unknown cleanup and missing command evidence", () => {
  const f = fixture();
  try {
    durableJson(join(f.directory, "run.json"), { ...f.intent, owner: { pid: process.pid, fingerprint: "stale" } });
    assert.throws(f.reconcile, /worker is present/);
    durableJson(join(f.directory, "run.json"), f.intent);
    durableJson(join(f.commandDirectory, "result.json"), { ...f.receipt, cleanup: "unknown" });
    assert.throws(f.reconcile, /Confirmed native command cleanup/);
    rmSync(f.commandDirectory, { recursive: true });
    assert.throws(f.reconcile, /evidence is missing/);
    assert.equal(f.generations.state().readers.length, 2);
    assert.equal(existsSync(join(f.directory, "reader-recovery.json")), false);
  } finally { f.close(); }
});

test("check recovery rejects mismatched identity before any release or recovery receipt", () => {
  const f = fixture();
  try {
    durableJson(join(f.directory, "dispatch.json"), { ...f.work, generation: { ...f.reader, token: f.other.token } });
    assert.throws(f.reconcile, /ownership mismatch/);
    assert.equal(existsSync(join(f.directory, "reader-recovery.json")), false);
    durableJson(join(f.directory, "dispatch.json"), f.work);
    durableJson(join(f.directory, "result.json"), { ...f.result, run_id: randomUUID() });
    assert.throws(f.reconcile, /binding differs/);
    durableJson(join(f.directory, "result.json"), f.result);
    durableJson(join(f.commandDirectory, "result.json"), { ...f.receipt, requestDigest: digest("other") });
    assert.throws(f.reconcile, /receipt identity/);
    assert.equal(f.generations.state().readers.length, 2);
  } finally { f.close(); }
});

test("incomplete checks and extra native work cannot be reconciled from a terminal-looking result", () => {
  const f = fixture();
  try {
    durableJson(join(f.directory, "result.json"), { ...f.result, results: [] });
    assert.throws(f.reconcile, /Unbound native command/);
    rmSync(join(f.directory, "result.json"));
    assert.throws(f.reconcile, /requires result.json/);
    assert.equal(f.generations.state().readers.length, 2);
  } finally { f.close(); }
});
