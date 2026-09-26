import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, realpathSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { promptContext } from "../src/prompt-context.ts";
import { contextRouteCommand } from "../src/context-route-command.ts";
import { contextStateRoot } from "../src/context-command.ts";
import { PROJECT_DEFAULTS } from "../src/runtime-project-defaults.ts";
import { readDecisionBudget, contextFamilyScope, DECISION_BUDGET_FILE } from "../src/decision-budget.ts";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath } from "../../harness/src/store/location.ts";
import { DatabaseSync } from "node:sqlite";

const assets = resolve("src/project_governance_runtime/assets/skills"), cli = resolve("components/engine/src/cli.ts");
function fixture(t: TestContext, paid: boolean) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "context-switch-"))), root = join(base, "repo");
  const previous = { state: process.env.XDG_STATE_HOME, session: process.env.HARNESS_SESSION, token: process.env.JEV_TOKEN };
  process.env.XDG_STATE_HOME = join(base, "state"); process.env.HARNESS_SESSION = "owner-session";
  if (paid) process.env.JEV_TOKEN = "synthetic-fixture-token"; else delete process.env.JEV_TOKEN;
  mkdirSync(join(root, "config/governance"), { recursive: true }); execFileSync("git", ["init", "-q"], { cwd: root });
  writeFileSync(join(root, "config/governance/facts.lock.yaml"), PROJECT_DEFAULTS["config/governance/facts.lock.yaml"]!);
  writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify({ context_router: { default_route: "default", routes: [{ id: "default" }] },
    continuity: { decisions: { mode: "auto", allowed_data_classes: ["metadata", "source"], allowed_metadata_paths: ["*.ts"], allowed_source_paths: ["*.ts"],
      budget: { max_calls: 2, max_request_bytes: 1048576 }, consumers: { DL03: { mode: "auto", questions: ["context.metadata-relevance/1"] } } } } }));
  writeFileSync(join(root, "first.ts"), "/** First task implementation. */\nexport const first=1;\n");
  writeFileSync(join(root, "second.ts"), "/** Second task implementation. */\nexport const second=2;\n");
  const run = (...args: string[]) => JSON.parse(execFileSync(process.execPath, [cli, "harness", ...args], { cwd: root, encoding: "utf8" }));
  t.after(() => {
    for (const [name, value] of [["XDG_STATE_HOME", previous.state], ["HARNESS_SESSION", previous.session], ["JEV_TOKEN", previous.token]])
      if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
    rmSync(base, { recursive: true, force: true });
  });
  return { root, run, state: contextStateRoot(root), event: { hook_event_name: "UserPromptSubmit", session_id: "owner-session", turn_id: "turn-one", cwd: root, prompt: "Fix the second implementation" } };
}

test("task switch refreshes on the normal route, preserves paid budget and cannot rewrite historical context", async t => {
  const f = fixture(t, true); let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    calls++; const wire = JSON.parse(String(init.body));
    return Response.json({ model: "jev-1.13.0", answers: Object.fromEntries(Object.keys(wire.questions).map(name => [name, { type: "noul", noul: 0.9 }])) });
  });
  const first = f.run("task", "create", "--outcome", "Work on first", "--scope", f.root);
  await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
  assert.equal(calls, 1);
  const entryPath = join(f.state, "prompt-entries", readdirSync(join(f.state, "prompt-entries"))[0]!);
  const original = readFileSync(entryPath, "utf8"), entry = JSON.parse(original);
  const second = f.run("task", "create", "--outcome", "Work on second", "--scope", f.root);
  assert.equal(second.contextEntry.status, "refresh-required");
  const replayedHook = await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
  assert.match(JSON.stringify(replayedHook), /context-route --task/);
  assert.doesNotMatch(JSON.stringify(replayedHook), /new operator turn/);
  const args = ["--task", f.event.prompt, "--optional-path", "second.ts"];
  const packet = await contextRouteCommand(args, f.root, assets);
  assert.equal(packet.selection.binding.taskId, second.task.taskId);
  assert.equal(packet.expansion?.entry, entry.entryId); assert.ok(packet.expansion?.transitionId);
  assert.equal(packet.metadata?.coverage.replayedBatches, 0);
  assert.equal(packet.metadata?.reason, "answered"); assert.equal(calls, 2);
  const repeated = await contextRouteCommand(args, f.root, assets);
  assert.equal(repeated.expansion?.step, 1); assert.equal(calls, 2);
  assert.equal(repeated.timing.providerCallMs, 0, "Historical calls are not current retrieval latency");
  assert.equal(readDecisionBudget(f.state, contextFamilyScope(f.root, entry.entryId))?.calls, 2);
  f.run("task", "create", "--outcome", "Work on third", "--scope", f.root);
  const exhausted = await contextRouteCommand(["--task", "A new request for third"], f.root, assets);
  assert.equal(exhausted.ready, true); assert.equal(exhausted.metadata?.reason, "budget-exhausted"); assert.equal(calls, 2);
  assert.equal(f.run("resume", "--task", first.task.taskId).contextEntry.status, "refresh-required");
  const returned = await contextRouteCommand(["--task", "Back to the first task"], f.root, assets);
  assert.equal(returned.expansion?.entry, entry.entryId); assert.equal(returned.ready, true);
  assert.equal(calls, 2, "Returning to the original task must not open new spending");
  const accounting = new DatabaseSync(join(f.state, DECISION_BUDGET_FILE));
  accounting.prepare("UPDATE context_family SET expires=0 WHERE id=?").run(entry.entryId); accounting.close();
  const expired = await contextRouteCommand(["--task", "Refresh after expiry"], f.root, assets);
  assert.equal(expired.expansion?.entry, entry.entryId); assert.equal(expired.ready, true);
  assert.equal(calls, 2, "Expiry cannot be mistaken for a newly observed turn");
  assert.equal(readFileSync(entryPath, "utf8"), original);
});

