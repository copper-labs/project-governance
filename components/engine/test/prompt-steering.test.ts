import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promptContext } from "../src/prompt-context.ts";
import { contextStateRoot } from "../src/context-command.ts";
import { digest } from "../src/core.ts";
import { PROJECT_DEFAULTS } from "../src/runtime-project-defaults.ts";
import { latestSessionPrompt, importContextUsage, promptTurnKey, promptAccountingFamily, publishContextObservation } from "../src/context-observations.ts";
import { contextRouteCommand } from "../src/context-route-command.ts";
import { readPreparedPrompt } from "../src/context-packet-replay.ts";
import { contextFamilyScope, readDecisionBudget, DECISION_BUDGET_FILE } from "../src/decision-budget.ts";
import { DatabaseSync } from "node:sqlite";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath, workContext } from "../../harness/src/store/location.ts";

function fixture(t: any, active = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "native-steering-"))), previous = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  t.after(() => { if (previous === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previous; rmSync(root, { recursive: true, force: true }); });
  execFileSync("git", ["init", "-q"], { cwd: root, stdio: "pipe" });
  mkdirSync(join(root, "config/governance"), { recursive: true }); mkdirSync(join(root, "src"));
  writeFileSync(join(root, ".gitignore"), "state/\n"); writeFileSync(join(root, "AGENTS.md"), "Required current guidance: authorization is not executed proof.\n");
  writeFileSync(join(root, "config/governance/facts.lock.yaml"), PROJECT_DEFAULTS["config/governance/facts.lock.yaml"]!);
  writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify({
    context_router: { default_route: "project", default_context: ["AGENTS.md"], routes: [{ id: "project", match: { path_globs: ["src/**"] } }] },
    continuity: { decisions: { mode: active ? "auto" : "off", allowed_data_classes: ["metadata", "source"], allowed_metadata_paths: ["src/**"], allowed_source_paths: ["src/**"],
      consumers: { DL03: { mode: "auto", questions: ["context.metadata-relevance/1"] } } } },
  }));
  writeFileSync(join(root, "src/reconnect.ts"), "export const reconnect = 'Keep cleanup ownership until settlement.';\n");
  const assetRoot = resolve("src/project_governance_runtime/assets/skills"), state = contextStateRoot(root);
  const event = { hook_event_name: "UserPromptSubmit", session_id: "same-native-chat", turn_id: "same-active-turn", cwd: root, prompt: "Read src/reconnect.ts and explain reconnect." };
  const submit = (overrides = {}) => promptContext("codex", { ...event, ...overrides }, root, { environment: {}, assetRoot });
  const entries = () => readdirSync(join(state, "prompt-entries")).map(file => JSON.parse(readFileSync(join(state, "prompt-entries", file), "utf8")));
  return { root, state, event, submit, entries, assetRoot };
}

function transport(t: any, respond?: (wire: any, call: number) => Promise<void>) {
  const originalFetch = globalThis.fetch, originalToken = process.env.JEV_TOKEN, wires: any[] = [];
  process.env.JEV_TOKEN = "synthetic-steering-fixture";
  globalThis.fetch = async (_url, init) => {
    const wire = JSON.parse(String(init?.body)); wires.push(wire); await respond?.(wire, wires.length);
    return Response.json({ model: "jev-1.13.0", answers: Object.fromEntries(Object.keys(wire.questions).map(name => [name, { type: "noul", noul: 0.9 }])) });
  };
  t.after(() => { globalThis.fetch = originalFetch; if (originalToken === undefined) delete process.env.JEV_TOKEN; else process.env.JEV_TOKEN = originalToken; });
  return wires;
}

function entryFor(f: ReturnType<typeof fixture>, prompt: string) { return f.entries().find(entry => entry.promptDigest === digest(prompt))!; }

