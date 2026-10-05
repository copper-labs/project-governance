import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digest } from "../src/core.ts";
import { qualitySourceDigest } from "../src/context-evaluation-quality.ts";
import { DecisionRuntime } from "../src/decision-runtime.ts";
import { profileDecisionSettings } from "../src/decision-settings.ts";
import { selectContextPassages, wholeFileExclusionPreview, type WholeFilePassageExclusion } from "../src/context-passage-advice.ts";
import { buildContextPacket } from "../src/context-packet.ts";
import { extractSourceFacts } from "../src/context-source-facts.ts";
import { contextExcerpt } from "../src/context-excerpts.ts";

const original = { id: "docs/colors.md", excerpt: "# Color palette\nUse a blue highlight.\n", sourceDigest: qualitySourceDigest("# Color palette\nUse a blue highlight.\n") };
const required = { id: "AGENTS.md", excerpt: "Keep required instructions.\n", sourceDigest: qualitySourceDigest("Keep required instructions.\n") };
const exclusion = (candidate = original): WholeFilePassageExclusion => ({ sourceDigest: candidate.sourceDigest,
  excerptDigest: digest(candidate.excerpt), probability: 0.1, interpretation: "negative", complete: true, scope: "whole-file" });
const offline = { async decide(): Promise<never> { throw new Error("No extra provider call"); } };
const packetInput = { taskRevision: "current", purpose: "Find a database migration", required: [required], optional: [original], maximumBytes: 4000, optionalExcerptBytes: 512 };

test("whole-file receipt preview counts only applied packet omissions and bounds identities", () => {
  const exclusions = Object.fromEntries(Array.from({ length: 70 }, (_, index) => [`docs/color-${index}.md`, exclusion()]));
  assert.deepEqual(wholeFileExclusionPreview(exclusions, {}), {
    excludedWholeFileCount: 0, wholeFileExclusions: {}, wholeFileExclusionsTruncated: false });
  const reasons = Object.fromEntries(Object.keys(exclusions).map(path => [path, "whole-file-negative-passage"]));
  reasons["docs/pinned.md"] = "optional-budget";
  const preview = wholeFileExclusionPreview(exclusions, reasons);
  assert.equal(preview.excludedWholeFileCount, 70); assert.equal(Object.keys(preview.wholeFileExclusions).length, 64);
  assert.equal(preview.wholeFileExclusionsTruncated, true);
  assert.equal(preview.wholeFileExclusions["docs/pinned.md"], undefined);
});

