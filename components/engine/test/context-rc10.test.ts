import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { digest, durableJson } from "../src/core.ts";
import { promptContext } from "../src/prompt-context.ts";
import { contextRouteCommand } from "../src/context-route-command.ts";
import { ContextRouteError } from "../src/context-route-errors.ts";
import { contextStateRoot } from "../src/context-command.ts";
import { procedureUnits, procedureExcerpt, procedureAdvisoryExcerpt } from "../src/context-procedures.ts";
import { selectContextPassages } from "../src/context-passage-advice.ts";
import { DecisionRuntime } from "../src/decision-runtime.ts";
import { profileDecisionSettings } from "../src/decision-settings.ts";
import { PROJECT_DEFAULTS } from "../src/runtime-project-defaults.ts";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath, workContext } from "../../harness/src/store/location.ts";
import { contextMetadataCatalog, selectContextMetadata } from "../src/context-metadata.ts";
import type { ValidationSubject } from "../src/change-subject.ts";
import { wireMetadataEvidence, wirePassageEvidence } from "./fixtures/context-wire.ts";
import { buildContextPacket } from "../src/context-packet.ts";
import { contextExcerpt } from "../src/context-excerpts.ts";
import { extractSourceFacts } from "../src/context-source-facts.ts";
import { readContextProjection } from "../src/telemetry-projection.ts";

test("native packet reuse isolates two chats and sibling worktrees, with no fresh provider dispatch", async t => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "rc10-entry-"))), root = join(directory, "main"), sibling = join(directory, "sibling");
  const oldState = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(directory, "state");
  t.after(() => { if (oldState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = oldState; rmSync(directory, { recursive: true, force: true }); });
  mkdirSync(root);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q"); mkdirSync(join(root, "config/governance"), { recursive: true });
  for (const path of ["config/governance/profile.yaml", "config/governance/facts.lock.yaml"]) writeFileSync(join(root, path), PROJECT_DEFAULTS[path]!);
  writeFileSync(join(root, "parser.ts"), "export function parse() { return 'safe'; }\n");
  git("add", "."); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture");
  git("worktree", "add", "-qb", "sibling", sibling);
  const assets = resolve("src/project_governance_runtime/assets/skills");
  const event = { hook_event_name: "UserPromptSubmit", session_id: "chat-a", turn_id: "a1", cwd: root, prompt: "Review parser behavior" };
  const first = await promptContext("codex", event, root, { environment: {}, assetRoot: assets });
  assert.match((first as any).hookSpecificOutput.additionalContext, /Execution workspace:/);
  const entries = () => readdirSync(join(contextStateRoot(root), "prompt-entries")).map(name => JSON.parse(readFileSync(join(contextStateRoot(root), "prompt-entries", name), "utf8")));
  const entry = entries().find(value => value.turn === "a1");
  let dispatches = 0;
  const provider = { async decide() { dispatches++; throw new Error("replay must not select again"); } };
  const replay = await contextRouteCommand(["--entry", entry.entryId], root, assets, provider, { session: "chat-a" });
  assert.equal(replay.reuse?.status, "validated-entry-replay"); assert.equal(replay.reuse?.turn, "a1");
  assert.equal(replay.execution.workspace, root); assert.equal(replay.execution.worktreeLocator, workContext(root).locator);
  assert.equal(dispatches, 0);
  const nested = join(root, "nested"); mkdirSync(nested);
  assert.equal((await contextRouteCommand(["--entry", entry.entryId], nested, assets, provider, { session: "chat-a" })).reuse?.turn, "a1");
  assert.equal((await contextRouteCommand([`--entry=${entry.entryId}`], root, assets, provider, { session: "chat-a" })).reuse?.status, "validated-entry-replay");
  const refusal = (code: string) => (error: unknown) => { assert.ok(error instanceof ContextRouteError); assert.equal(error.code, code); return true; };
  await assert.rejects(contextRouteCommand([], root, assets), refusal("entry-turn-unobserved"));
  await assert.rejects(contextRouteCommand(["--changed-path", "parser.ts"], root, assets), refusal("entry-turn-unobserved"));
  await assert.rejects(contextRouteCommand(["--revision", "prior", "--optional-path", "parser.ts"], root, assets), refusal("entry-turn-unobserved"));
  await assert.rejects(contextRouteCommand(["--entry", entry.entryId], root, assets, provider, { session: "chat-b" }), refusal("entry-session-mismatch"));
  await assert.rejects(contextRouteCommand(["--entry", entry.entryId], sibling, assets, provider, { session: "chat-a" }), refusal("entry-unavailable-in-workspace"));
  await promptContext("codex", { ...event, session_id: "chat-b", turn_id: "b1" }, root, { environment: {}, assetRoot: assets });
  assert.equal((await contextRouteCommand(["--entry", entry.entryId], root, assets, provider, { session: "chat-a" })).reuse?.turn, "a1");
  writeFileSync(join(root, "parser.ts"), "export function parse() { return 'changed'; }\n");
  await assert.rejects(contextRouteCommand(["--entry", entry.entryId], root, assets, provider, { session: "chat-a" }), refusal("entry-source-stale"));
  await promptContext("codex", { ...event, turn_id: "a2" }, root, { environment: {}, assetRoot: assets });
  await assert.rejects(contextRouteCommand(["--entry", entry.entryId], root, assets, provider, { session: "chat-a" }), refusal("entry-superseded"));
  const current = entries().find(value => value.turn === "a2");
  const store = new Store(defaultDbPath(root));
  const task = store.createTask("Review changed parser", [], { worktree: root, session: "chat-a" });
  store.bind(task.taskId, "chat-a", store.workspace(workContext(root).locator, root), root); store.close();
  await assert.rejects(contextRouteCommand(["--entry", current.entryId], root, assets, provider, { session: "chat-a" }), refusal("entry-task-changed"));
  assert.equal(dispatches, 0);
});

