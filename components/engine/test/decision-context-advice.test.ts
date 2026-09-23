import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contextAdvice } from "../src/decision-context-advice.ts";
import { DecisionRuntime } from "../src/decision-runtime.ts";
import { profileDecisionSettings } from "../src/decision-settings.ts";
import { digest } from "../src/core.ts";

test("partial relevance answers reorder only assessed slots", async t => {
  const root = mkdtempSync(join(tmpdir(), "context-advice-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["src/**"], consumers: { DL03: { mode: "auto" } } } } });
  const runtime = new DecisionRuntime(settings, root, { token: "test-only", fetch: async () => Response.json({
    model: settings.legacy.model, answers: { q1: { type: "noul", noul: 0.1 }, q3: { type: "noul", noul: 0.9 } },
  }) });
  const candidates = ["a", "b", "c"].map(name => ({ id: `src/${name}.ts`, excerpt: "same content", sourceDigest: digest("same content") }));
  const result = await contextAdvice(runtime, candidates, { workspace: root, taskId: "task", taskRevision: "r1" }, {
    purpose: "find source", eventId: "event", policyDigest: digest("policy"), environment: "test", revision: "r1", subjectDigest: digest("subject"), excerptBytes: 8192,
  });
  assert.deepEqual(result.baselineOrder, ["src/a.ts", "src/b.ts", "src/c.ts"]);
  assert.deepEqual(result.unassessed, ["src/b.ts"]);
  assert.equal(result.order[1], "src/b.ts");
  assert.equal(result.delivered, true);
  const longText = "source line with useful detail\n".repeat(500);
  const full = await contextAdvice(runtime, candidates.map(candidate => ({ ...candidate, excerpt: longText, sourceDigest: digest(longText) })),
    { workspace: root, taskId: "task", taskRevision: "r1" }, {
      purpose: "find source", eventId: "full-size", policyDigest: digest("policy"), environment: "test", revision: "r1", subjectDigest: digest("subject"), excerptBytes: 8192,
    });
  assert.equal(full.delivered, true, "full-sized excerpts must leave room for the wire envelope");
  let sentQuestions = 0;
  const boundedRuntime = new DecisionRuntime(settings, root, { token: "test-only", fetch: async (_url, init) => {
    const payload = JSON.parse(String(init?.body));
    sentQuestions = Object.keys(payload.questions).length;
    return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(Object.keys(payload.questions).map(key => [key, { type: "noul", noul: 0.8 }])) });
  } });
  const run = (inputs: typeof candidates, eventId: string, excerptBytes = 8192) => contextAdvice(boundedRuntime, inputs,
    { workspace: root, taskId: "task", taskRevision: "r1" }, { purpose: "find source", eventId,
      policyDigest: digest("policy"), environment: "test", revision: "r1", subjectDigest: digest("subject"), excerptBytes });
  const mixed = await run([{ ...candidates[0]!, excerpt: "x".repeat(9000) }, ...candidates.slice(1)], "long-line");
  assert.equal(mixed.delivered, true);
  assert.equal(sentQuestions, 2);
  assert.ok(mixed.coverage.omitted.includes("src/a.ts"));
  const many = await run(Array.from({ length: 40 }, (_, index) => ({ id: `src/${index}.ts`, excerpt: "content", sourceDigest: digest("content") })), "many");
  assert.equal(many.delivered, true);
  assert.equal(sentQuestions, 16);
  assert.equal(many.unassessed.length, 24);
  const ranged = { ...candidates[0]!, excerpt: longText.slice(0, 4096), sourceRange: {
    firstLine: 1, lastLine: 140, totalLines: 500, excerptDigest: digest(longText.slice(0, 4096)), complete: false as const,
  } };
  const prebounded = await run([ranged, ...candidates.slice(1)], "prebounded");
  assert.equal(prebounded.delivered, true);
  assert.equal(sentQuestions, 2);
  assert.ok(prebounded.unassessed.includes("src/a.ts"));
  const small = await run(Array.from({ length: 16 }, (_, index) => ({ id: `src/${index}.ts`, excerpt: longText, sourceDigest: digest(longText) })), "small-budget", 1024);
  assert.equal(small.delivered, true);
  assert.equal(sentQuestions, 7);
});

test("expanded relevance stays within the evidence-item ceiling at max_candidates 64", async t => {
  const root = mkdtempSync(join(tmpdir(), "context-advice-limit-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", max_candidates: 64,
    evidence_bytes: 32768, allowed_data_classes: ["source"], allowed_source_paths: ["src/**"],
    consumers: { DL03: { mode: "auto" } } } } });
  let calls = 0;
  const runtime = new DecisionRuntime(settings, root, { token: "fixture", fetch: async (_url, init) => {
    calls++;
    const wire = JSON.parse(String(init?.body));
    assert.equal(Object.keys(wire.questions).length, 63);
    assert.deepEqual(wire.state.coverage, { captured: 63, omitted: 1, unavailable: 0, truncated: true });
    return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(
      Object.keys(wire.questions).map(key => [key, { type: "noul", noul: 0.8 }])) });
  } });
  const candidates = Array.from({ length: 64 }, (_, index) => ({ id: `src/${String(index).padStart(2, "0")}.ts`,
    excerpt: `Reference ${index}\n`, sourceDigest: `source-${index}` }));
  const result = await contextAdvice(runtime, candidates, { workspace: root, taskId: "task", taskRevision: "r1" }, {
    purpose: "find source", eventId: "max-candidates", policyDigest: digest("policy"), environment: "test",
    revision: "r1", subjectDigest: digest("subject"), excerptBytes: 32768,
  });
  assert.equal(result.delivered, true);
  assert.equal(result.assessed.length, 63);
  assert.deepEqual(result.coverage.omitted, ["src/63.ts"]);
  assert.equal(calls, 1);
});
