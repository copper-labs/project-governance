import test from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath, workContext } from "../../harness/src/store/location.ts";
import { digest, durableJson, fileDigest, object } from "../src/core.ts";
import { recordEntryExposure } from "../src/decision-episodes.ts";
import { captureReleaseEvaluation } from "../src/release-evaluation-capture.ts";
import { readReleaseEvaluation } from "../src/release-evaluation.ts";
import { contextStateRoot } from "../src/context-command.ts";
import { indexPromptEntry, observeContextHostUsage } from "../src/context-observations.ts";

const hash = `sha256:${"a".repeat(64)}`;
function fixture() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "evaluation-capture-"))), workspace = join(base, "checkout");
  const git = spawnSync("git", ["init", "-q", workspace], { encoding: "utf8" });
  assert.equal(git.status, 0, git.stderr);
  const write = (name: string, value: unknown) => { const path = join(base, name); durableJson(path, value); return { path, digest: fileDigest(path) }; };
  const db = defaultDbPath(workspace), owner = new Store(db), where = workContext(workspace);
  owner.workspace(where.locator, workspace);
  const task = owner.createTask("Deliver the selected documentation slice", [
    { kind: "scope", provenance: "operator", body: join(workspace, "docs") },
    { kind: "constraint", provenance: "operator", body: "Keep the coding model fixed" },
    { kind: "acceptance", provenance: "operator", body: "Required guidance remains available" },
  ], { worktree: workspace, branch: where.branch, session: "fixture-session", authorityRef: "operator:request" });
  const scope = { workspace, taskId: task.taskId, taskRevision: "1" };
  const exposure = recordEntryExposure(join(base, "receipts"), { scope, caller: "prompt-context", entryKind: "prompt-delivery",
    native: { entryId: "d".repeat(64), provider: "codex", session: "fixture-session", turn: "fixture-turn" },
    exposure: { configuredMode: "off", mode: "off", reason: "off", delivered: false }, decisions: [] });
  assert.equal(exposure.status, "recorded");
  if (exposure.status !== "recorded") throw new Error("Fixture exposure unavailable");
  const caller = exposure.episode, id = JSON.parse(readFileSync(caller.path, "utf8")).id as string;
  const entry: any = { id, scope, caller, decisions: [], native: [], labels: [], observations: {},
    taskLineage: { fromRevision: 1, throughRevision: 1 }, evaluation: { conditionId: "candidate", caseId: "documentation-slice", trialId: "one",
      inputDigest: hash, expectedLabelDigest: hash, lifecycle: "terminal", expected: [{ dimension: "whole-task", unitId: task.taskId, outcome: "accepted" }],
      evidence: [], providerJobs: [], usagePopulation: null } };
  const manifest: any = { version: 2, episodes: [entry], evaluation: { version: 1, metricContract: "release-evaluation-1", view: "field",
    suite: { version: "capture-fixture-1", digest: hash }, conditions: [{ id: "candidate", runtime: { version: "4.1-fixture", archiveDigest: hash },
      sourceDigest: hash, profileDigest: hash, questionDigest: hash, permissionsDigest: hash, environmentDigest: hash, budgetDigest: hash,
      model: "fixed-model", effort: "medium", cacheState: "unknown", arm: "field" }],
    population: { eligiblePrompts: null }, discovery: { scanComplete: null, projectionEvicted: null }, comparison: null } };
  const requestPath = join(base, "request.json"), output = join(base, "captured");
  const request = () => { durableJson(requestPath, manifest); return requestPath; };
  const accept = () => { const revision = owner.reviseTask(task.taskId, [], { status: "accepted", authorityRef: "operator:accepted-slice" }); entry.taskLineage.throughRevision = revision.version; return revision; };
  const provider = (id: string, taskId = task.taskId, usage?: unknown, providerKind = "codex") => {
    const directory = join(base, "jobs", id), request = { version: 1, id, provider: { kind: providerKind, model: "fixed-model" },
      decisionBinding: { task: { workspace, taskId, revision: "1" } } }, requestDigest = digest(request);
    const requestRef = write(`jobs/${id}/request.json`, request);
    const native = usage === undefined ? null : write(`jobs/${id}/provider-result.json`, { version: 1, requestDigest, usage, identity: null });
    const result = write(`jobs/${id}/result.json`, { version: 1, requestDigest, state: "failed", cleanup: "confirmed", durationMs: 20,
      ...(native ? { providerResult: native.path, providerResultDigest: native.digest } : {}) });
    return { directory, requestDigest, request: requestRef, result };
  };
  return { base, workspace, owner, db, task, caller, entry, manifest, requestPath, output, write, request, accept, provider,
    close: () => { owner.close(); rmSync(base, { recursive: true, force: true }); } };
}

