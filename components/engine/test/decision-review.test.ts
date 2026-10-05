import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { captureReviewEvidence, reviewAdvice, type ReviewCapture } from "../src/decision-review.ts";
import { DecisionRuntime } from "../src/decision-runtime.ts";
import { profileDecisionSettings } from "../src/decision-settings.ts";
import { digest } from "../src/core.ts";
import { ValidationSubject, resolveChangeScope } from "../src/change-subject.ts";
import { SOURCE_CAPTURE_MAX_BYTES } from "../src/source-capture-limits.ts";

test("legitimate changes produce no invented concern and unknown answers remain unassessed", async t => {
  const root = mkdtempSync(join(tmpdir(), "review-advice-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["**"],
    consumers: { DL01: { mode: "auto" }, DL02: { mode: "auto" } } } } });
  let unknown = false, uncertain = false;
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "fixture", fetch: async (_url, init) => {
    const payload = JSON.parse(String(init?.body));
    return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(Object.keys(payload.questions).map((name, index) =>
      [name, unknown ? { type: "noul", noul: null } : { type: "noul", noul: uncertain ? 0.5 : index === 0 || index === 3 ? 0.95 : 0.05 }])) });
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
  const unknownAdvice = await run("unknown");
  assert.ok(unknownAdvice.consumers.every(item => !item.delivered && item.findings.length === 0));
  unknown = false; uncertain = true;
  const uncertainAdvice = await run("uncertain");
  assert.ok(uncertainAdvice.consumers.every(item => item.delivered && item.findings.length === 0));
  assert.ok(uncertainAdvice.consumers.every(item => item.assessments.every(row => row.interpretation === "uncertain")));
  assert.ok(uncertainAdvice.consumers.every(item => /uncertain/u.test(item.summary)));
});


test("unsupported inputs and missing setup are explicit without inventing test knowledge", () => {
  const subject = { hunks: () => { throw new Error("Unsupported input must not be read"); } } as any;
  const scope = { records: [{ path: "native_test.java", status: "modified" }], base_ref: null, subject_digest: "fixture" } as any;
  const capture = captureReviewEvidence(subject, scope, { purpose: "Unavailable", purposeSource: "unavailable" });
  assert.deepEqual(capture.hunks, []); assert.deepEqual(capture.coverage.omitted, ["native_test.java"]);
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
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "fixture", fetch: async (_url, init) => {
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
  const subject = { source: () => ({ file_type: "regular" }), read: () => Buffer.from(source), hunks: () => `+${source}` } as any;
  const capture = captureReviewEvidence(subject, { records: [{ path: "parser.test.ts", status: "modified" }], base_ref: "base", subject_digest: digest(source) } as any,
    { purpose: "Handle empty and malformed input", purposeSource: "bound-task-context", includeSource: true });
  assert.equal(capture.hunks[0]!.source?.complete, true);
  const advice = await reviewAdvice(runtime, capture, { workspace: root, taskId: "task", taskRevision: "1" },
    { eventId: "requirement", policyDigest: "policy", environment: "fixture", revision: "1" });
  assert.equal(calls, 1);
  assert.equal(advice.consumers[0]!.findings[0]?.classification, "partial");
  assert.equal(advice.consumers[1]!.findings.length, 0);
  assert.equal(advice.consumers[1]!.assessed, 1); assert.equal(advice.consumers[1]!.answered, 1); assert.equal(advice.consumers[1]!.usable, 0);
  assert.deepEqual(advice.consumers[1]!.assessments.map(item => [item.status, item.interpretation]), [["unknown", "unknown"]]);
  assert.match(advice.consumers[1]!.summary, /1 unknown/u);
  assert.equal(advice.decisions.length, 1, "compatible consumers share one charged request");
  const missing = await reviewAdvice(runtime, { ...capture, purposeSource: "unavailable" }, { workspace: root, taskId: "task", taskRevision: "1" },
    { eventId: "missing", policyDigest: "policy", environment: "fixture", revision: "1" });
  assert.equal(calls, 1); assert.ok(missing.consumers.every(item => !item.delivered));
});

test("mixed-stack staged review captures exact accepted source and conventional tests", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "native-review-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  const files = [
    ["src/Feature.kt", "fun feature() = 1"], ["src/Feature.swift", "func feature() -> Int { 1 }"], ["src/feature.py", "def feature(): return 1"], ["src/feature.ts", "export const feature = 1;"],
    ["src/commonTest/kotlin/Behavior.kt", "@Test fun rejects() { assertEquals(1, feature()) }"],
    ["Tests/FeatureTests/Behavior.swift", "func testRejects() { XCTAssertEqual(feature(), 1) }"],
    ["tests/test_feature.py", "def test_feature(): assert feature() == 1"], ["src/feature.test.ts", "test('feature', () => assert.equal(feature(), 1));"],
  ];
  for (const [path, source] of files) { mkdirSync(dirname(join(root, path!)), { recursive: true }); writeFileSync(join(root, path!), `${source}\n`); }
  git("add", "."); git("commit", "-qm", "base");
  for (const [path, source] of files) writeFileSync(join(root, path!), `${source!.replaceAll("1", "2")}\n`);
  git("add", ".");
  const scope = resolveChangeScope(root, { staged: true }), subject = new ValidationSubject(root, scope);
  for (const [path] of files) writeFileSync(join(root, path!), "unstaged replacement\n");
  const capture = captureReviewEvidence(subject, scope, { purpose: "Change feature from 1 to 2", purposeSource: "explicit-invocation", includeSource: true });
  assert.equal(capture.hunks.length, 8); assert.equal(capture.changedPaths, 8); assert.equal(capture.subjectDigest, scope.subject_digest);
  assert.equal(capture.hunks.filter(item => item.kind === "test").length, 4);
  assert.deepEqual(capture.coverage.omitted, []); assert.deepEqual(capture.coverage.unavailable, []);
  for (const hunk of capture.hunks) {
    assert.equal(hunk.source?.complete, true); assert.match(hunk.source!.text, /2/u); assert.doesNotMatch(hunk.diff, /unstaged replacement/u);
    assert.equal(hunk.source!.digest, `sha256:${createHash("sha256").update(hunk.source!.text).digest("hex")}`);
  }
  writeFileSync(join(root, "src/feature.py"), "def feature(): return 3\n"); git("add", "src/feature.py");
  const drifted = captureReviewEvidence(subject, scope, { purpose: "Change feature from 1 to 2", purposeSource: "explicit-invocation" });
  assert.ok(drifted.coverage.unavailable.includes("src/feature.py"));
  assert.ok(!drifted.capturePaths.includes("src/feature.py"));
  assert.ok(drifted.coverage.limits.some(item => item.includes("stale")));
});