test("early prompt refusals leave typed zero-call telemetry without saving prompt text", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rc10-entry-refusal-"))), oldState = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  t.after(() => { if (oldState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = oldState; rmSync(root, { recursive: true, force: true }); });
  execFileSync("git", ["init", "-q"], { cwd: root });
  const prompt = "Sensitive operator content must never enter refusal analytics";
  const event = { hook_event_name: "UserPromptSubmit", session_id: "chat", turn_id: "turn", cwd: root, prompt };
  assert.deepEqual(await promptContext("codex", { ...event, turn_id: undefined }, root, { environment: {} }), {});
  assert.deepEqual(await promptContext("codex", { ...event, agent_id: "worker" }, root, { environment: {} }), {});
  assert.deepEqual(await promptContext("codex", { ...event, cwd: tmpdir() }, root, { environment: {} }), {});
  const projection = readContextProjection(contextStateRoot(root), root, { kinds: ["failure"] });
  assert.equal(projection.state, "available"); assert.equal(projection.records.length, 3);
  assert.deepEqual(new Set(projection.records.map(item => item.reason)), new Set(["missing-session-or-turn", "delegated-worker", "workspace-mismatch"]));
  assert.ok(projection.records.every(item => item.counts.providerCalled === 0));
  const receipts = readdirSync(join(contextStateRoot(root), "prompt-rejections")).map(name => readFileSync(join(contextStateRoot(root), "prompt-rejections", name), "utf8"));
  assert.ok(receipts.every(body => !body.includes(prompt) && JSON.parse(body).telemetryProjectionWritten === true));
  assert.equal(JSON.stringify(projection.records).includes(prompt), false);
});

test("small source evidence keeps its fixture and helpers in one bounded uncertain assessment", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rc10-whole-evidence-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const candidate = { id: "tests/cleanup.test.ts", sourceDigest: digest("fixture"), excerpt:
    "function recordedState() { return { saved: true, closing: false }; }\n" +
    "test('preserves the saved result', () => { const state = recordedState(); assert.equal(state.saved, true); });\n" };
  const facts = extractSourceFacts(candidate.id, Buffer.from(candidate.excerpt));
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["tests/**"],
    consumers: { DL03: { mode: "auto", questions: ["context.passage-evidence/1", "context.passage-role/1"] } } } } });
  let questions = 0;
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "fixture", fetch: async (_url, init) => {
    const wire = JSON.parse(String(init?.body)); questions += Object.keys(wire.questions).length;
    for (const question of Object.values(wire.questions)) assert.equal(wirePassageEvidence(wire, question).passage, candidate.excerpt);
    return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(Object.keys(wire.questions).map(name => [name, { type: "noul", noul: 0.55 }])) });
  } });
  const advice = await selectContextPassages(runtime, [candidate], { purpose: "How does this preserve a recorded result, and which fixture proves it?", scope: { workspace: root, taskId: "task", taskRevision: "1" },
    subjectDigest: digest("source"), revision: "1", environment: "explicit", invocationId: "a".repeat(64), policyDigest: settings.configDigest,
    deadlineAt: performance.now() + 5000, excerptBytes: 512, sourceSpans: { [candidate.id]: facts.spans } });
  assert.equal(questions, 1); assert.equal(advice.eligibleUnitCount, 1); assert.equal(advice.readings[0]?.complete, true);
  assert.equal(advice.judgments[candidate.id], undefined); assert.deepEqual(advice.unitOrder[candidate.id]?.preferredSpans, []);
  const packet = await buildContextPacket({ taskRevision: "1", purpose: "Preserve recorded results", required: [], optional: [candidate], maximumBytes: 1024,
    optionalExcerptBytes: 512, sourceSpans: { [candidate.id]: facts.spans }, passageUnitOrder: advice.unitOrder }, { async decide() { throw new Error("local fallback"); } });
  assert.equal(packet.entries[0]?.excerpt, candidate.excerpt); assert.equal(packet.unitOrdering[candidate.id], "uncertain-score");
});

test("literal units include attached declaration prose and Kotlin quoted test names", () => {
  const javascript = "/** Rejects unsupported hosts before choosing a target. */\nexport function chooseTarget() { return helper(); }\n\n/** Stable tie order. */\nfunction helper() { return 'target'; }\n";
  const facts = extractSourceFacts("target.mjs", Buffer.from(javascript));
  assert.equal(facts.spans.find(span => span.name === "chooseTarget")?.start, 1);
  assert.equal(facts.spans.find(span => span.name === "helper")?.start, 4);
  const kotlin = "class CleanupTest {\n    @Test\n    fun `failed cleanup retries remaining work`() {\n        assertEquals(2, retry())\n    }\n    @Test\n    fun `successful cleanup is unchanged`() {\n        assertEquals(2, retry())\n    }\n}\n";
  const native = extractSourceFacts("CleanupTest.kt", Buffer.from(kotlin));
  const retry = native.spans.find(span => span.name === "`failed cleanup retries remaining work`")!;
  assert.equal(retry.start, 2); assert.equal(retry.end, 5); assert.match(native.descriptor!, /failed cleanup retries remaining work/);
});