test("capture freezes exact accepted owner revisions and keeps original hashes without probing or mutating the store", () => {
  const f = fixture(), fetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Capture must remain passive"); };
  try {
    f.accept(); const before = readFileSync(f.db), callerBefore = readFileSync(f.caller.path);
    const result = captureReleaseEvaluation(f.workspace, f.request(), f.output);
    assert.equal(result.status, "captured"); assert.equal(result.taskRevisions, 2); assert.equal(result.evaluation.accepted, 1);
    assert.equal(result.originalsRequired, true); assert.equal(calls, 0);
    assert.deepEqual(readFileSync(f.db), before); assert.deepEqual(readFileSync(f.caller.path), callerBefore);
    const captured = JSON.parse(readFileSync(result.manifest.path, "utf8"));
    assert.deepEqual(captured.episodes[0].caller, f.caller);
    const taskRefs = captured.episodes[0].evaluation.evidence.filter((ref: any) => ref.kind === "task");
    const accepted = JSON.parse(readFileSync(taskRefs[1].path, "utf8"));
    assert.equal(accepted.task.status, "accepted"); assert.equal(accepted.revisionEvent.detail.authorityRef, "operator:accepted-slice");
    assert.equal(fileDigest(taskRefs[1].path), taskRefs[1].digest);
    const report = readReleaseEvaluation(f.base, result.manifest.path);
    assert.equal(report.episodes[0]!.acceptance, "accepted");
    assert.equal(report.episodes[0]!.generation, "unknown", "Source execution never borrows a declared archive identity");
    assert.equal(report.efficiencyComparison.medianSavingsFraction, null); assert.equal(report.allArmSpending.knownSubtotalTokens, null);
    assert.throws(() => captureReleaseEvaluation(f.workspace, f.requestPath, f.output), /new directory outside/);
    assert.equal(fileDigest(result.manifest.path), result.manifest.digest, "An existing immutable capture remains unchanged");
  } finally { globalThis.fetch = fetch; f.close(); }
});

test("a real reopened revision outweighs an advisory accepted label", () => {
  const f = fixture();
  try {
    f.accept(); const reopened = f.owner.reviseTask(f.task.taskId, [], { status: "open", authorityRef: "operator:reopen" });
    f.entry.taskLineage.throughRevision = reopened.version;
    f.entry.labels = [{ reviewer: "operator", disposition: "accepted", at: "2026-10-05T00:00:00Z" }];
    const result = captureReleaseEvaluation(f.workspace, f.request(), f.output);
    assert.equal(result.taskRevisions, 3); assert.equal(result.evaluation.accepted, 0); assert.equal(result.evaluation.reopened, 1);
    assert.equal(readReleaseEvaluation(f.base, result.manifest.path).episodes[0]!.acceptance, "reopened");
  } finally { f.close(); }
});

test("capture cannot use a missing caller to qualify a declared task lineage", () => {
  const f = fixture();
  try {
    rmSync(f.caller.path);
    assert.throws(() => captureReleaseEvaluation(f.workspace, f.request(), f.output), /require the selected original caller/);
    assert.equal(existsSync(f.output), false);
  } finally { f.close(); }
});

test("capture refuses missing lineage, forged task references and an outdated terminal revision", () => {
  const f = fixture(), readTask = Store.prototype.readTask;
  try {
    f.accept();
    Store.prototype.readTask = function(id, version) { return id === f.task.taskId && version === 1 ? null : readTask.call(this, id, version); };
    assert.throws(() => captureReleaseEvaluation(f.workspace, f.request(), f.output), /lineage missing/);
    Store.prototype.readTask = readTask;
    f.entry.evaluation.evidence = [{ kind: "task", ...f.write("invented-task.json", { ...f.task, status: "accepted" }) }];
    assert.throws(() => captureReleaseEvaluation(f.workspace, f.request(), f.output), /explicit canonical taskLineage/);
    f.entry.evaluation.evidence = []; f.entry.taskLineage.throughRevision = 1;
    assert.throws(() => captureReleaseEvaluation(f.workspace, f.request(), f.output), /current exact owner revision/);
    assert.equal(existsSync(f.output), false);
  } finally { Store.prototype.readTask = readTask; f.close(); }
});