test("changed input on the same active native turn gets current context and immutable shared accounting", async t => {
  const f = fixture(t), first = await f.submit(), anchor = f.entries()[0]!;
  const originalEntry = readFileSync(join(f.state, "prompt-entries", `${anchor.entryId}.json`));
  const originalPacket = readFileSync(join(f.state, "prompt-packets", `${anchor.entryId}.json`));
  const prompt = "Give me an update, then fix cleanup in src/reconnect.ts.";
  const changed = await f.submit({ prompt });
  const entries = f.entries();
  assert.equal(entries.length, 2, "A distinct steering prompt must not be rejected as an unprepared duplicate");
  const steered = entries.find(entry => entry.entryId !== anchor.entryId)!;
  assert.equal(steered.promptDigest, digest(prompt)); assert.equal(steered.familyId, anchor.entryId);
  assert.equal(steered.turn, anchor.turn); assert.equal(steered.session, anchor.session);
  assert.equal(latestSessionPrompt(f.root, f.event.session_id).entry?.entryId, steered.entryId);
  assert.match((changed as any).hookSpecificOutput.additionalContext, /Required current guidance: authorization/);
  assert.match((changed as any).hookSpecificOutput.additionalContext, /Current task facts/);
  assert.doesNotMatch((changed as any).hookSpecificOutput.additionalContext, /use a new operator turn/);
  assert.notDeepEqual(changed, first); assert.deepEqual(await f.submit({ prompt }), changed);
  assert.deepEqual(readFileSync(join(f.state, "prompt-entries", `${anchor.entryId}.json`)), originalEntry);
  assert.deepEqual(readFileSync(join(f.state, "prompt-packets", `${anchor.entryId}.json`)), originalPacket);
});

test("returning to earlier A after B observes current intent and facts without replacing either original", async t => {
  const f = fixture(t), store = new Store(defaultDbPath(f.root)), where = workContext(f.root);
  const task = store.createTask("Retain reconnect settlement", [], { worktree: f.root });
  store.bind(task.taskId, f.event.session_id, store.workspace(where.locator, f.root), f.root);
  const initial = store.checkpoint(task.taskId, { summary: "Initial reconnect state", next: "Inspect original cleanup", evidenceIds: [], subject: null });
  await f.submit(); const anchor = f.entries()[0]!, original = readFileSync(join(f.state, "prompt-packets", `${anchor.entryId}.json`));
  await f.submit({ prompt: "Give me the current reconnect progress." });
  const current = store.checkpoint(task.taskId, { summary: "Current reconnect settlement", next: "Qualify revised cleanup", evidenceIds: [], subject: null }); store.close();
  writeFileSync(join(f.root, "src/reconnect.ts"), "export const reconnect = 'Current exact recurrence source';\n");
  const recurring = await f.submit(); assert.equal(f.entries().length, 3, "A historical recurrence is a fresh current observation");
  const latest = latestSessionPrompt(f.root, f.event.session_id).entry!;
  assert.notEqual(latest.entryId, anchor.entryId); assert.equal(latest.familyId, anchor.entryId); assert.equal(latest.promptDigest, anchor.promptDigest);
  const packet = JSON.parse(readFileSync(join(f.state, "prompt-packets", `${latest.entryId}.json`), "utf8"));
  assert.equal(packet.taskFacts.checkpoint.checkpointId, current.checkpointId); assert.notEqual(current.checkpointId, initial.checkpointId);
  assert.match((recurring as any).hookSpecificOutput.additionalContext, /Current exact recurrence source/);
  assert.deepEqual(await f.submit(), recurring); assert.deepEqual(readFileSync(join(f.state, "prompt-packets", `${anchor.entryId}.json`)), original);
});

test("A then B then C then B creates a new occurrence within the exhausted original allowance", async t => {
  const f = fixture(t, true), wires = transport(t); await f.submit(); const anchor = f.entries()[0]!;
  const promptB = "Inspect reconnect settlement B.", promptC = "Inspect reconnect cleanup C.";
  await f.submit({ prompt: promptB }); const firstB = entryFor(f, promptB), original = readFileSync(join(f.state, "prompt-packets", `${firstB.entryId}.json`));
  await f.submit({ prompt: promptC }); const spent = wires.length, recurring = await f.submit({ prompt: promptB });
  assert.equal(f.entries().length, 4); const latest = latestSessionPrompt(f.root, f.event.session_id).entry!;
  assert.notEqual(latest.entryId, firstB.entryId); assert.equal(latest.familyId, anchor.entryId); assert.equal(latest.promptDigest, firstB.promptDigest);
  assert.equal(wires.length, spent); assert.deepEqual(await f.submit({ prompt: promptB }), recurring);
  assert.equal(wires.length, spent); assert.deepEqual(readFileSync(join(f.state, "prompt-packets", `${firstB.entryId}.json`)), original);
});

