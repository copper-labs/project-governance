import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { digest } from "../src/core.ts";
import { packLongLog, logFilterQuestions, applyLogFilterAdvice, renderLogSelection } from "../src/decision-log-filter.ts";
import { outputSelection } from "../src/decision-output-advice.ts";
import { DecisionRuntime } from "../src/decision-runtime.ts";
import { profileDecisionSettings } from "../src/decision-settings.ts";
import { qualitySourceDigest } from "../src/context-evaluation-quality.ts";
import type { CommandReceipt } from "../src/process-owner.ts";

// The revision mismatch is independently labelled useful; DEBUG syntax alone cannot express that.
const content = ["Command started", ...Array.from({ length: 30 }, (_unused, index) => index === 0
  ? `DEBUG bound revision=previous; requested revision=current ${".".repeat(160)}` : `DEBUG detail ${index} ${".".repeat(160)}`),
  "ERROR: required fault identity", "  at owningFunction()", "  at caller()", "Substantive cause: the recorded owner differs from the requested owner",
  "Result: 2 passed, 1 failed", "Cleanup unknown: owned process still needs reconciliation", "Command finished"].join("\n\n") + "\n";
const deterministicPilot = { purpose: "long-log-filtering" as const, arm: "deterministic" as const };
const jevPilot = { purpose: "long-log-filtering" as const, arm: "jev" as const };

test("the narrow deterministic log pack retains failures, full continuations, results, cleanup and source identities", () => {
  const plan = packLongLog(content, { failed: true, cleanupUnknown: true, truncated: false, limitBytes: 16_000, pilot: deterministicPilot });
  assert.equal(plan.eligible, true);
  assert.ok(plan.blocks.length > 24);
  assert.equal(plan.sourceDigest, qualitySourceDigest(content));
  assert.equal(plan.optionalIds.length, 30);
  const selected = renderLogSelection(content, plan.blocks, plan.deterministicIds);
  assert.doesNotMatch(selected, /DEBUG /u);
  for (const text of ["required fault identity", "owningFunction()", "caller()", "Substantive cause", "Result: 2 passed, 1 failed", "Cleanup unknown"]) assert.ok(selected.includes(text));
  const originalLines = content.match(/[^\n]*\n|[^\n]+$/gu)!;
  for (const block of plan.blocks) assert.equal(block.rangeDigest, qualitySourceDigest(originalLines.slice(block.firstLine - 1, block.lastLine).join("")));
  const prepared = logFilterQuestions(plan, "Inspect the current task", 8192);
  assert.equal(prepared.questions.length, 12);
  assert.ok(prepared.limits.length > 0);
  assert.ok(prepared.evidence.slice(1).every(item => item.range?.totalLines === plan.totalLines));
  assert.equal(prepared.evidence.slice(1).some(item => item.text.includes("ERROR")), false);
});

test("JEV can add meaningful optional material but cannot remove deterministic or protected proof", () => {
  const plan = packLongLog(content, { failed: true, cleanupUnknown: true, truncated: false, limitBytes: 16_000, pilot: jevPilot });
  const prepared = logFilterQuestions(plan, "Inspect the current task", 8192);
  const answers = Object.fromEntries(prepared.questions.map((question, index) => [question.name, { status: "answered" as const, shape: "noul" as const, probability: index === 0 ? 0.95 : 0.01 }]));
  const advice = applyLogFilterAdvice(plan, prepared.questionBlocks, answers);
  assert.equal(advice.uncertain, false);
  assert.ok(plan.deterministicIds.every(id => advice.selectedIds.includes(id)));
  assert.equal(advice.selectedIds.length, plan.deterministicIds.length + 1);
  assert.ok(renderLogSelection(content, plan.blocks, advice.selectedIds).includes("bound revision=previous"));
  answers.q1!.probability = 0.5;
  assert.equal(applyLogFilterAdvice(plan, prepared.questionBlocks, answers).uncertain, true);
  assert.equal(applyLogFilterAdvice(plan, prepared.questionBlocks, {}).uncertain, true);
});