test("accepted capture retains original authority and rejects provenance changes or tip races", () => {
  const f = fixture(), event = Store.prototype.taskRevisionEvent, readTask = Store.prototype.readTask;
  try {
    f.accept();
    Store.prototype.taskRevisionEvent = function(id, version) { const value = event.call(this, id, version); return value && version === 2 ? { ...value, detail: { ...object(value.detail), authorityRef: null } } : value; };
    assert.throws(() => captureReleaseEvaluation(f.workspace, f.request(), f.output), /original acceptance authority/);
    Store.prototype.taskRevisionEvent = event;
    let tips = 0;
    Store.prototype.readTask = function(id, version) {
      if (id === f.task.taskId && version === undefined && ++tips === 2) f.owner.reviseTask(id, [], { status: "open", authorityRef: "operator:concurrent-reopen" });
      return readTask.call(this, id, version);
    };
    assert.throws(() => captureReleaseEvaluation(f.workspace, f.request(), f.output), /revision changed during capture/);
    assert.equal(existsSync(join(f.output, "manifest.json")), false);
  } finally { Store.prototype.taskRevisionEvent = event; Store.prototype.readTask = readTask; f.close(); }
});

test("hash mismatch and schema errors cannot publish a final capture", () => {
  const f = fixture();
  try {
    f.accept(); appendFileSync(f.caller.path, "\n");
    assert.throws(() => captureReleaseEvaluation(f.workspace, f.request(), f.output), /digest mismatch/);
    f.entry.caller = { path: f.caller.path, digest: fileDigest(f.caller.path) };
    f.manifest.evaluation.metricContract = "invented-contract";
    assert.throws(() => captureReleaseEvaluation(f.workspace, f.request(), f.output), /Unsupported release evaluation/);
    assert.equal(existsSync(join(f.output, "manifest.json")), false);
  } finally { f.close(); }
});

test("selected provider jobs require an exact task lineage and cannot silently charge unrelated work", () => {
  const f = fixture();
  try {
    f.accept(); f.entry.evaluation.providerJobs = [f.provider("foreign", "another-task")];
    assert.throws(() => captureReleaseEvaluation(f.workspace, f.request(), f.output), /not linked to this captured task lineage/);
    const job = f.provider("unbound"), request = JSON.parse(readFileSync(job.request.path, "utf8")); delete request.decisionBinding;
    durableJson(job.request.path, request); job.request.digest = fileDigest(job.request.path); job.requestDigest = digest(request);
    f.entry.evaluation.providerJobs = [job];
    assert.throws(() => captureReleaseEvaluation(f.workspace, f.request(), f.output), /not linked to this captured task lineage/);
    assert.equal(existsSync(f.output), false);
  } finally { f.close(); }
});

test("failed linked provider calls remain selected while partial usage and missing originals stay unknown", () => {
  const f = fixture();
  try {
    f.accept(); const job = f.provider("partial", f.task.taskId, { last: { inputTokens: 30, outputTokens: 5 } });
    f.entry.evaluation.providerJobs = [job];
    f.entry.evaluation.evidence = [{ kind: "usage", path: join(f.base, "missing-usage.json"), digest: hash }];
    const result = captureReleaseEvaluation(f.workspace, f.request(), f.output), report = readReleaseEvaluation(f.base, result.manifest.path);
    assert.equal(result.unavailableOriginals, 1); assert.equal(report.episodes[0]!.acceptance, "accepted");
    assert.equal(report.allArmSpending.knownSubtotalTokens, null); assert.equal(report.allArmSpending.unknownTokenMeasurements, 1);
    assert.equal(report.conditions[0]!.usageCompleteEpisodes, 0);
    assert.equal(report.issues.some(issue => issue.code === "evidence-unavailable"), true);
    const captured = JSON.parse(readFileSync(result.manifest.path, "utf8"));
    assert.deepEqual(captured.episodes[0].evaluation.providerJobs[0], job);
    assert.equal(report.efficiencyComparison.medianSavingsFraction, null);
    rmSync(f.caller.path);
    const absent = readReleaseEvaluation(f.base, result.manifest.path);
    assert.equal(absent.episodes[0]!.acceptance, "unknown", "Later reports still require the explicitly retained originals");
  } finally { f.close(); }
});