test("uncertain unit advice preserves source order and balances explicitly curated procedures at ordinary limits", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rc10-uncertain-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const candidates = [
    { id: "src/first.ts", excerpt: "export function first() { return true; }\n" },
    { id: "src/guard.ts", excerpt: "export function repairSetup() {\n" + "  inspectUnrelatedSetup();\n".repeat(30) + "}\n\n\n\n\n\nexport function seal() { if (closed) return false; return true; }\n" },
    { id: "docs/runbook.md", excerpt: "# Recovery\nNever discard saved work.\n\n## Setup\nPrepare a fresh workspace.\n\n## Warm restart\nResume the existing owner and retain its pending work.\n" },
  ].map(item => ({ ...item, sourceDigest: digest(item.excerpt) }));
  const spans = Object.fromEntries(candidates.map(item => [item.id, extractSourceFacts(item.id, Buffer.from(item.excerpt)).spans]));
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["src/**", "docs/**"],
    budget: { max_calls: 8, max_request_bytes: 131072 }, consumers: { DL03: { mode: "auto", questions: ["context.passage-evidence/1", "context.passage-role/1"] } } } } });
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "fixture", fetch: async (_url, init) => {
    const wire = JSON.parse(String(init?.body));
    return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(Object.entries(wire.questions).map(([name, raw]) => {
      const item = wirePassageEvidence(wire, raw);
      return [name, { type: "noul", noul: item.path === "src/first.ts" ? 0.9 : /closed|Warm restart/.test(item.passage) ? 0.73 : 0.1 }];
    })) });
  } });
  const purpose = "Repair guard behavior and resume pending work";
  const advice = await selectContextPassages(runtime, candidates, { purpose, scope: { workspace: root, taskId: "task", taskRevision: "1" },
    subjectDigest: digest("subject"), revision: "1", environment: "explicit", invocationId: "d".repeat(64), policyDigest: settings.configDigest,
    deadlineAt: performance.now() + 5000, excerptBytes: 512, procedurePaths: ["docs/runbook.md"], procedureBytes: 4096, sourceSpans: spans });
  assert.deepEqual(Object.keys(advice.judgments), ["src/first.ts"], "uncertainty never enters the positive map");
  assert.equal(advice.procedures.selectedFiles, 0);
  const provider = { async decide(request: any) { return { version: 1 as const, kind: request.kind, inputDigest: digest(request),
    delivered: candidates.map(item => item.id), suggested: null, method: "baseline" as const, reason: "fixture", model: null,
    questionVersion: "fixture", confidence: null, latencyMs: 0, usage: { inputTokens: null, outputTokens: null } }; } };
  const input = { taskRevision: "1", purpose, required: [], optional: candidates, maximumBytes: 6000, optionalExcerptBytes: 512,
    sourceSpans: spans, procedurePaths: ["docs/runbook.md"], procedureBytes: 4096, passageJudgments: advice.judgments,
    passageUnitOrder: advice.unitOrder };
  const packet = await buildContextPacket(input, provider);
  assert.deepEqual(packet.entries.filter(item => item.id.startsWith("src/")).map(item => item.id), ["src/first.ts", "src/guard.ts"]);
  const guard = packet.entries.find(item => item.id === "src/guard.ts")!, guide = packet.entries.find(item => item.id === "docs/runbook.md")!;
  assert.match(guard.excerpt, /if \(closed\)/); assert.doesNotMatch(guard.excerpt, /repairSetup/);
  assert.match(guide.excerpt, /Never discard saved work/);
  assert.ok(Buffer.byteLength(guide.excerpt) <= 512);
  assert.equal(packet.unitOrdering["src/guard.ts"], "uncertain-score");
  const stale = structuredClone(input); stale.passageUnitOrder["src/guard.ts"]!.sourceDigest = digest("stale");
  const fallback = await buildContextPacket(stale, provider);
  assert.equal(fallback.judgmentLimitations["src/guard.ts"], "judgment-source-mismatch");
  assert.equal(fallback.unitOrdering["src/guard.ts"], undefined);
  assert.equal(fallback.entries.find(item => item.id === "src/guard.ts")!.excerpt, contextExcerpt(candidates[1]!, purpose, 512, spans["src/guard.ts"]).excerpt);
  const undeclared = await buildContextPacket({ ...input, procedurePaths: [] }, provider);
  assert.deepEqual(undeclared.entries.map(item => item.id), candidates.map(item => item.id), "uncertain advice cannot promote undeclared documents");
});

test("an uncertain implementation quote survives complementary delivery among repeated test evidence", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rc10-quote-ranking-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const candidates = [
    { id: "tests/guard.test.ts", excerpt: "test('required behavior', () => { assert.equal(allowed, false); });\n" },
    { id: "tests/other.test.ts", excerpt: "test('related behavior', () => { assert.equal(other, true); });\n" },
    { id: "src/guard.ts", excerpt: "export function guard() { if (invalid) return false; return allowed; }\n" },
  ].map(item => ({ ...item, sourceDigest: digest(item.excerpt) }));
  const spans = Object.fromEntries(candidates.map(item => [item.id, extractSourceFacts(item.id, Buffer.from(item.excerpt)).spans]));
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"],
    allowed_source_paths: ["src/**", "tests/**"], consumers: { DL03: { mode: "auto", questions: ["context.passage-evidence/1", "context.passage-role/1"] } } } } });
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "fixture", fetch: async (_url, init) => {
    const wire = JSON.parse(String(init?.body));
    return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(Object.entries(wire.questions).map(([name, q]) => {
      const path = wirePassageEvidence(wire, q).path;
      return [name, { type: "noul", noul: path === "src/guard.ts" ? 0.74 : path === "tests/guard.test.ts" ? 0.95 : 0.76 }];
    })) });
  } });
  const advice = await selectContextPassages(runtime, candidates, { purpose: "Find the invalid-input guard and its assertion", scope: { workspace: root, taskId: "task", taskRevision: "1" },
    subjectDigest: digest("subject"), revision: "1", environment: "explicit", invocationId: "9".repeat(64), policyDigest: settings.configDigest,
    deadlineAt: performance.now() + 5000, excerptBytes: 512, sourceSpans: spans });
  const packet = await buildContextPacket({ taskRevision: "1", purpose: "Find the invalid-input guard and its assertion", required: [], optional: candidates,
    maximumBytes: 1200, optionalExcerptBytes: 512, sourceSpans: spans, passageJudgments: advice.judgments, passageUnitOrder: advice.unitOrder }, { async decide(request) {
    return { version: 1, kind: request.kind, inputDigest: digest(request), delivered: candidates.map(item => item.id), suggested: null,
      method: "baseline", reason: "metadata", model: null, questionVersion: "fixture", confidence: null, latencyMs: 0,
      usage: { inputTokens: null, outputTokens: null } };
  } });
  assert.deepEqual(packet.entries.slice(0, 2).map(item => item.id), ["tests/guard.test.ts", "src/guard.ts"]);
  assert.equal(packet.unitOrdering["src/guard.ts"], "uncertain-score"); assert.equal(advice.judgments["src/guard.ts"], undefined);
  assert.match(packet.entries[1]!.excerpt, /if \(invalid\) return false/); assert.ok(packet.bytes <= 1200);
});