test("complete whole-file negative passage reaches the existing packet owner and permits no-match", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "whole-file-negative-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["docs/**"],
    consumers: { DL03: { mode: "auto", questions: ["context.passage-evidence/1", "context.passage-role/1"] } } } } });
  let calls = 0;
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "fixture", fetch: async (_url, init) => {
    calls++; const wire = JSON.parse(String(init?.body));
    assert.equal(wire.state.items.c0.passage, original.excerpt, "The fixture must judge the actual complete body");
    return Response.json({ model: settings.legacy.model, answers: { "evidence-passage-0": { type: "noul", noul: 0.1 } } });
  } });
  const advice = await selectContextPassages(runtime, [original], { purpose: packetInput.purpose,
    scope: { workspace: root, taskId: "task", taskRevision: "current" }, subjectDigest: digest("subject"), revision: "current", environment: "fixture",
    invocationId: digest("negative-whole-file").slice(7), policyDigest: settings.configDigest, deadlineAt: performance.now() + 5000, excerptBytes: 512 });
  assert.equal(calls, 1); assert.equal(advice.readings[0]?.interpretation, "negative"); assert.equal(advice.readings[0]?.complete, true);
  assert.deepEqual(advice.exclusions, { [original.id]: exclusion() });
  assert.equal(advice.decisions[0]?.providerCalled, true, "Original decision evidence remains retained");
  const packet = await buildContextPacket({ ...packetInput, passageExclusions: advice.exclusions }, offline);
  assert.deepEqual(packet.entries, [required]); assert.deepEqual(packet.omitted, [original.id]);
  assert.equal(packet.omissionReasons[original.id], "whole-file-negative-passage");
  assert.equal(packet.reason, "complete-passage-no-match"); assert.equal(packet.decision, null);
  assert.equal(packet.measurement.tokenSavings, null);
});

test("negative omission preserves required and explicit, task-declared or changed-path pins", async () => {
  const packet = await buildContextPacket({ ...packetInput, priorityIds: [original.id],
    passageExclusions: { [original.id]: exclusion(), [required.id]: exclusion(required) } }, offline);
  assert.deepEqual(packet.entries, [required, original]); assert.deepEqual(packet.omitted, []);
  const requiredOnly = await buildContextPacket({ ...packetInput, optional: [], passageExclusions: { [required.id]: exclusion(required) } }, offline);
  assert.deepEqual(requiredOnly.entries, [required]);
  const procedure = await buildContextPacket({ ...packetInput, procedurePaths: [original.id], passageExclusions: { [original.id]: exclusion() } }, offline);
  assert.deepEqual(procedure.entries, [required, original]); assert.deepEqual(procedure.omitted, []);
  const controller = new AbortController(); controller.abort();
  const cancelled = await buildContextPacket({ ...packetInput, passageExclusions: { [original.id]: exclusion() } }, offline, { signal: controller.signal });
  assert.deepEqual(cancelled.entries, [required, original]); assert.deepEqual(cancelled.omitted, []);
});

test("stale source or excerpt proof and conflicting uncertain advice retain local fallback", async () => {
  for (const patch of [{ sourceDigest: qualitySourceDigest("old source") }, { excerptDigest: digest("partial body") },
    { complete: false }, { scope: "fragment" }, { probability: 0.5 }, { probability: -0.1 }, { interpretation: "uncertain" }]) {
    const packet = await buildContextPacket({ ...packetInput,
      passageExclusions: { [original.id]: { ...exclusion(), ...patch } as WholeFilePassageExclusion } }, offline);
    assert.deepEqual(packet.entries, [required, original]); assert.deepEqual(packet.omitted, []);
    assert.ok(packet.judgmentLimitations[original.id]);
  }
  const packet = await buildContextPacket({ ...packetInput, passageExclusions: { [original.id]: exclusion() },
    passageJudgments: { [original.id]: { sourceDigest: original.sourceDigest, excerptDigest: digest(original.excerpt), probability: 0.5,
      preferredSpans: [], interpretation: "uncertain", role: "documentation", roleSource: "path" } } }, offline);
  assert.deepEqual(packet.entries, [required, original]); assert.deepEqual(packet.omitted, []);
});

test("a complete clipped unit is not proof of a complete negatively assessed original file", async () => {
  const sourceLines = original.excerpt.match(/[^\n]*\n|[^\n]+$/gu)!;
  const partial = { ...original, excerpt: sourceLines[0]!, sourceRange: { firstLine: 1, lastLine: 1, totalLines: sourceLines.length,
    excerptDigest: qualitySourceDigest(sourceLines[0]!), complete: false as const }, sourceUnits: [{ kind: "heading", name: "Color palette", firstLine: 1, lastLine: 1, complete: true }] };
  const { optionalExcerptBytes: _excerptBytes, ...rangedInput } = packetInput;
  const packet = await buildContextPacket({ ...rangedInput, optional: [partial], passageExclusions: { [partial.id]: exclusion(partial) } }, offline);
  assert.deepEqual(packet.entries, [required, partial]); assert.deepEqual(packet.omitted, []);
  assert.equal(packet.judgmentLimitations[partial.id], "judgment-not-representable");
});

test("negative fragments, uncertain answers, shadow and unavailable advice produce no exclusion", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "negative-passage-boundaries-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const largeText = "export function unrelated() {\n" + "  // Unrelated appearance details fill a large source unit.\n".repeat(250) + "  return 'blue';\n}\n";
  const large = { id: "src/colors.ts", excerpt: largeText, sourceDigest: qualitySourceDigest(largeText) };
  const spans = { [large.id]: extractSourceFacts(large.id, Buffer.from(largeText)).spans };
  for (const condition of ["partial", "uncertain", "shadow", "unavailable"] as const) {
    const state = join(root, condition), settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"],
      allowed_source_paths: ["**"], consumers: { DL03: { mode: condition === "shadow" ? "shadow" : "auto",
        questions: ["context.passage-evidence/1", "context.passage-role/1"] } } } } });
    let calls = 0;
    const runtime = new DecisionRuntime(settings, state, { coordinationRoot: state, token: condition === "unavailable" ? "" : "fixture", fetch: async (_url, init) => {
      calls++; const wire = JSON.parse(String(init?.body));
      return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(Object.keys(wire.questions)
        .map(name => [name, { type: "noul", noul: condition === "uncertain" ? 0.5 : 0.1 }])) });
    } });
    const advice = await selectContextPassages(runtime, [condition === "partial" ? large : original], { purpose: packetInput.purpose,
      scope: { workspace: root, taskId: condition, taskRevision: "current" }, subjectDigest: digest("subject"), revision: "current", environment: "fixture",
      invocationId: digest(`negative-boundary-${condition}`).slice(7), policyDigest: settings.configDigest, deadlineAt: performance.now() + 5000, excerptBytes: 512,
      ...(condition === "partial" ? { sourceSpans: spans } : {}) });
    assert.deepEqual(advice.exclusions, {}, condition);
    assert.equal(calls, condition === "unavailable" ? 0 : 1, condition);
    if (condition === "partial") assert.ok(advice.readings.every(reading => !reading.complete), "A clipped negative cannot exclude its original");
  }
  const partialCandidate = contextExcerpt(large, packetInput.purpose, 512, spans[large.id]);
  assert.ok(partialCandidate.sourceRange, "This fixture really clips its original source");
});

test("metadata-negative alone and remaining unassessed automatic originals retain background", async () => {
  const other = { id: "src/current.ts", excerpt: "Current implementation remains unassessed.\n", sourceDigest: qualitySourceDigest("Current implementation remains unassessed.\n") };
  const packet = await buildContextPacket({ ...packetInput, optional: [original, other], passageExclusions: { [original.id]: exclusion() } }, offline);
  assert.deepEqual(packet.entries, [required, other]); assert.deepEqual(packet.omitted, [original.id]);
  const metadataOnly = await buildContextPacket(packetInput, { async decide(request) { return { version: 1, kind: request.kind,
    inputDigest: digest(request), delivered: [original.id], suggested: null, method: "baseline", reason: "answered-all-negative-metadata",
    model: "fixture", questionVersion: "context.metadata-relevance/1", confidence: null, latencyMs: 0, usage: { inputTokens: null, outputTokens: null } }; } });
  assert.deepEqual(metadataOnly.entries, [required, original]); assert.deepEqual(metadataOnly.omitted, []);
});