test("unordered sibling occurrences remain ambiguous despite different timestamps and cannot open another pool", async t => {
  const f = fixture(t, true), wires = transport(t); await f.submit(); const anchor = f.entries()[0]!;
  await f.submit({ prompt: "First concurrent reconnect request." }); const child = latestSessionPrompt(f.root, f.event.session_id).entry!;
  const key = promptTurnKey("codex", f.root, anchor.worktreeLocator, f.event.session_id, f.event.turn_id);
  const directory = join(f.state, "prompt-preparations", digest(f.event.session_id).slice(7));
  const marker = JSON.parse(readFileSync(join(directory, `${key}-${child.entryId}.json`), "utf8"));
  marker.promptDigest = digest("Second concurrent reconnect request.");
  marker.entryId = digest({ provider: marker.provider, workspace: marker.workspace, session: marker.session, turn: marker.turn,
    worktreeLocator: marker.worktreeLocator, promptDigest: marker.promptDigest, predecessor: marker.predecessor }).slice(7);
  marker.submittedAt = new Date(Date.parse(marker.submittedAt) + 1).toISOString();
  publishContextObservation(join(directory, `${key}-${marker.entryId}.json`), marker);
  assert.equal(latestSessionPrompt(f.root, f.event.session_id).reason, "session-entry-ambiguous");
  const spent = wires.length, result = await f.submit({ prompt: "Explain reconnect after the unordered submissions." });
  assert.equal(wires.length, spent); assert.equal(f.entries().length, 2);
  assert.match((result as any).hookSpecificOutput.additionalContext, /original-accounting-unverified/);
  assert.doesNotMatch((result as any).hookSpecificOutput.additionalContext, /Native entry reference \(for --entry\)/);
});

for (const [label, shift] of [["same-millisecond", 0], ["backwards-clock", -1000]] as const) test(`causal current occurrence survives a ${label} timestamp without choosing old intent`, async t => {
  const f = fixture(t); await f.submit(); const anchor = f.entries()[0]!;
  const prompt = "Current reconnect intent after the first input.", prepared = await f.submit({ prompt });
  const child = entryFor(f, prompt), key = promptTurnKey("codex", f.root, anchor.worktreeLocator, f.event.session_id, f.event.turn_id);
  const markerPath = join(f.state, "prompt-preparations", digest(f.event.session_id).slice(7), `${key}-${child.entryId}.json`);
  const marker = JSON.parse(readFileSync(markerPath, "utf8")); marker.submittedAt = new Date(Date.parse(anchor.submittedAt) + shift).toISOString();
  child.submittedAt = marker.submittedAt; writeFileSync(markerPath, JSON.stringify(marker));
  writeFileSync(join(f.state, "prompt-entries", `${child.entryId}.json`), JSON.stringify(child));
  assert.equal(latestSessionPrompt(f.root, f.event.session_id).entryId, child.entryId, "The unique causal head is current independent of within-turn clock order");
  assert.equal(readPreparedPrompt(f.root, child.entryId, f.assetRoot, f.event.session_id).text, (prepared as any).hookSpecificOutput.additionalContext);
  assert.deepEqual(await f.submit({ prompt }), prepared); assert.equal(f.entries().length, 2);
});

