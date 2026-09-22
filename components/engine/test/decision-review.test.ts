import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureReviewEvidence, reviewAdvice, type ReviewCapture } from "../src/decision-review.ts";
import { DecisionRuntime } from "../src/decision-runtime.ts";
import { profileDecisionSettings } from "../src/decision-settings.ts";
import { digest } from "../src/core.ts";

test("legitimate changes produce no invented concern and unknown answers remain unassessed", async t => {
  const root = mkdtempSync(join(tmpdir(), "review-advice-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["**"],
    consumers: { DL01: { mode: "auto" }, DL02: { mode: "auto" } } } } });
  let unknown = false;
  const runtime = new DecisionRuntime(settings, root, { token: "fixture", fetch: async (_url, init) => {
    const payload = JSON.parse(String(init?.body));
    return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(Object.keys(payload.questions).map((name, index) =>
      [name, unknown ? { type: "noul", noul: null } : { type: "noul", noul: index === 0 || index === 3 ? 0.95 : 0.05 }])) });
  } });
  const diff = "-assert.equal(actual, 1)\n+assert.equal(actual, 2)";
  const capture: ReviewCapture = { subjectDigest: digest(diff), baseRef: "base", purpose: "Expected value intentionally changed from1to2", purposeSource: "explicit-invocation",
    hunks: [{ id: "hunk:test", path: "example.test.ts", kind: "test", status: "modified", diff, diffDigest: digest(diff), bytes: Buffer.byteLength(diff) }], rules: [],
    capturePaths: ["example.test.ts"], coverage: { captured: 1, omitted: [], truncated: false, unavailable: [], limits: [] } };
  const run = (eventId: string) => reviewAdvice(runtime, capture, { workspace: root, taskId: "task", taskRevision: "1" },
    { eventId, policyDigest: "policy", environment: "fixture", revision: "1" });
  const clean = await run("legitimate");
  assert.equal(clean.batched, true); assert.ok(clean.consumers.every(item => item.delivered && item.findings.length === 0));
  unknown = true;
  const uncertain = await run("unknown");
  assert.ok(uncertain.consumers.every(item => !item.delivered && item.findings.length === 0));
});


test("unsupported inputs and missing setup are explicit without inventing test knowledge", () => {
  const subject = { hunks: () => { throw new Error("Unsupported input must not be read"); } } as any;
  const scope = { records: [{ path: "native_test.py", status: "modified" }], base_ref: null, subject_digest: "fixture" } as any;
  const capture = captureReviewEvidence(subject, scope, { purpose: "Unavailable", purposeSource: "unavailable" });
  assert.deepEqual(capture.hunks, []); assert.deepEqual(capture.coverage.omitted, ["native_test.py"]);
  assert.ok(capture.coverage.limits.some(item => item.includes("JS/TS")));
  assert.ok(capture.coverage.limits.some(item => item.includes("Task-specific intent is unavailable")));
  assert.ok(capture.coverage.limits.some(item => item.includes("not executed")));
});

test("opted-in requirement questions share captured setup and preserve unknown and partial support", async t => {
  const root = mkdtempSync(join(tmpdir(), "requirement-advice-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["**"], consumers: {
    DL01: { mode: "auto", questions: ["test.requirement-support/1"] }, DL02: { mode: "auto", questions: ["change.requirement-support/1"] },
  } } } });
  let calls = 0;
  const runtime = new DecisionRuntime(settings, root, { token: "fixture", fetch: async (_url, init) => {
    calls++;
    const payload = JSON.parse(String(init?.body));
    assert.equal(Object.keys(payload.questions).length, 2);
    assert.match(JSON.stringify(payload.questions), /Complete file/);
    return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(Object.entries(payload.questions).map(([name], index) => {
      const choice = index ? "unknown" : "partial";
      return [name, { type: "choice", choice, confidence: 0.95, probabilities: { supported: 0, partial: index ? 0 : 1, contradicted: 0, unknown: index ? 1 : 0 } }];
    })) });
  } });
  const source = "test('empty input', () => assert.equal(parse(''), null));";
  const subject = { read: () => Buffer.from(source), hunks: () => `+${source}` } as any;
  const capture = captureReviewEvidence(subject, { records: [{ path: "parser.test.ts", status: "modified" }], base_ref: "base", subject_digest: digest(source) } as any,
    { purpose: "Handle empty and malformed input", purposeSource: "bound-task-context", includeSource: true });
  assert.equal(capture.hunks[0]!.source?.complete, true);
  const advice = await reviewAdvice(runtime, capture, { workspace: root, taskId: "task", taskRevision: "1" },
    { eventId: "requirement", policyDigest: "policy", environment: "fixture", revision: "1" });
  assert.equal(calls, 1);
  assert.equal(advice.consumers[0]!.findings[0]?.classification, "partial");
  assert.equal(advice.consumers[1]!.findings.length, 0);
  assert.equal(advice.decisions.length, 1, "compatible consumers share one charged request");
  const missing = await reviewAdvice(runtime, { ...capture, purposeSource: "unavailable" }, { workspace: root, taskId: "task", taskRevision: "1" },
    { eventId: "missing", policyDigest: "policy", environment: "fixture", revision: "1" });
  assert.equal(calls, 1); assert.ok(missing.consumers.every(item => !item.delivered));
});
