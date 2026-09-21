import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digest, durableJson, fileDigest } from "../src/core.ts";
import { decisionTelemetryCommand, parseDecisionTelemetryArgs } from "../src/decision-history.ts";

test("history classification is explicit, reuses its closed scope, and cannot mint an analysis task", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "decision-history-")));
  const oldState = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  t.after(() => { if (oldState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = oldState; rmSync(root, { recursive: true, force: true }); });
  durableJson(join(root, "config/governance/profile.yaml"), { continuity: { decisions: {
    mode: "auto", allowed_data_classes: ["diagnostic"], consumers: { DL12: { mode: "auto" } },
  } } });
  const scope = { workspace: root, taskId: "task", taskRevision: "1" }, callerPath = join(root, "caller.json");
  durableJson(callerPath, { version: 1, id: "episode", scope, native: { runId: "run", runDigest: digest("run"), stagesDigest: digest([]), eventsDigest: digest([]) }, decisions: [], exposure: { mode: "off" } });
  const excerptPath = join(root, "excerpt.json"); durableJson(excerptPath, { text: "Read source, then verified the regression test." });
  const hash = fileDigest(excerptPath), manifestPath = join(root, "manifest.json");
  const manifest = { version: 2, episodes: [{ id: "episode", scope, decisions: [], caller: { path: callerPath, digest: fileDigest(callerPath) } }],
    analysis: { inputDigest: digest({ excerpts: [hash], procedures: [] }), excerpts: [{ episodeId: "episode", path: excerptPath, digest: hash }] } };
  durableJson(manifestPath, manifest);
  let calls = 0;
  const options = { token: "test-only", fetch: (async (_url, init) => {
    calls++;
    const payload = JSON.parse(String(init?.body)), keys = Object.keys(payload.questions["work-class"].criteria);
    return Response.json({ model: payload.model, answers: { "work-class": { type: "choice", choice: "mixed", confidence: 1,
      probabilities: Object.fromEntries(keys.map(key => [key, key === "mixed" ? 1 : 0])) } } });
  }) as typeof fetch };
  const plain = await decisionTelemetryCommand(["--outcomes-manifest", manifestPath], root, options);
  assert.equal("history" in plain, false); assert.equal(calls, 0);
  const args = ["--outcomes-manifest", manifestPath, "--classify-history"];
  const first = await decisionTelemetryCommand(args, root, options) as any;
  assert.equal(first.history.samples[0].workClass, "mixed"); assert.equal(first.history.scopeClosed, true);
  const repeated = await decisionTelemetryCommand(args, root, options) as any;
  assert.equal(repeated.history.samples[0].workClass, "mixed"); assert.equal(calls, 1);
  assert.equal(repeated.history.budget.calls, 1);
  durableJson(manifestPath, { ...manifest, analysis: { ...manifest.analysis, taskId: "fresh-allowance" } });
  await assert.rejects(decisionTelemetryCommand(args, root, options), /identity differs/);
  assert.equal(calls, 1);
  assert.equal(parseDecisionTelemetryArgs([`--outcomes-manifest=${manifestPath}`, "--classify-history"])["classify-history"], true);
  assert.throws(() => parseDecisionTelemetryArgs(["--classify-history=false"]));
});

test("history retains unknown and missing classifications and ranks measured native cost", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "history-coverage-"))), oldState = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  t.after(() => { if (oldState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = oldState; rmSync(root, { recursive: true, force: true }); });
  durableJson(join(root, "config/governance/profile.yaml"), { continuity: { decisions: { mode: "auto", allowed_data_classes: ["diagnostic"], consumers: { DL12: { mode: "auto" } } } } });
  const scope = { workspace: root, taskId: "task", taskRevision: "1" };
  const nativePath = join(root, "native.json");
  durableJson(nativePath, { version: 1, state: "failed", cleanup: "confirmed", requestDigest: digest("command"), durationMs: 41 });
  const ids = ["mixed", "unknown", "missing", "source", "unjoined"];
  const episodes = ids.slice(0, 4).map(id => {
    const path = join(root, `${id}-caller.json`);
    durableJson(path, { version: 1, id, scope, native: { runId: "run", runDigest: digest("run"), stagesDigest: digest([]), eventsDigest: digest([]) }, decisions: [] });
    return { id, scope, decisions: [], caller: { path, digest: fileDigest(path) },
      native: [{ kind: "command", path: nativePath, digest: fileDigest(nativePath) }], observations: { llmInputTokens: 100 } };
  });
  const excerpts = ids.map(episodeId => {
    const path = join(root, `${episodeId}-excerpt.json`); durableJson(path, { text: `Selected ${episodeId} episode.` });
    const hash = fileDigest(path); if (episodeId === "missing") rmSync(path);
    return { episodeId, path, digest: hash, ...(episodeId === "source" ? { sourcePaths: ["src/private.ts"] } : {}) };
  });
  const manifest = join(root, "manifest.json");
  durableJson(manifest, { version: 2, episodes, analysis: { inputDigest: digest({ excerpts: excerpts.map(item => item.digest).sort(), procedures: [] }), excerpts } });
  let calls = 0;
  const report = await decisionTelemetryCommand(["--outcomes-manifest", manifest, "--classify-history"], root, { token: "fixture", fetch: async (_url, init) => {
    const payload = JSON.parse(String(init?.body)), keys = Object.keys(payload.questions["work-class"].criteria), choice = calls++ === 0 ? "mixed" : "unknown";
    return Response.json({ model: payload.model, answers: { "work-class": { type: "choice", choice, confidence: 1,
      probabilities: Object.fromEntries(keys.map(key => [key, key === choice ? 1 : 0])) } } });
  } }) as any;
  assert.equal(calls, 2); assert.deepEqual(report.history.counts, { selected: 5, classified: 1 });
  assert.deepEqual(report.history.unclassified, { unknown: 1, "excerpt-unavailable": 1, "source-scope-disabled": 1, "episode-unjoined": 1 });
  assert.equal(report.history.rankedClasses[0].knownNativeDurationMs, 41);
  assert.deepEqual(report.history.rankedClasses[0].representativeEpisodeIds, ["mixed"]);
  assert.equal(report.history.rankedClasses[0].llmInputTokens.total, 100);
  assert.equal(report.history.rankedClasses[0].llmOutputTokens.total, null);
  assert.deepEqual(report.history.rankedByKnownNativeCost, ["mixed"]);
});