test("pilot eligibility skips small, structured, incomplete and unrequested output and reports complete-proof overflow", () => {
  const options = { failed: false, cleanupUnknown: false, truncated: false, limitBytes: 16_000, pilot: deterministicPilot };
  assert.equal(packLongLog(content, { ...options, pilot: undefined } as unknown as Parameters<typeof packLongLog>[1]).reason, "log-pilot-not-requested");
  assert.equal(packLongLog("Short native result", options).reason, "small-output");
  assert.equal(packLongLog(JSON.stringify({ result: "passed", detail: "x".repeat(5000) }), options).reason, "structured-output");
  assert.equal(packLongLog(Array.from({ length: 20 }, () => JSON.stringify({ event: "structured", detail: "x".repeat(240) })).join("\n"), options).reason, "structured-output");
  assert.equal(packLongLog(content, { ...options, truncated: true }).reason, "incomplete-output");
  assert.equal(packLongLog(content, { ...options, failed: true, limitBytes: 10 }).reason, "protected-overflow");
  const unknownFailure = ["Start", ...Array.from({ length: 30 }, (_unused, index) => `DEBUG unfamiliar ${index} ${".".repeat(160)}`), "End"].join("\n\n");
  const unknown = packLongLog(unknownFailure, { ...options, failed: true });
  assert.equal(unknown.protectedIds.length, unknown.blocks.length);
  assert.equal(unknown.optionalIds.length, 0);
});

test("an unrelated warning cannot hide assertion errors or an otherwise unlocated native failure", () => {
  const chatter = Array.from({ length: 30 }, (_unused, index) => `DEBUG chatter ${index} ${".".repeat(160)}`);
  const logs = ["DEBUG AssertionError [ERR_ASSERTION]: expected ownership current; got previous", "DEBUG handler stopped at owner identity current=false"];
  for (const cause of logs) {
    const original = ["Start", ...chatter, "WARNING: deprecated configuration", cause, "End"].join("\n\n");
    const plan = packLongLog(original, { failed: true, cleanupUnknown: false, truncated: false, limitBytes: 16_000, pilot: deterministicPilot });
    assert.ok(renderLogSelection(original, plan.blocks, plan.deterministicIds).includes(cause));
    if (!cause.includes("AssertionError")) assert.equal(plan.protectedIds.length, plan.blocks.length);
  }
});

test("the output owner offers code-only comparison without a provider call and keeps the original native receipt", async t => {
  const root = mkdtempSync(join(tmpdir(), "long-log-deterministic-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const log = join(root, "output.log"); writeFileSync(log, content);
  let calls = 0;
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["diagnostic"], consumers: { DL13: { mode: "auto" } } } } });
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "fixture", fetch: async () => { calls++; throw new Error("Code-only must not call a provider"); } });
  const receipt: CommandReceipt = { version: 1, requestDigest: digest("request"), state: "failed", exitCode: 1, signal: null, cleanup: "unknown",
    startedAt: "start", endedAt: "end", durationMs: 1, reason: "intended-fault", log, logBytes: Buffer.byteLength(content) };
  const snapshot = structuredClone(receipt), scope = { workspace: root, taskId: "task", taskRevision: "1" };
  const options = { task: "Inspect failure", eventId: "deterministic", policyDigest: settings.configDigest, environment: "fixture", revision: "1" };
  const untouched = await outputSelection(runtime, receipt, scope, options);
  assert.equal(untouched.reason, "log-pilot-not-requested"); assert.equal(untouched.selection!.text, content);
  const selected = await outputSelection(runtime, receipt, scope, { ...options, pilot: deterministicPilot });
  assert.equal(calls, 0); assert.equal(selected.decision, null); assert.equal(selected.delivered, true);
  assert.equal(selected.native.state, "failed"); assert.equal(selected.native.exitCode, 1); assert.equal(selected.native.cleanup, "unknown");
  assert.equal(selected.retrieval.path, log); assert.equal(selected.retrieval.digest, qualitySourceDigest(content));
  assert.equal(selected.omitted.length, 30);
  assert.ok(selected.omitted.every(item => item.coordinateTextDigest === qualitySourceDigest(content) && item.rangeDigest.startsWith("sha256:")));
  assert.deepEqual(receipt, snapshot); assert.equal(readFileSync(log, "utf8"), content);
  const overflow = await outputSelection(runtime, receipt, scope, { ...options, pilot: deterministicPilot, limitBytes: 10 });
  assert.equal(overflow.reason, "protected-overflow"); assert.equal(overflow.selection!.text, content); assert.ok(overflow.overflow);
  const large = "DEBUG original data\n".repeat(20_000); writeFileSync(log, large);
  const incomplete = await outputSelection(runtime, receipt, scope, { ...options, pilot: jevPilot });
  assert.equal(incomplete.reason, "incomplete-output"); assert.equal(incomplete.selection, null); assert.equal(incomplete.retrieval.digest, null); assert.equal(calls, 0);
  writeFileSync(log, Buffer.from([0xff, 0xfe, 0x00]));
  const binary = await outputSelection(runtime, receipt, scope, { ...options, pilot: jevPilot });
  assert.equal(binary.reason, "archive-unavailable"); assert.equal(binary.selection, null); assert.equal(calls, 0);
});