test("a decisive source unit without matching words reaches JEV after more than 64 distracting units", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rc10-unit-breadth-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = Array.from({ length: 70 }, (_, index) => `function finish${index}() { return ${index}; }\n\n\n\n\n\n`).join("") +
    "function seal() { if (state.closed) return false; return true; }\n";
  const candidate = { id: "src/lifetime.js", sourceDigest: digest(source), excerpt: source };
  const facts = extractSourceFacts(candidate.id, Buffer.from(source)), captured: string[] = [];
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["src/**"],
    budget: { max_calls: 8, max_request_bytes: 131072 }, consumers: { DL03: { mode: "auto", questions: ["context.passage-evidence/1", "context.passage-role/1"] } } } } });
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "fixture", fetch: async (_url, init) => {
    const wire = JSON.parse(String(init?.body));
    return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(Object.entries(wire.questions).map(([name, raw]) => {
      const item = wirePassageEvidence(wire, raw); captured.push(item.passage);
      return [name, { type: "noul", noul: item.passage.includes("state.closed") ? 0.95 : 0.1 }];
    })) });
  } });
  const advice = await selectContextPassages(runtime, [candidate], { purpose: "finish", scope: { workspace: root, taskId: "task", taskRevision: "1" },
    subjectDigest: digest("subject"), revision: "1", environment: "explicit", invocationId: "f".repeat(64), policyDigest: settings.configDigest,
    deadlineAt: performance.now() + 5000, excerptBytes: 1024, sourceSpans: { [candidate.id]: facts.spans } });
  assert.ok(advice.assessedUnitCount > 64);
  assert.ok(captured.some(body => body.includes("state.closed") && !body.includes("finish0")), "named items contain their own bodies");
  assert.equal(advice.judgments[candidate.id]?.preferredSpans[0]?.name, "seal");
});

test("a confirmed procedure retains useful uncertain sections without granting them a larger allowance", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rc10-mixed-units-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["docs/**"],
    budget: { max_calls: 8, max_request_bytes: 131072 }, consumers: { DL03: { mode: "auto", questions: ["context.passage-evidence/1", "context.passage-role/1"] } } } } });
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "fixture", fetch: async (_url, init) => {
    const wire = JSON.parse(String(init?.body));
    return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(Object.entries(wire.questions).map(([name, raw]) => {
      const item = wirePassageEvidence(wire, raw);
      return [name, { type: "noul", noul: item.passage.includes("## Verification") ? 0.75 : item.passage.includes("## Preservation") ? 0.74 : 0.1 }];
    })) });
  } });
  const excerpt = "# Recovery\nNever discard pending work.\n\n## Verification\nVerify the exact saved result.\n\n## Preservation\nKeep the original run record when verification fails.\n\n## Unrelated\nPublish a marketing page.\n";
  const candidate = { id: "docs/recovery.md", sourceDigest: digest(excerpt), excerpt };
  const select = (source: typeof candidate, id: string, excerptBytes: number) => selectContextPassages(runtime, [source], {
    purpose: "Verify saved results and preserve failed runs", scope: { workspace: root, taskId: "task", taskRevision: "1" },
    subjectDigest: digest("subject"), revision: "1", environment: "explicit", invocationId: digest(id).slice(7), policyDigest: settings.configDigest,
    deadlineAt: performance.now() + 5000, excerptBytes, procedurePaths: [source.id], procedureBytes: 4096 });
  const advice = await select(candidate, "small", 512);
  assert.equal(advice.procedures.selectedFiles, 1);
  assert.equal(advice.judgments[candidate.id]!.preferredSpans.length, 1, "Only the confirmed section enters positive judgments");
  const provider = { async decide() { throw new Error("Use local order"); } };
  const packet = await buildContextPacket({ taskRevision: "1", purpose: "Verify saved results", required: [], optional: [candidate], maximumBytes: 3000,
    optionalExcerptBytes: 512, procedurePaths: [candidate.id], procedureBytes: 4096, passageJudgments: advice.judgments, passageUnitOrder: advice.unitOrder }, provider);
  assert.match(packet.entries[0]!.excerpt, /Verify the exact saved result/);
  assert.match(packet.entries[0]!.excerpt, /Keep the original run record/);
  assert.doesNotMatch(packet.entries[0]!.excerpt, /Publish a marketing page/);
  assert.ok(Buffer.byteLength(packet.entries[0]!.excerpt) <= 512);
  assert.equal(packet.unitOrdering[candidate.id], "uncertain-score");
  const large = { ...candidate, excerpt: excerpt.replace("Verify the exact saved result.", "Verify the exact saved result.\n" + "Required verification detail.\n".repeat(25))
    .replace("Keep the original run record when verification fails.", "Keep the original run record when verification fails.\n" + "Original preservation detail.\n".repeat(25)) };
  large.sourceDigest = digest(large.excerpt);
  const largerAdvice = await select(large, "large", 512);
  assert.equal(largerAdvice.unitOrder[large.id], undefined, "Uncertain sections do not receive the procedure allowance");
  assert.equal(largerAdvice.judgments[large.id]?.interpretation, "positive", "An unrepresentable ordinary ordering must not erase valid positive advice");
  const largerPacket = await buildContextPacket({ taskRevision: "1", purpose: "Verify saved results", required: [], optional: [large], maximumBytes: 3000,
    optionalExcerptBytes: 512, procedurePaths: [large.id], procedureBytes: 4096, passageJudgments: largerAdvice.judgments, passageUnitOrder: largerAdvice.unitOrder }, provider);
  assert.match(largerPacket.entries[0]!.excerpt, /Required verification detail/);
  assert.doesNotMatch(largerPacket.entries[0]!.excerpt, /Original preservation detail/);
});

test("oversized uncertain procedure evidence stays inside its strongest section instead of substituting smaller sections", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rc10-procedure-partial-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const body = "# Recovery\nAlways preserve the operator's original record.\n\n## Safety\n" + "Unrelated setup detail.\n".repeat(35) +
    "Never delete original run records during recovery.\n" + "More unrelated detail.\n".repeat(35) + "\n## Changelog\nDocument publication dates.\n";
  const candidate = { id: "docs/recovery.md", sourceDigest: digest(body), excerpt: body };
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["docs/**"],
    budget: { max_calls: 8, max_request_bytes: 131072 }, consumers: { DL03: { mode: "auto", questions: ["context.passage-evidence/1", "context.passage-role/1"] } } } } });
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "fixture", fetch: async (_url, init) => {
    const wire = JSON.parse(String(init?.body));
    return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(Object.entries(wire.questions).map(([name, raw]) => {
      const item = wirePassageEvidence(wire, raw); return [name, { type: "noul", noul: item.passage.includes("## Safety") ? 0.64 : item.passage.includes("## Changelog") ? 0.43 : 0.1 }];
    })) });
  } });
  const purpose = "Prevent deletion of original run records during recovery";
  const advice = await selectContextPassages(runtime, [candidate], { purpose, scope: { workspace: root, taskId: "task", taskRevision: "1" },
    subjectDigest: digest("subject"), revision: "1", environment: "explicit", invocationId: "9".repeat(64), policyDigest: settings.configDigest,
    deadlineAt: performance.now() + 5000, excerptBytes: 512, procedurePaths: [candidate.id], procedureBytes: 4096 });
  const packet = await buildContextPacket({ taskRevision: "1", purpose, required: [], optional: [candidate], maximumBytes: 1500,
    optionalExcerptBytes: 512, procedurePaths: [candidate.id], procedureBytes: 4096, passageJudgments: advice.judgments, passageUnitOrder: advice.unitOrder }, { async decide() { throw new Error("Local order"); } });
  assert.match(packet.entries[0]!.excerpt, /Never delete original run records/);
  assert.doesNotMatch(packet.entries[0]!.excerpt, /Document publication dates/);
  assert.ok(packet.entries[0]!.sourceUnits?.every(unit => !unit.complete));
  assert.equal(packet.unitOrdering[candidate.id], "uncertain-score");
  assert.deepEqual(packet.judgmentLimitations, {}); assert.equal(advice.procedures.selectedFiles, 0);
});