test("aggregate provider usage is captured once without adding per-model diagnostics", () => {
  const f = fixture();
  try {
    f.accept(); const job = f.provider("review", f.task.taskId, { usage: { input_tokens: 100, cache_read_input_tokens: 30, cache_creation_input_tokens: 10, output_tokens: 20 },
      models: { "fixed-model": { inputTokens: 90, outputTokens: 18 }, "utility-model": { inputTokens: 10, outputTokens: 2 } } }, "claude");
    f.entry.evaluation.providerJobs = [job, job];
    const result = captureReleaseEvaluation(f.workspace, f.request(), f.output), report = readReleaseEvaluation(f.base, result.manifest.path);
    assert.equal(report.allArmSpending.knownSubtotalTokens, 160); assert.equal(report.allArmSpending.measurements, 1);
    assert.equal(report.allArmSpending.duplicates, 1); assert.deepEqual(report.modelObservations[0]!.reportedModels, ["fixed-model", "utility-model"]);
  } finally { f.close(); }
});

test("capture confines output to a new external directory and never scans other tasks", () => {
  const f = fixture();
  try {
    f.accept(); f.owner.createTask("Unrelated private task", [], { worktree: f.workspace, session: "different-session" });
    assert.throws(() => captureReleaseEvaluation(f.workspace, f.request(), join(f.workspace, "capture")), /outside the checkout/);
    const result = captureReleaseEvaluation(f.workspace, f.request(), f.output);
    assert.equal(result.taskRevisions, 2);
    assert.equal(readFileSync(result.manifest.path, "utf8").includes("Unrelated private task"), false);
    assert.equal(result.originalReferences, 1);
  } finally { f.close(); }
});

test("selected check completion retains the original run and narrow outcome link", () => {
  const f = fixture();
  try {
    f.accept();
    const native = { kind: "check", ...f.write("native-check.json", { version: 1, scope: f.entry.scope, run_id: "check-native", result_digest: hash,
      status: "passed", duration_ms: 12 }) };
    const capture = recordEntryExposure(join(f.base, "check-receipts"), { scope: f.entry.scope, caller: "check-completion", entryKind: "check-completion",
      native: { runId: "check-native", resultDigest: hash, resultFileDigest: hash },
      exposure: { reason: "off", delivered: false }, decisions: [] });
    assert.equal(capture.status, "recorded"); if (capture.status !== "recorded") throw new Error("Fixture check exposure unavailable");
    f.entry.id = JSON.parse(readFileSync(capture.episode.path, "utf8")).id; f.entry.caller = capture.episode; f.entry.native = [native];
    f.entry.evaluation.expected.push({ dimension: "checks", unitId: "check-native", outcome: "passed" });
    const result = captureReleaseEvaluation(f.workspace, f.request(), f.output), report = readReleaseEvaluation(f.base, result.manifest.path);
    assert.equal(report.episodes[0]!.acceptance, "accepted");
    assert.equal(report.dimensions.find(row => row.dimension === "checks")!.successes, 1);
    assert.equal(report.execution.knownSummedProcessMs, 12);
    assert.deepEqual(JSON.parse(readFileSync(result.manifest.path, "utf8")).episodes[0].native[0], native);
  } finally { f.close(); }
});

test("a refused before-launch consultation has no invented usage or task acceptance", () => {
  const f = fixture();
  try {
    const directory = join(f.base, "never-launched-job");
    f.entry.evaluation.providerJobs = [{ directory, requestDigest: hash,
      request: { path: join(directory, "request.json"), digest: hash }, result: { path: join(directory, "result.json"), digest: hash } }];
    f.entry.evaluation.usagePopulation = [];
    const result = captureReleaseEvaluation(f.workspace, f.request(), f.output), report = readReleaseEvaluation(f.base, result.manifest.path);
    assert.equal(result.unavailableOriginals, 2); assert.equal(report.episodes[0]!.acceptance, "unknown");
    assert.equal(report.episodes[0]!.costCaptureUnknown, true); assert.equal(report.episodes[0]!.usageComplete, false);
    assert.equal(report.allArmSpending.knownSubtotalTokens, null); assert.equal(report.efficiencyComparison.medianSavingsFraction, null);
    assert.equal(report.issues.some(issue => issue.code === "provider-artifact-unavailable"), true);
  } finally { f.close(); }
});