test("completed same-turn steering reassesses exact purpose/source within the original two continuation slots", async t => {
  const f = fixture(t, true), wires = transport(t);
  await f.submit(); const anchor = f.entries()[0]!, before = wires.length;
  assert.ok(before > 0, "The original fixture must execute intercepted metadata transport");
  const prompt = "Give me an update, then fix cleanup in src/reconnect.ts.";
  writeFileSync(join(f.root, "src/reconnect.ts"), "/** Reconnect now retains its revised settlement identity. */\nexport const reconnect = 'Revised exact source';\n");
  const changed = await f.submit({ prompt }), child = entryFor(f, prompt);
  assert.equal(child.familyId, anchor.entryId); assert.equal(child.contextFamily.step, 1); assert.equal(child.contextFamily.status, "reserved");
  assert.ok(wires.length > before, "Changed exact purpose/source cannot reuse old metadata judgments");
  const packet = JSON.parse(readFileSync(join(f.state, "prompt-packets", `${child.entryId}.json`), "utf8"));
  assert.ok(packet.route.metadata.coverage.invalidatedBatches > 0); assert.equal(packet.route.metadata.coverage.replayedBatches, 0);
  assert.equal(packet.route.execution.entryId, child.entryId); assert.equal(packet.route.execution.familyId, anchor.entryId);
  assert.equal(packet.route.expansion.entry, child.entryId); assert.equal(packet.route.expansion.familyId, anchor.entryId);
  const childCalls = wires.length; assert.deepEqual(await f.submit({ prompt }), changed); assert.equal(wires.length, childCalls);
  await assert.rejects(contextRouteCommand(["--entry", child.entryId, "--expansion", "2", "--task", prompt], f.root, f.assetRoot, undefined, { session: "other-chat" }), /current observed entry/);
  assert.throws(() => readPreparedPrompt(f.root, anchor.entryId, f.assetRoot, f.event.session_id), /supersedes/);
  const nextPrompt = "Now inspect reconnect settlement in src/reconnect.ts.";
  await f.submit({ prompt: nextPrompt }); const next = entryFor(f, nextPrompt);
  assert.equal(next.contextFamily.step, 2); assert.equal(next.contextFamily.status, "reserved");
  const used = wires.length, exhausted = await f.submit({ prompt: "Now finish reconnect cleanup from src/reconnect.ts." });
  assert.equal(wires.length, used); assert.match((exhausted as any).hookSpecificOutput.additionalContext, /Current local context only: context-family/);
  assert.equal(readDecisionBudget(f.state, contextFamilyScope(f.root, anchor.entryId))?.calls, used);
  const db = new DatabaseSync(join(f.state, DECISION_BUDGET_FILE), { readOnly: true });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM context_family").get()!.n, 1); assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 2); db.close();
});