test("a later uncertain procedure keeps a partial guard without erasing its stronger section or prelude", () => {
  const first = "## Preserve\n" + "Keep the recorded owner.\n".repeat(10);
  const next = "## Recover\n" + "Unrelated setup detail.\n".repeat(30) + "Never delete original run records during recovery.\n" + "Other detail.\n".repeat(30);
  const body = "# Recovery\nAlways keep the operator's original record.\n\n" + first + next;
  const candidate = { id: "docs/recovery.md", sourceDigest: digest(body), excerpt: body };
  const spans = procedureUnits(candidate).filter(span => span.name !== "Document introduction");
  const excerpt = procedureAdvisoryExcerpt(candidate, "Never delete original run records during recovery", spans, 700)!;
  assert.ok(Buffer.byteLength(excerpt.excerpt) <= 700);
  assert.match(excerpt.excerpt, /Always keep the operator's original record/);
  assert.match(excerpt.excerpt, /Never delete original run records/);
  assert.equal(excerpt.sourceDigest, candidate.sourceDigest);
  assert.equal(excerpt.sourceUnits?.find(unit => unit.name === "Preserve")?.complete, true);
  assert.equal(excerpt.sourceUnits?.find(unit => unit.name === "Recover")?.complete, false);
  assert.equal(excerpt.sourceUnits?.find(unit => unit.name === "Document introduction")?.kind, "heading");
});

test("JEV's approved classification allowance does not shrink to the main model's delivery excerpt", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rc10-source-classification-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const body = "export function preserveRun(record) {\n" + "  examineRecordedOwner(record);\n".repeat(80) + "  if (record.closed) return record.original;\n}\n";
  const candidate = { id: "src/lifetime.ts", sourceDigest: digest(body), excerpt: body }, spans = extractSourceFacts(candidate.id, Buffer.from(body)).spans;
  let completeBodySeen = false;
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["src/**"],
    consumers: { DL03: { mode: "auto", questions: ["context.passage-evidence/1", "context.passage-role/1"] } } } } });
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "fixture", fetch: async (_url, init) => {
    const wire = JSON.parse(String(init?.body));
    return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(Object.entries(wire.questions).map(([name, raw]) => {
      const item = wirePassageEvidence(wire, raw); completeBodySeen ||= item.passage === body;
      return [name, { type: "noul", noul: item.passage === body ? 0.9 : 0.1 }];
    })) });
  } });
  const purpose = "Preserve the original result of a closed record";
  const advice = await selectContextPassages(runtime, [candidate], { purpose, scope: { workspace: root, taskId: "task", taskRevision: "1" },
    subjectDigest: digest("subject"), revision: "1", environment: "explicit", invocationId: "8".repeat(64), policyDigest: settings.configDigest,
    deadlineAt: performance.now() + 5000, excerptBytes: 512, sourceSpans: { [candidate.id]: spans } });
  assert.equal(completeBodySeen, true);
  const packet = await buildContextPacket({ taskRevision: "1", purpose, required: [], optional: [candidate], maximumBytes: 1500,
    optionalExcerptBytes: 512, sourceSpans: { [candidate.id]: spans }, passageJudgments: advice.judgments }, { async decide() { throw new Error("Local order"); } });
  assert.ok(Buffer.byteLength(packet.entries[0]!.excerpt) <= 512);
  assert.notEqual(packet.entries[0]!.excerpt, body, "Complete classification does not imply complete delivery at a deliberately tiny allowance");
  assert.ok(packet.entries[0]!.sourceUnits?.some(unit => !unit.complete));
});

test("packet rounds preserve a first complete unit and a second confirmed guard ahead of fallback and later uncertain units", async () => {
  const body = "export function inspectSession() {\n" + "  inspectSavedSession();\n".repeat(15) + "  return originalSession;\n}\n\n\n\n\n\n" +
    "export function rejectUnknownRole() {\n  if (role === 'unknown') throw new Error('Unknown role');\n" + "  verifySessionOwner();\n".repeat(40) + "}\n\n\n\n\n\n" +
    "export function inspectSetup() {\n" + "  inspectOptionalSetup();\n".repeat(15) + "}\n";
  const source = { id: "src/session.ts", sourceDigest: digest(body), excerpt: body };
  const spans = extractSourceFacts(source.id, Buffer.from(body)).spans;
  const first = spans.find(span => span.name === "inspectSession")!, second = spans.find(span => span.name === "rejectUnknownRole")!, third = spans.find(span => span.name === "inspectSetup")!;
  const preferred = [first, second], all = [first, second, third], purpose = "Inspect sessions and reject an unknown role";
  const ordinary = contextExcerpt(source, purpose, 512, spans, preferred);
  const advisory = contextExcerpt(source, purpose, 512, spans, all);
  const assertion = { id: "tests/session.test.ts", sourceDigest: digest("test"), excerpt: "assert.throws(() => rejectUnknownRole('unknown'));\n" };
  const background = { id: "docs/background.md", sourceDigest: digest("background"), excerpt: "Unrelated operational history.\n".repeat(100) };
  const packet = await buildContextPacket({ taskRevision: "1", purpose, required: [], optional: [background, source, assertion], maximumBytes: 1800,
    optionalExcerptBytes: 512, sourceSpans: { [source.id]: spans }, passageJudgments: {
      [source.id]: { sourceDigest: source.sourceDigest, excerptDigest: digest(ordinary.excerpt), probability: 0.9, interpretation: "positive",
        role: "implementation", roleSource: "path", preferredSpans: preferred },
      [assertion.id]: { sourceDigest: assertion.sourceDigest, excerptDigest: digest(assertion.excerpt), probability: 0.9, interpretation: "positive",
        role: "test", roleSource: "path", preferredSpans: [] } },
    passageUnitOrder: { [source.id]: { sourceDigest: source.sourceDigest, excerptDigest: digest(advisory.excerpt), preferredSpans: all,
      basis: "uncertain-score", kind: "source", probability: 0.9, policy: "passage-score-3" } } }, { async decide(request) {
      return { version: 1, kind: request.kind, inputDigest: digest(request), delivered: request.candidates.map(item => item.id), suggested: null,
        method: "baseline", reason: "fixture", model: null, questionVersion: "fixture", confidence: null, latencyMs: 0,
        usage: { inputTokens: null, outputTokens: null } };
    } });
  const delivered = packet.entries.find(item => item.id === source.id)!;
  const lines = body.match(/[^\n]*\n|[^\n]+$/gu)!;
  assert.ok(delivered.excerpt.includes(lines.slice(first.start - 1, first.end).join("")), "The first complete passage survives growth");
  assert.match(delivered.excerpt, /throw new Error\('Unknown role'\)/);
  assert.doesNotMatch(delivered.excerpt, /inspectOptionalSetup/);
  assert.ok(delivered.sourceUnits?.some(unit => unit.name === second.name && !unit.complete));
  assert.ok(packet.entries.some(item => item.id === assertion.id));
  assert.ok(packet.bytes <= 1800);
  assert.ok(Buffer.byteLength(delivered.excerpt) > 512, "Only additional confirmed source units may spend the remaining packet allowance");
});