test("normal capture CLI uses the selected checkout and requires explicit request and external output", () => {
  const f = fixture();
  try {
    f.accept(); const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
    const result = spawnSync(process.execPath, [cli, "release-evaluation", "capture", "--request", f.request(), "--output-directory", f.output],
      { cwd: f.workspace, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).evaluation.accepted, 1);
    const missing = spawnSync(process.execPath, [cli, "release-evaluation", "capture", "--request", f.requestPath], { cwd: f.workspace, encoding: "utf8" });
    assert.equal(missing.status, 2);
    assert.equal(JSON.parse(missing.stderr).status, "failed");
  } finally { f.close(); }
});

test("a collected ordinary cycle freezes accepted lineage and joins original response costs without asserting host coverage", () => {
  const f = fixture(), previous = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(f.base, "state");
  try {
    const entryId = "d".repeat(64), state = contextStateRoot(f.workspace), transcript = join(f.base, "native.jsonl");
    const prompt = f.write("prompt.json", { version: 1, entryId, workspace: f.workspace, worktreeLocator: workContext(f.workspace).locator,
      session: "fixture-session", turn: "fixture-turn", scopeKind: "bound-task", status: "prepared",
      binding: { taskId: f.task.taskId, revision: "1", status: "bound", source: "session" } });
    durableJson(join(state, "prompt-entries", `${entryId}.json`), JSON.parse(readFileSync(prompt.path, "utf8")));
    indexPromptEntry(f.workspace, entryId, "fixture-session", "fixture-turn");
    const response = (id: string, input: number, output: number) => JSON.stringify({ type: "token_usage_record", payload: {
      thread_id: "fixture-session", root_turn_id: "fixture-turn", response_id: id,
      usage: { input_tokens: input, output_tokens: output, cached_input_tokens: 10, reasoning_output_tokens: 2 },
      thread_token_usage: { input_tokens: 100000, output_tokens: 10000 },
    } }) + "\n";
    writeFileSync(transcript, response("investigate", 100, 20));
    const event = { session_id: "fixture-session", turn_id: "fixture-turn", transcript_path: transcript };
    assert.equal(observeContextHostUsage(f.workspace, event).cursor.state, "advanced");
    appendFileSync(transcript, response("verify", 50, 10));
    assert.equal(observeContextHostUsage(f.workspace, event).cursor.state, "advanced");
    const usages = readdirSync(join(state, "context-observations")).flatMap(name => {
      const path = join(state, "context-observations", name), record = JSON.parse(readFileSync(path, "utf8"));
      return record.kind === "usage" ? [{ kind: "usage", path, digest: fileDigest(path) }] : [];
    });
    f.entry.evaluation.evidence = [{ kind: "prompt-entry", ...prompt }, ...usages];
    f.entry.evaluation.usagePopulation = ["investigate", "verify"].map(id => `native-response:codex:${digest(["fixture-session", id])}`);
    f.accept(); const before = readFileSync(f.db), originalTask = f.owner.readTask(f.task.taskId), cursor = f.owner.latestCursor(f.task.taskId);
    const captured = captureReleaseEvaluation(f.workspace, f.request(), f.output), report = readReleaseEvaluation(state, captured.manifest.path);
    assert.equal(captured.taskRevisions, 2); assert.equal(report.episodes[0]!.acceptance, "accepted");
    assert.equal(report.allArmSpending.measurements, 2); assert.equal(report.allArmSpending.knownSubtotalTokens, 180);
    assert.equal(report.episodes[0]!.usageComplete, true);
    assert.equal(report.episodes[0]!.additionalReads, null); assert.equal(report.episodes[0]!.readCoverage, "unknown");
    assert.equal(report.population.eligiblePrompts, null); assert.equal(report.episodes[0]!.generation, "unknown");
    assert.equal(report.efficiencyComparison.medianSavingsFraction, null);
    assert.deepEqual(readFileSync(f.db), before, "Manifest capture never mutates task acceptance or execution");
    assert.deepEqual(f.owner.readTask(f.task.taskId), originalTask); assert.equal(f.owner.latestCursor(f.task.taskId), cursor);
    const selected = JSON.parse(readFileSync(captured.manifest.path, "utf8")).episodes[0].evaluation.evidence;
    for (const usage of usages) assert.equal(selected.some((reference: any) => reference.path === usage.path && reference.digest === usage.digest), true);
  } finally {
    if (previous === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previous;
    f.close();
  }
});