test("unsupported, generated, binary and nonordinary inputs retain explicit exclusions", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "review-exclusions-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q"); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "base");
  mkdirSync(join(root, "generated")); mkdirSync(join(root, "tests/helpers"), { recursive: true });
  writeFileSync(join(root, "unknown.java"), "class Unknown {}\n"); writeFileSync(join(root, "binary.kt"), "fun binary() {}\0payload\n");
  writeFileSync(join(root, "generated/BehaviorTest.kt"), "@Test fun generated() {}\n");
  writeFileSync(join(root, "tests/helpers/data.py"), "value = 1\n"); symlinkSync("unknown.java", join(root, "linked.py"));
  git("add", ".");
  const scope = resolveChangeScope(root, { staged: true }), capture = captureReviewEvidence(new ValidationSubject(root, scope), scope,
    { purpose: "Review source", purposeSource: "explicit-invocation", includeSource: true });
  assert.deepEqual(capture.capturePaths, ["tests/helpers/data.py"]); assert.equal(capture.hunks[0]!.kind, "source");
  assert.equal(capture.changedPaths, 5);
  assert.deepEqual(capture.coverage.omitted, ["binary.kt", "generated/BehaviorTest.kt", "linked.py", "unknown.java"]);
  for (const word of ["binary", "generated", "nonordinary", "JS/TS"]) assert.ok(capture.coverage.limits.some(item => item.includes(word)), word);
  const invalid = captureReviewEvidence({ source: () => ({ file_type: "regular" }), read: () => Buffer.from([0xff]), hunks: () => { throw new Error("must not read invalid text diff"); } } as any,
    { ...scope, records: [{ path: "invalid.swift", status: "added" }] } as any, { purpose: "Review source", purposeSource: "explicit-invocation" });
  assert.deepEqual(invalid.coverage.omitted, ["invalid.swift"]); assert.ok(invalid.coverage.limits.some(item => item.includes("not UTF-8")));
});

test("local source allowance stays distinct from bounded incomplete provider excerpts", () => {
  const source = "// supporting detail\n".repeat(60_000) + "fun feature() = 2\n";
  let readLimit = 0;
  const subject = { source: () => ({ file_type: "regular" }), read: (_path: string, limit: number) => { readLimit = limit; return Buffer.from(source); },
    hunks: () => "-fun feature() = 1\n+fun feature() = 2\n" } as any;
  const capture = captureReviewEvidence(subject, { records: [{ path: "Feature.kt", status: "modified" }], base_ref: "base", subject_digest: "fixture" } as any,
    { purpose: "Change feature from 1 to 2", purposeSource: "explicit-invocation", includeSource: true });
  assert.ok(Buffer.byteLength(source) > 1024 * 1024); assert.equal(readLimit, SOURCE_CAPTURE_MAX_BYTES);
  assert.equal(capture.hunks.length, 1); assert.equal(capture.hunks[0]!.source?.complete, false); assert.equal(capture.coverage.truncated, true);
  assert.ok(capture.coverage.limits.some(item => item.includes("source/setup excerpt incomplete")));
});