test("the shared byte allowance can assess more than 256 captured units without a second preparation ceiling", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rc10-passage-allocation-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const candidates = Array.from({ length: 5 }, (_, file) => {
    const excerpt = Array.from({ length: 70 }, (_, unit) => `function finish${unit}() { return ${unit}; }\n\n\n\n\n\n`).join("") +
      (file === 4 ? "function preserve() { if (closed) return original; }\n" : "");
    return { id: `src/lifetime-${file}.ts`, sourceDigest: digest(excerpt), excerpt };
  });
  const sourceSpans = Object.fromEntries(candidates.map(candidate => [candidate.id, extractSourceFacts(candidate.id, Buffer.from(candidate.excerpt)).spans]));
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["src/**"],
    evidence_bytes: 16384, budget: { max_calls: 64, max_request_bytes: 524288 }, consumers: { DL03: { mode: "auto", questions: ["context.passage-evidence/1", "context.passage-role/1"] } } } } });
  let requestBytes = 0;
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "fixture", fetch: async (_url, init) => {
    requestBytes += Buffer.byteLength(String(init?.body));
    const wire = JSON.parse(String(init?.body));
    return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(Object.entries(wire.questions).map(([name, raw]) => {
      const item = wirePassageEvidence(wire, raw); return [name, { type: "noul", noul: item.passage.includes("return original") ? 0.9 : 0.1 }];
    })) });
  } });
  const advice = await selectContextPassages(runtime, candidates, { purpose: "finish", scope: { workspace: root, taskId: "task", taskRevision: "1" },
    subjectDigest: digest("subject"), revision: "1", environment: "explicit", invocationId: "6".repeat(64), policyDigest: settings.configDigest,
    deadlineAt: performance.now() + 5000, excerptBytes: 1024, sourceSpans });
  assert.equal(advice.assessedUnitCount, 351); assert.equal(advice.eligibleUnitCount, 351);
  assert.equal(advice.judgments[candidates[4]!.id]?.preferredSpans[0]?.name, "preserve");
  assert.ok(requestBytes <= settings.budget.maxRequestBytes); assert.ok(advice.packingMs >= 0 && advice.preparationMs >= 0);
});

test("procedure selection preserves parent constraints and a shared prelude while competing with source proof", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rc10-procedure-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const guide = { id: "docs/recovery.md", sourceDigest: digest("guide"), excerpt: "# Recovery guide\nNever erase the saved queue.\n\n## Warm restart\nKeep the owner lock.\n### Step one\nDrain pending work.\n### Step two\nReattach the same worker.\n\n## Promotion\nRequire the exact candidate receipt.\n\n## Unrelated\nPrint a banner.\n" };
  const units = procedureUnits(guide);
  assert.equal(units.filter(unit => unit.name === "Warm restart").length, 1);
  const warm = units.find(unit => unit.name === "Warm restart")!;
  assert.ok(warm.end > warm.start + 4);
  assert.equal(procedureExcerpt(guide, [{ ...warm, end: warm.start }], 2048), null, "a clipped section is not complete procedure evidence");
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["docs/**", "tests/**"],
    budget: { max_calls: 8, max_request_bytes: 131072 }, consumers: { DL03: { mode: "auto", questions: ["context.passage-evidence/1", "context.passage-role/1"] } } } } });
  const seen: string[] = [];
  const runtime = new DecisionRuntime(settings, root, { coordinationRoot: root, token: "fixture", fetch: async (_url, init) => {
    const wire = JSON.parse(String(init?.body));
    return Response.json({ model: settings.legacy.model, answers: Object.fromEntries(Object.entries(wire.questions).map(([name, raw]) => {
      const item = wirePassageEvidence(wire, raw); seen.push(item.path);
      assert.match(item.passage, item.kind === "procedure" ? /Never erase the saved queue/ : /assert/);
      return [name, { type: "noul", noul: /Warm restart|Promotion|assert/.test(item.passage) ? 0.95 : 0.1 }];
    })) });
  } });
  const source = { id: "tests/resume.test.ts", sourceDigest: digest("test"), excerpt: "test('retains owner', () => { assert.equal(retainedOwner, true); });\n" };
  const advice = await selectContextPassages(runtime, [guide, source], { purpose: "Recover pending work and then ship the update", scope: { workspace: root, taskId: "task", taskRevision: "1" },
    subjectDigest: digest("subject"), revision: "1", environment: "explicit", invocationId: "a".repeat(64), policyDigest: settings.configDigest,
    deadlineAt: performance.now() + 5000, excerptBytes: 1024, procedurePaths: [guide.id], procedureBytes: 2048 });
  assert.equal(seen[0], guide.id); assert.equal(seen[1], source.id, "source proof gets capacity before deeper procedure units");
  const selected = procedureExcerpt(guide, advice.judgments[guide.id]!.preferredSpans, 2048)!;
  assert.match(selected.excerpt, /Keep the owner lock[\s\S]*Drain pending work[\s\S]*Reattach the same worker/);
  assert.match(selected.excerpt, /Require the exact candidate receipt/);
  assert.equal(selected.excerpt.split("Never erase the saved queue").length - 1, 1);
  assert.doesNotMatch(selected.excerpt, /Print a banner/);
  assert.ok(selected.sourceUnits?.every(unit => unit.complete));
  assert.equal(selected.sourceUnits?.find(unit => unit.name === "Document introduction")?.kind, "heading");
  assert.equal(advice.judgments[source.id]?.interpretation, "positive");
  const local = await selectContextPassages(new DecisionRuntime(settings, root, { coordinationRoot: root, token: "" }), [guide], { purpose: "Recover", scope: { workspace: root, taskId: "task", taskRevision: "1" },
    subjectDigest: digest("subject"), revision: "1", environment: "explicit", invocationId: "b".repeat(64), policyDigest: settings.configDigest,
    deadlineAt: performance.now() + 5000, excerptBytes: 64, procedurePaths: [guide.id], procedureBytes: 64 });
  assert.equal(local.reason, "provider-unavailable"); assert.deepEqual(local.judgments, {}); assert.equal(local.decisions.length, 0);
});