test("fixture optional advice, uncertainty and unavailable transport preserve proof and never establish task outcomes", async t => {
  const root = mkdtempSync(join(tmpdir(), "long-log-jev-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const log = join(root, "output.log"); writeFileSync(log, content);
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["diagnostic"], consumers: { DL13: { mode: "auto" } } } } });
  const receipt: CommandReceipt = { version: 1, requestDigest: digest("request"), state: "failed", exitCode: 1, signal: null, cleanup: "unknown",
    startedAt: "start", endedAt: "end", durationMs: 1, reason: "intended-fault", log, logBytes: Buffer.byteLength(content) };
  let probability = 0.95, calls = 0;
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "fixture", fetch: async (_url, init) => {
    calls++; const wire = JSON.parse(String(init?.body));
    assert.doesNotMatch(JSON.stringify(wire), /required fault identity/u);
    return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(Object.keys(wire.questions).map((name, index) => [name, { type: "noul", noul: index === 0 ? probability : 0.01 }])) });
  } });
  const scope = { workspace: root, taskId: "task", taskRevision: "1" }, options = { task: "Inspect failure", eventId: "fixture-1", policyDigest: settings.configDigest, environment: "fixture", revision: "1", pilot: jevPilot };
  const selected = await outputSelection(runtime, receipt, scope, options);
  assert.equal(calls, 1); assert.equal(selected.reason, "deterministic-plus-jev-log-filter"); assert.ok(selected.selection!.text.includes("bound revision=previous"));
  assert.ok(selected.selection!.text.includes("Result: 2 passed, 1 failed")); assert.equal("acceptedOutcome" in selected, false);
  probability = 0.5;
  const uncertain = await outputSelection(runtime, receipt, scope, { ...options, eventId: "fixture-2" });
  assert.equal(calls, 2); assert.equal(uncertain.reason, "uncertain-output-advice"); assert.equal(uncertain.selection!.text, content);
  assert.equal(uncertain.omitted.length, 0); assert.equal(uncertain.retrieval.digest, qualitySourceDigest(content));
  const unavailableRuntime = new DecisionRuntime(settings, join(root, "unavailable"), { coordinationRoot: root, token: "", fetch: async () => { throw new Error("Missing token must not dispatch"); } });
  const unavailable = await outputSelection(unavailableRuntime, receipt, scope, { ...options, eventId: "fixture-3" });
  assert.notEqual(unavailable.decision?.delivered, true); assert.doesNotMatch(unavailable.selection!.text, /DEBUG detail/u);
  assert.ok(unavailable.selection!.text.includes("Cleanup unknown")); assert.equal(readFileSync(log, "utf8"), content);
});