test("slow preparation retains selection time; expired operations return local context without a call", async t => {
  const f = fixture(t, true); let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    calls++; const wire = JSON.parse(String(init.body));
    return Response.json({ model: "jev-1.13.0", answers: Object.fromEntries(Object.keys(wire.questions).map(name => [name, { type: "noul", noul: 0.9 }])) });
  });
  f.run("task", "create", "--outcome", "Work on first", "--scope", f.root);
  const slow = await contextRouteCommand(["--task", "First implementation"], f.root, assets, undefined,
    { operationStartedAt: performance.now() - 5500 });
  assert.equal(slow.metadata?.reason, "answered"); assert.equal(calls, 1);
  assert.ok(slow.timing.preparationMs >= 5500); assert.equal(slow.timing.limitReason, null);
  const late = await contextRouteCommand(["--task", "Second implementation"], f.root, assets, undefined,
    { operationStartedAt: performance.now() - 11000 });
  assert.equal(late.ready, true); assert.equal(late.metadata?.reason, "cancelled"); assert.equal(calls, 1);
  assert.equal(late.timing.limitReason, "operation-deadline"); assert.equal(late.timing.providerCallMs, 0);
});

test("task revision refreshes normally, while a closed task cannot use an old entry", async t => {
  const f = fixture(t, false), first = f.run("task", "create", "--outcome", "Original intent", "--scope", f.root);
  await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
  const revised = f.run("task", "revise", "--task", first.task.taskId, "--expected-version", "1", "--outcome", "Changed intent");
  assert.equal(revised.contextEntry.status, "refresh-required");
  const packet = await contextRouteCommand(["--task", "Changed intent"], f.root, assets);
  assert.equal(packet.selection.binding.revision, "2"); assert.ok(packet.expansion?.transitionId);
  const store = new Store(defaultDbPath(f.root));
  try { store.reviseTask(first.task.taskId, [], { status: "cancelled", expectedVersion: 2 }); } finally { store.close(); }
  await assert.rejects(contextRouteCommand(["--entry", revised.contextEntry.entryId, "--expansion", "1", "--task", "Closed"],
    f.root, assets), /missing, closed or mismatched/);
});

test("a task switch during provider selection refuses delivery to the outdated binding", async t => {
  const f = fixture(t, true); let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    if (++calls === 2) f.run("task", "create", "--outcome", "Changed during selection", "--scope", f.root);
    const wire = JSON.parse(String(init.body));
    return Response.json({ model: "jev-1.13.0", answers: Object.fromEntries(Object.keys(wire.questions).map(name => [name, { type: "noul", noul: 0.9 }])) });
  });
  f.run("task", "create", "--outcome", "First task", "--scope", f.root);
  await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
  const second = f.run("task", "create", "--outcome", "Second task", "--scope", f.root);
  await assert.rejects(contextRouteCommand(["--task", "Refresh second task"], f.root, assets), /task changed while preparing/);
  assert.equal(readDecisionBudget(f.state, contextFamilyScope(f.root, second.contextEntry.entryId))?.calls, 2);
});

test("task switch without credentials keeps original reads available and rejects another session", async t => {
  const f = fixture(t, false);
  f.run("task", "create", "--outcome", "Work on first", "--scope", f.root);
  await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
  const second = f.run("task", "create", "--outcome", "Work on second", "--scope", f.root);
  const packet = await contextRouteCommand(["--task", f.event.prompt, "--optional-path", "second.ts"], f.root, assets);
  assert.equal(packet.ready, true); assert.equal(packet.selection.binding.taskId, second.task.taskId);
  assert.match(packet.optional!.entries.find(item => item.id === "second.ts")!.excerpt, /second=2/);
  assert.equal(existsSync(join(f.state, DECISION_BUDGET_FILE)), false);
  await assert.rejects(contextRouteCommand(["--entry", second.contextEntry.entryId, "--expansion", "1", "--task", "foreign"],
    f.root, assets, undefined, { session: "other-session" }), /current observed entry/);
});