test("many procedure declarations share the capture window with ranked source rather than consuming it", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rc10-procedure-window-"))), state = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  t.after(() => { if (state === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = state; rmSync(root, { recursive: true, force: true }); });
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q");
  for (const directory of ["config/governance", "docs", "src", "explicit"]) mkdirSync(join(root, directory), { recursive: true });
  const procedures = Array.from({ length: 40 }, (_, index) => `docs/procedure-${String(index).padStart(2, "0")}.md`);
  const explicit = Array.from({ length: 32 }, (_, index) => `explicit/input-${index}.ts`);
  for (const path of procedures) writeFileSync(join(root, path), "# Procedure\nPreserve the original result.\n");
  for (const path of explicit) writeFileSync(join(root, path), "export const supplied = true;\n");
  writeFileSync(join(root, "src/retained-result.ts"), "export function retainResult() { return original; }\n");
  writeFileSync(join(root, "rules.md"), "Keep existing evidence.\n"); writeFileSync(join(root, ".gitignore"), "state/\n");
  writeFileSync(join(root, "config/governance/facts.lock.yaml"), PROJECT_DEFAULTS["config/governance/facts.lock.yaml"]!);
  writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify({ context_router: { default_route: "project", default_context: ["rules.md"], procedure_sources: procedures, routes: [{ id: "project" }] },
    continuity: { decisions: { mode: "off", max_candidates: 64 } } }));
  git("add", "."); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture");
  const packet = await contextRouteCommand(["--task", "Find source retaining the original result", "--revision", "1",
    ...explicit.flatMap(path => ["--optional-path", path])], root, resolve("src/project_governance_runtime/assets/skills"), {
      async decide(request) { return { version: 1, kind: request.kind, inputDigest: digest(request), delivered: request.candidates.map(item => item.id), suggested: null,
        method: "baseline", reason: "off", model: null, questionVersion: "baseline-1", confidence: null, latencyMs: 0, usage: { inputTokens: null, outputTokens: null } }; },
    }, { workspaceCatalog: true });
  const receipt = JSON.parse(readFileSync(join(contextStateRoot(root), "routes", `${packet.receiptId}.json`), "utf8"));
  const captured = receipt.optionalSources.map((item: { id: string }) => item.id);
  assert.ok(captured.includes("src/retained-result.ts"), "The automatic source must retain its body-capture opportunity");
  assert.ok(explicit.every(path => captured.includes(path)), "Explicit inputs still have priority");
  assert.equal(packet.procedureReferences.length, 40, "Uncaptured procedure originals remain discoverable");
  assert.ok(packet.procedureReferences.some(item => item.status !== "delivered-complete-selected-sections"));
});

test("normal prompt entry delivers an approved procedure even when its file metadata score is low", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rc10-native-procedure-"))), state = process.env.XDG_STATE_HOME, token = process.env.JEV_TOKEN, original = globalThis.fetch;
  process.env.XDG_STATE_HOME = join(root, "state"); process.env.JEV_TOKEN = "fixture";
  t.after(() => { globalThis.fetch = original; if (state === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = state; if (token === undefined) delete process.env.JEV_TOKEN; else process.env.JEV_TOKEN = token; rmSync(root, { recursive: true, force: true }); });
  execFileSync("git", ["init", "-q"], { cwd: root, stdio: "pipe" });
  mkdirSync(join(root, "config/governance"), { recursive: true }); mkdirSync(join(root, "docs"));
  writeFileSync(join(root, ".gitignore"), "state/\n"); writeFileSync(join(root, "rules.md"), "Preserve process ownership.\n");
  writeFileSync(join(root, "docs/operations.md"), "# Operations\nKeep the saved queue.\n\n## Warm restart\nDrain pending work before replacing the owned worker.\n");
  writeFileSync(join(root, "config/governance/facts.lock.yaml"), PROJECT_DEFAULTS["config/governance/facts.lock.yaml"]!);
  writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify({ context_router: { default_route: "project", default_context: ["rules.md"], procedure_sources: ["docs/operations.md"], routes: [{ id: "project" }] },
    continuity: { decisions: { mode: "auto", allowed_data_classes: ["metadata", "source"], allowed_metadata_paths: ["docs/**"], allowed_source_paths: ["docs/**"], consumers: { DL03: { mode: "auto", questions: ["context.metadata-relevance/1", "context.passage-evidence/1", "context.passage-role/1"] } } } } }));
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++; const wire = JSON.parse(String(init?.body));
    return Response.json({ model: "jev-1.13.0", answers: Object.fromEntries(Object.keys(wire.questions).map(name => [name, { type: "noul", noul: name.startsWith("file-") ? 0.1 : 0.95 }])) });
  };
  const assets = resolve("src/project_governance_runtime/assets/skills"), event = { hook_event_name: "UserPromptSubmit", session_id: "s", turn_id: "1", cwd: root, prompt: "Recover pending work safely" };
  const prepared = await promptContext("codex", event, root, { environment: {}, assetRoot: assets }), text = (prepared as any).hookSpecificOutput.additionalContext;
  assert.match(text, /Preserve process ownership/); assert.match(text, /Keep the saved queue/); assert.match(text, /Drain pending work before replacing the owned worker/);
  assert.equal(calls, 2); assert.deepEqual(await promptContext("codex", event, root, { environment: {}, assetRoot: assets }), prepared); assert.equal(calls, 2);
  delete process.env.JEV_TOKEN;
  const fallback = await promptContext("codex", { ...event, turn_id: "2" }, root, { environment: {}, assetRoot: assets });
  const local = (fallback as any).hookSpecificOutput.additionalContext;
  assert.match(local, /Preserve process ownership/); assert.match(local, /docs\/operations.md/); assert.equal(calls, 2);
  assert.match(local, /delivered-unconfirmed-sections/, "ordinary local evidence is not a positive procedure selection");
  assert.doesNotMatch(local, /delivered-complete-selected-sections/);
});