test("in-flight same-turn steering is local, and late original completion cannot displace current input", async t => {
  const f = fixture(t, true); let started!: () => void, release!: () => void;
  const observed = new Promise<void>(resolve => { started = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const wires = transport(t, async (_wire, call) => { if (call === 1) { started(); await gate; } });
  const original = f.submit(); await observed;
  const prompt = "Pause implementation and give me current progress.";
  const changed = await f.submit({ prompt }), child = entryFor(f, prompt);
  assert.equal(wires.length, 1); assert.equal(child.accountingAnchor.ready, false); assert.equal(child.accountingAnchor.entryDigest, null);
  assert.equal(child.selectionReason, "original-preparation-unavailable-or-incomplete");
  assert.deepEqual(await f.submit({ prompt }), changed); assert.equal(wires.length, 1);
  release(); const late = await original;
  assert.match((late as any).hookSpecificOutput.additionalContext, /superseded while preparing/);
  assert.doesNotMatch((late as any).hookSpecificOutput.additionalContext, /Keep cleanup ownership until settlement/);
  assert.equal(latestSessionPrompt(f.root, f.event.session_id).entry?.entryId, child.entryId);
  const expansion = await contextRouteCommand(["--entry", child.entryId, "--expansion", "1", "--task", prompt], f.root, f.assetRoot, undefined, { session: f.event.session_id });
  assert.equal(expansion.expansion?.status, "local-only"); assert.equal(wires.length, 1);
  assert.equal(promptAccountingFamily(f.root, child).ready, false, "A completed parent cannot upgrade the frozen unqualified claim");
});

test("duplicate changed input while its preparation is in flight stays local without overwriting its eventual packet", async t => {
  const f = fixture(t, true); let started!: () => void, release!: () => void;
  const observed = new Promise<void>(resolve => { started = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const wires = transport(t, async (_wire, call) => { if (call === 2) { started(); await gate; } });
  await f.submit(); const anchor = f.entries()[0]!, original = readFileSync(join(f.state, "prompt-packets", `${anchor.entryId}.json`));
  const prompt = "Inspect current reconnect settlement after steering.", current = f.submit({ prompt }); await observed;
  const duplicate = await f.submit({ prompt }); assert.equal(wires.length, 2);
  const text = (duplicate as any).hookSpecificOutput.additionalContext;
  assert.match(text, /Required current guidance: authorization/); assert.match(text, /Current task facts/);
  assert.match(text, /has no verified packet reference yet/); assert.doesNotMatch(text, /Native entry reference \(for --entry\)/);
  const entryId = latestSessionPrompt(f.root, f.event.session_id).entryId!;
  assert.equal(existsSync(join(f.state, "prompt-packets", `${entryId}.json`)), false);
  assert.equal(existsSync(join(f.state, "prompt-entries", `${entryId}.json`)), false);
  release(); const prepared = await current; assert.equal(entryFor(f, prompt).familyId, anchor.entryId);
  assert.deepEqual(await f.submit({ prompt }), prepared); assert.equal(wires.length, 2);
  assert.deepEqual(readFileSync(join(f.state, "prompt-packets", `${anchor.entryId}.json`)), original);
});

test("late original preparation cannot relabel superseded mandatory guidance as current after steering", async t => {
  const f = fixture(t, true); let started!: () => void, release!: () => void;
  const observed = new Promise<void>(resolve => { started = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const wires = transport(t, async (_wire, call) => { if (call === 1) { started(); await gate; } });
  const original = f.submit(); await observed;
  const currentGuidance = "Current mandatory guidance: preserve the new settlement authority.\n";
  writeFileSync(join(f.root, "AGENTS.md"), currentGuidance);
  const changed = await f.submit({ prompt: "Pause and explain the current settlement authority." });
  assert.match((changed as any).hookSpecificOutput.additionalContext, /Current mandatory guidance: preserve the new settlement authority/);
  release(); const text = (await original as any).hookSpecificOutput.additionalContext;
  assert.equal(wires.length, 1); assert.match(text, /superseded while preparing/);
  assert.doesNotMatch(text, /Required current guidance:/); assert.doesNotMatch(text, /Required current guidance: authorization/);
  assert.doesNotMatch(text, /Quoted optional evidence|Native entry reference \(for --entry\)/);
  const old = entryFor(f, f.event.prompt); assert.equal(old.status, "superseded"); assert.equal(old.taskFacts.delivered, false);
  assert.equal(old.factsRendering, null); assert.equal(old.historyDelivered, false);
});

test("missing original packet cannot manufacture fresh paid entry authority, even after original restoration", async t => {
  const f = fixture(t, true), wires = transport(t); await f.submit(); const anchor = f.entries()[0]!;
  const path = join(f.state, "prompt-packets", `${anchor.entryId}.json`), original = readFileSync(path); rmSync(path);
  const prompt = "Inspect reconnect cleanup after the prior packet failure.";
  const changed = await f.submit({ prompt }), child = entryFor(f, prompt), calls = wires.length;
  assert.equal(child.accountingAnchor.ready, false); assert.equal(child.familyId, anchor.entryId);
  assert.match((changed as any).hookSpecificOutput.additionalContext, /original-preparation-unavailable-or-incomplete/);
  writeFileSync(path, original);
  const result = await contextRouteCommand(["--entry", child.entryId, "--expansion", "1", "--task", prompt], f.root, f.assetRoot, undefined, { session: f.event.session_id });
  assert.equal(result.expansion?.status, "local-only"); assert.equal(wires.length, calls);
});

test("tampered steering family/anchor relations and foreign workspaces fail closed without a new pool", async t => {
  const f = fixture(t); await f.submit(); const prompt = "Inspect reconnect cleanup after steering."; await f.submit({ prompt });
  const child = entryFor(f, prompt), path = join(f.state, "prompt-entries", `${child.entryId}.json`), original = readFileSync(path);
  for (const mutate of [(entry: any) => { entry.familyId = entry.entryId; entry.accountingAnchor = null; },
    (entry: any) => { delete entry.familyId; delete entry.accountingAnchor; },
    (entry: any) => { entry.accountingAnchor.reservationDigest = digest("other-original"); },
    (entry: any) => { entry.accountingAnchor.entryDigest = digest("other-entry"); },
    (entry: any) => { entry.predecessor.entryId = "f".repeat(64); }, (entry: any) => { entry.predecessor.claimDigest = digest("other-predecessor"); },
    (entry: any) => { entry.turn = "other-turn"; }, (entry: any) => { entry.session = "other-chat"; }]) {
    const entry = JSON.parse(original.toString()); mutate(entry); writeFileSync(path, JSON.stringify(entry));
    assert.throws(() => readPreparedPrompt(f.root, child.entryId, f.assetRoot, f.event.session_id));
  }
  writeFileSync(path, original);
  const sibling = join(f.root, "sibling"); mkdirSync(sibling); execFileSync("git", ["init", "-q"], { cwd: sibling, stdio: "pipe" });
  assert.throws(() => readPreparedPrompt(sibling, child.entryId, f.assetRoot, f.event.session_id), /unavailable in/);
});

test("an invalid original turn claim gives current local guidance without creating a replacement family", async t => {
  const f = fixture(t, true), wires = transport(t); await f.submit(); const anchor = f.entries()[0]!, calls = wires.length;
  const key = promptTurnKey("codex", f.root, anchor.worktreeLocator, f.event.session_id, f.event.turn_id);
  const path = join(f.state, "prompt-preparations", digest(f.event.session_id).slice(7), `${key}.json`), original = readFileSync(path);
  for (const field of ["entryId", "workspace", "worktreeLocator", "session", "turn", "promptDigest"]) {
    const marker = JSON.parse(original.toString()); marker[field] = field === "entryId" ? "f".repeat(64) : "other-unverified"; writeFileSync(path, JSON.stringify(marker));
    const output = await f.submit({ prompt: `Inspect reconnect after invalid original ${field}.` });
    assert.equal(wires.length, calls); assert.match((output as any).hookSpecificOutput.additionalContext, /original-accounting-unverified/);
    assert.doesNotMatch((output as any).hookSpecificOutput.additionalContext, /Native entry reference \(for --entry\)/);
    assert.equal(f.entries().length, 1);
  }
  writeFileSync(path, original);
  const db = new DatabaseSync(join(f.state, DECISION_BUDGET_FILE), { readOnly: true });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM context_family").get()!.n, 1); db.close();
});

test("turn-level native usage stays unallocated across steered entries and preserves earlier immutable receipts", async t => {
  const f = fixture(t); await f.submit(); const anchor = f.entries()[0]!, transcript = join(f.root, "host-usage.jsonl");
  const record = { type: "token_usage_record", payload: { thread_id: f.event.session_id, turn_id: f.event.turn_id, response_id: "synthetic-original-response", usage: { input_tokens: 20, output_tokens: 4 } } };
  writeFileSync(transcript, JSON.stringify(record) + "\n"); assert.equal(importContextUsage(f.root, anchor.entryId, transcript).recorded, 1);
  const observations = join(f.state, "context-observations"), before = readdirSync(observations).map(file => ({ file, bytes: readFileSync(join(observations, file)) }));
  const prompt = "Give me progress after the first response."; await f.submit({ prompt }); const child = entryFor(f, prompt);
  for (const entry of [anchor, child]) {
    const result = importContextUsage(f.root, entry.entryId, transcript);
    assert.equal(result.recorded, 0); assert.equal(result.storeProjection, "unallocated-multiple-prompts"); assert.equal(result.confirmedModelUse, null);
  }
  for (const original of before) assert.deepEqual(readFileSync(join(observations, original.file)), original.bytes);
});