test("several relevant guide sections cannot crowd out implementation and assertion evidence", async () => {
  const guide = { id: "docs/recovery.md", sourceDigest: digest("guide"), excerpt: `# Recovery\nKeep pending work.\n\n## Identity\nVerify the owner.\n${"Authored detail.\n".repeat(18)}\n## Restart\nDrain work first.\n${"Other authored detail.\n".repeat(25)}\n## Promotion\nRetain the exact receipt.\n${"More authored detail.\n".repeat(25)}` };
  const implementation = { id: "src/recover.ts", sourceDigest: digest("source"), excerpt: "export function recover(owner) {\n  return owner === recordedOwner;\n}\n" };
  const assertion = { id: "tests/recover.test.ts", sourceDigest: digest("assertion"), excerpt: "test('owner is retained', () => {\n  assert.equal(recover(recordedOwner), true);\n});\n" };
  const preferred = procedureUnits(guide).filter(unit => unit.name !== "Document introduction");
  const full = procedureExcerpt(guide, preferred, 4096)!;
  const sourceSpan = { kind: "function", name: "recover", start: 1, end: 3 };
  const testSpan = { kind: "test", name: "owner is retained", start: 1, end: 3 };
  const judged = (candidate: typeof implementation, spans: typeof sourceSpan[], role: string, procedure = false) => ({
    sourceDigest: candidate.sourceDigest, excerptDigest: digest(procedure ? full.excerpt : contextExcerpt(candidate, "Recover safely", 1024, spans, spans).excerpt),
    probability: 0.95, interpretation: "positive" as const, role, roleSource: "path" as const, preferredSpans: spans, ...(procedure ? { procedure: true } : {}) });
  const judgments = { [guide.id]: judged(guide, preferred, "documentation", true), [implementation.id]: judged(implementation, [sourceSpan], "implementation"), [assertion.id]: judged(assertion, [testSpan], "test") };
  const packet = await buildContextPacket({ taskRevision: "1", purpose: "Recover safely", required: [], optional: [guide, implementation, assertion],
    maximumBytes: 2300, optionalExcerptBytes: 1024, procedurePaths: [guide.id], procedureBytes: 4096,
    sourceSpans: { [implementation.id]: [sourceSpan], [assertion.id]: [testSpan] }, passageJudgments: judgments },
    { async decide() { throw new Error("Use deterministic fallback ordering"); } });
  assert.ok(packet.entries.some(item => item.id === implementation.id)); assert.ok(packet.entries.some(item => item.id === assertion.id));
  const delivered = packet.entries.find(item => item.id === guide.id)!;
  assert.match(delivered.excerpt, /Verify the owner/); assert.match(delivered.excerpt, /Keep pending work/);
  assert.ok(delivered.sourceUnits?.every(unit => unit.complete));
  assert.ok(packet.omittedJudgedUnits.some(item => item.path === guide.id)); assert.ok(packet.bytes <= 2300);
});

test("a large descriptor catalog reaches every permitted file within the declared family allowance", { timeout: 30000 }, async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rc10-large-catalog-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const paths = Array.from({ length: 8255 }, (_, index) => `src/module-${String(index % 47).padStart(2, "0")}/long-component-${String(index).padStart(5, "0")}.ts`);
  const subject = { root, source: () => ({ file_type: "regular" }),
    projectionSources: (names: string[]) => ({ view: "worktree", subject: null, sources: new Map(names.map(path => [path, { key: path, freshness: "fixed" }])) }),
    readBatch: (names: string[]) => new Map(names.map(path => [path, Buffer.from("export function recoverOwner() { return 'retain queue'; }\n")])),
  } as unknown as ValidationSubject;
  const configured = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["metadata", "source"], allowed_metadata_paths: ["src/**"], allowed_source_paths: ["src/**"],
    budget: { max_calls: 1024, max_request_bytes: 8388608 }, consumers: { DL03: { mode: "auto", questions: ["context.metadata-relevance/1"] } } } } });
  const seen = new Set<string>(); let wireBytes = 0;
  const runtime = new DecisionRuntime(configured, root, { coordinationRoot: root, token: "fixture", fetch: async (_url, init) => {
    const body = String(init?.body), wire = JSON.parse(body); wireBytes += Buffer.byteLength(body);
    assert.ok(!body.includes("sha256:"), "local identity hashes do not multiply the wire payload");
    return Response.json({ model: configured.legacy.model, answers: Object.fromEntries(Object.entries(wire.questions).map(([name, question]) => {
      const fact = wireMetadataEvidence(wire, question); seen.add(fact.id); assert.match(fact.text, /recoverOwner/);
      return [name, { type: "noul", noul: fact.id === paths.at(-1) ? 0.98 : 0.1 }];
    })) });
  } });
  const selection = await selectContextMetadata(subject, contextMetadataCatalog(paths, "Prevent losing pending work", [], [], new Set()), "Prevent losing pending work",
    runtime, { workspace: root, taskId: "task", taskRevision: "1" }, digest("large"), "large", undefined, performance.now() + 30000);
  assert.equal(selection.coverage.complete, true, JSON.stringify(selection.coverage)); assert.equal(seen.size, paths.length);
  assert.equal(selection.order[0], paths.at(-1)); assert.ok(wireBytes <= 8388608);
  assert.equal(selection.sourceIndex.descriptorCoverage.descriptorAnsweredCount, paths.length);
  assert.equal(selection.budgetFinalized, true);
});
