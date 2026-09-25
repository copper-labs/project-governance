import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, realpathSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { openContextFamily, beginContextRequest, finishContextRequest, reserveDecisionCall, contextFamilyScope, readDecisionBudget, DECISION_BUDGET_FILE } from "../src/decision-budget.ts";
import { promptContext } from "../src/prompt-context.ts";
import { contextRouteCommand } from "../src/context-route-command.ts";
import { contextStateRoot } from "../src/context-command.ts";
import { PROJECT_DEFAULTS } from "../src/runtime-project-defaults.ts";
import { digest } from "../src/core.ts";
import { contextMetadataCatalog, selectContextMetadata } from "../src/context-metadata.ts";
import { DecisionRuntime } from "../src/decision-runtime.ts";
import { profileDecisionSettings } from "../src/decision-settings.ts";
import type { ValidationSubject } from "../src/change-subject.ts";

test("family requests reserve once, share spending, close after two expansions and expire on admission", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "context-family-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const id = digest("entry").slice(7), started = Date.now(), identity = { id, workspace: root, locator: "fixture", session: "session", turn: "one", started };
  assert.equal(openContextFamily(root, identity), "opened");
  const scope = contextFamilyScope(root, id), limits = { maxCalls: 2, maxRequestBytes: 1000 };
  assert.equal(beginContextRequest(root, id, 0, "first").status, "reserved");
  assert.equal(beginContextRequest(root, id, 0, "first").status, "in-progress");
  assert.equal(beginContextRequest(root, id, 1, "next").status, "previous-request-incomplete");
  assert.equal(reserveDecisionCall(root, scope, "one", 100, limits, { familyId: id }).state, "reserved");
  assert.equal(finishContextRequest(root, id, 0, "first", "cursor"), true);
  assert.equal(beginContextRequest(root, id, 0, "first").status, "duplicate");
  assert.equal(beginContextRequest(root, id, 0, "other-purpose").status, "request-conflict");
  assert.equal(beginContextRequest(root, id, 1, "clarify").status, "reserved");
  assert.equal(reserveDecisionCall(root, scope, "two", 100, limits, { familyId: id }).state, "reserved");
  assert.equal(reserveDecisionCall(root, scope, "three", 100, limits, { familyId: id }).state, "exhausted");
  finishContextRequest(root, id, 1, "clarify", "cursor2"); beginContextRequest(root, id, 2, "final"); finishContextRequest(root, id, 2, "final", "cursor3");
  assert.equal(reserveDecisionCall(root, scope, "four", 100, { ...limits, maxCalls: 10 }, { familyId: id }).state, "unavailable");
  assert.equal(reserveDecisionCall(root, scope, "one", 100, limits, { familyId: id }).state, "duplicate");
  assert.equal(readDecisionBudget(root, scope)?.calls, 2);
  const fresh = digest("fresh").slice(7); openContextFamily(root, { ...identity, id: fresh, turn: "two", started: started + 1 });
  assert.equal(beginContextRequest(root, fresh, 0, "fresh", started + 16 * 60_000).status, "closed-or-unavailable");
});

test("new observed turns close older families and abandoned expiry does not exhaust capacity", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "family-expiry-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const now = Date.now();
  for (let i = 0; i < 512; i++) assert.equal(openContextFamily(root, { id: digest(i).slice(7), workspace: root, locator: "fixture", session: `s${i}`, turn: "one", started: now }, now), "opened");
  const next = { id: digest("next").slice(7), workspace: root, locator: "fixture", session: "next", turn: "one", started: now + 1 };
  assert.equal(openContextFamily(root, next, now + 1), "capacity");
  assert.equal(openContextFamily(root, { ...next, started: now + 16 * 60_000 }, now + 16 * 60_000), "opened");
  const newer = { ...next, id: digest("newer").slice(7), turn: "two", started: now + 16 * 60_000 + 1 };
  assert.equal(openContextFamily(root, newer, newer.started), "opened");
  assert.equal(beginContextRequest(root, next.id, 0, "request", newer.started).status, "closed-or-unavailable");
  const db = new DatabaseSync(join(root, DECISION_BUDGET_FILE), { readOnly: true }); assert.equal(db.prepare("PRAGMA user_version").get()!["user_version"], 2); db.close();
});

test("no-provider turns allocate no budget database and expired paid accounting cannot starve ordinary work", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "family-retention-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const now = Date.now(), id = digest("retention").slice(7), identity = { id, workspace: root, locator: "fixture", session: "session", turn: "one", started: now };
  assert.equal(openContextFamily(root, identity, now, false), "local-only"); assert.equal(existsSync(join(root, DECISION_BUDGET_FILE)), false);
  const limits = { maxCalls: 2, maxRequestBytes: 1000 }, ordinary = { workspace: root, taskId: "real-task", taskRevision: "one" };
  assert.equal(reserveDecisionCall(root, ordinary, "ordinary-1", 10, limits).state, "reserved");
  openContextFamily(root, identity, now); beginContextRequest(root, id, 0, "request", now);
  reserveDecisionCall(root, contextFamilyScope(root, id), "paid", 100, limits, { familyId: id, now: () => now });
  finishContextRequest(root, id, 0, "request", "cursor", now);
  mkdirSync(join(root, "context-cursors")); writeFileSync(join(root, "context-cursors", `${id}-0.json`), "{}");
  const later = now + 16 * 60_000;
  assert.equal(beginContextRequest(root, id, 0, "request", later).status, "closed-or-unavailable");
  assert.equal(openContextFamily(root, identity, later), "expired"); assert.equal(existsSync(join(root, "context-cursors", `${id}-0.json`)), false);
  const db = new DatabaseSync(join(root, DECISION_BUDGET_FILE), { readOnly: true });
  for (const table of ["context_request", "context_family"]) assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!["n"], 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM scope").get()!["n"], 1); db.close();
  assert.equal(reserveDecisionCall(root, ordinary, "ordinary-2", 10, limits, { now: () => later }).state, "reserved");
  assert.equal(readDecisionBudget(root, ordinary)?.calls, 2);
});

test("unchanged complete batches replay; edits invalidate the whole affected batch, and clarification keeps spend", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "family-replay-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const paths = Array.from({ length: 140 }, (_, i) => `src/${i}.ts`), scope = { workspace: root, taskId: "provisional", taskRevision: "provisional" };
  const family = digest("family").slice(7); openContextFamily(root, { id: family, workspace: root, locator: "fixture", session: "one", turn: "one", started: Date.now() });
  const contents = new Map(paths.map(path => [path, `export const name${path.match(/\d+/)![0]}=1;\n`]));
  const subject = { root, source: () => ({ file_type: "regular" }), projectionSources: (items: string[]) => ({ view: "worktree", subject: null,
    sources: new Map(items.map(path => [path, { key: digest(contents.get(path)), freshness: "fixture" }])) }),
    readBatch: (items: string[]) => new Map(items.map(path => [path, Buffer.from(contents.get(path)!)])) } as unknown as ValidationSubject;
  const settings = profileDecisionSettings({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source", "metadata"], allowed_metadata_paths: ["src/**"], allowed_source_paths: ["src/**"],
    budget: { max_calls: 32, max_request_bytes: 1048576 }, consumers: { DL03: { mode: "auto", questions: ["context.metadata-relevance/1"] } } } } });
  let calls = 0;
  const runtime = new DecisionRuntime(settings, root, { token: "fixture", fetch: async (_url, init) => { calls++; const wire = JSON.parse(String(init?.body));
    return Response.json({ model: "jev-1.13.0", answers: Object.fromEntries(Object.keys(wire.questions).map(name => [name, { type: "noul", noul: 0.9 }])) }); } });
  const catalog = contextMetadataCatalog(paths, "mechanism", [], [], new Set());
  const first = await selectContextMetadata(subject, catalog, "mechanism", runtime, scope, digest("subject"), family, undefined, performance.now() + 5000, undefined, { id: family, revision: "provisional" });
  const firstCalls = calls;
  const replay = await selectContextMetadata(subject, catalog, "mechanism", runtime, scope, digest("subject"), family, undefined, performance.now() + 5000, undefined,
    { id: family, revision: "provisional", previous: first.cursor });
  assert.equal(calls, firstCalls); assert.equal(replay.coverage.complete, true);
  const changed = first.cursor.batches[0]!.paths[0]!; contents.set(changed, "export const different=2;\n");
  const edited = await selectContextMetadata(subject, catalog, "mechanism", runtime, scope, digest("new subject"), family, undefined, performance.now() + 5000, undefined,
    { id: family, revision: "provisional", previous: first.cursor });
  assert.equal(edited.coverage.invalidatedBatches, 1); assert.equal(edited.coverage.replayedBatches, first.cursor.batches.length - 1); assert.ok(calls > firstCalls);
  const before = readDecisionBudget(root, contextFamilyScope(root, family))!.calls;
  const clarified = await selectContextMetadata(subject, catalog, "different mechanism", runtime, scope, digest("subject"), family, undefined, performance.now() + 5000, undefined,
    { id: family, revision: "provisional", previous: edited.cursor });
  assert.equal(clarified.coverage.replayedBatches, 0); assert.ok(readDecisionBudget(root, contextFamilyScope(root, family))!.calls > before);
});

test("normal prompt expansion validates session, gives explicit originals without JEV and stops a superseded entry", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "native-expansion-"))), previous = process.env.XDG_STATE_HOME;
  writeFileSync(join(root, ".gitignore"), "state/\n");
  process.env.XDG_STATE_HOME = join(root, "state"); t.after(() => { if (previous === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previous; rmSync(root, { recursive: true, force: true }); });
  execFileSync("git", ["init", "-q"], { cwd: root, stdio: "pipe" }); mkdirSync(join(root, "config/governance"), { recursive: true });
  for (const path of ["config/governance/profile.yaml", "config/governance/facts.lock.yaml"]) writeFileSync(join(root, path), PROJECT_DEFAULTS[path]!);
  writeFileSync(join(root, "app.ts"), "export const launch='ready';\n");
  const assets = resolve("src/project_governance_runtime/assets/skills"), event = { hook_event_name: "UserPromptSubmit", session_id: "native", turn_id: "first", cwd: root, prompt: "Find the launch" };
  const first = await promptContext("codex", event, root, { environment: {}, assetRoot: assets }); assert.match((first as any).hookSpecificOutput.additionalContext, /--expansion/);
  const directory = join(contextStateRoot(root), "prompt-entries"), entry = JSON.parse(readFileSync(join(directory, readdirSync(directory)[0]!), "utf8"));
  const args = ["--entry", entry.entryId, "--expansion", "1", "--task", event.prompt, "--optional-path", "app.ts"];
  await assert.rejects(contextRouteCommand(args, root, assets, undefined, { session: "wrong" }), /current observed entry/);
  const expanded = await contextRouteCommand(args, root, assets, undefined, { session: "native" }); assert.equal(expanded.expansion?.status, "local-only");
  assert.match(expanded.optional!.entries.find(item => item.id === "app.ts")!.excerpt, /ready/);
  const replay = await contextRouteCommand(args, root, assets, undefined, { session: "native" }); assert.equal(replay.expansion?.status, "local-only");
  assert.equal(existsSync(join(contextStateRoot(root), DECISION_BUDGET_FILE)), false);
  await promptContext("codex", { ...event, turn_id: "second" }, root, { environment: {}, assetRoot: assets });
  await assert.rejects(contextRouteCommand(args, root, assets, undefined, { session: "native" }), /current observed entry/);
});

test("failed explicit-original delivery retains paid progress and leaves the final expansion available", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "family-delivery-"))), previous = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state"); t.after(() => { if (previous === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previous; rmSync(root, { recursive: true, force: true }); });
  execFileSync("git", ["init", "-q"], { cwd: root, stdio: "pipe" }); mkdirSync(join(root, "config/governance"), { recursive: true });
  writeFileSync(join(root, ".gitignore"), "state/\n"); writeFileSync(join(root, "app.ts"), "export const launch='ready';\n");
  writeFileSync(join(root, "config/governance/facts.lock.yaml"), PROJECT_DEFAULTS["config/governance/facts.lock.yaml"]!);
  writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify({ context_router: { default_route: "project", routes: [{ id: "project" }] }, continuity: { decisions: {
    mode: "auto", allowed_data_classes: ["metadata"], allowed_metadata_paths: ["app.ts"],
    consumers: { DL03: { mode: "auto", questions: ["context.metadata-relevance/1"] } } } } }));
  let calls = 0;
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => { calls++; const wire = JSON.parse(String(init?.body));
    return Response.json({ model: "jev-1.13.0", answers: Object.fromEntries(Object.keys(wire.questions).map(key => [key, { type: "noul", noul: 0.9 }])) }); };
  const assets = resolve("src/project_governance_runtime/assets/skills"), options = { token: "fixture", fetch, session: "native" };
  const originalFetch = globalThis.fetch, originalToken = process.env.JEV_TOKEN;
  globalThis.fetch = fetch; process.env.JEV_TOKEN = "fixture";
  try { await promptContext("codex", { hook_event_name: "UserPromptSubmit", session_id: "native", turn_id: "one", cwd: root, prompt: "Find launch" }, root,
    { environment: {}, assetRoot: assets }); }
  finally { globalThis.fetch = originalFetch; if (originalToken === undefined) delete process.env.JEV_TOKEN; else process.env.JEV_TOKEN = originalToken; }
  const dir = join(contextStateRoot(root), "prompt-entries"), entry = JSON.parse(readFileSync(join(dir, readdirSync(dir)[0]!), "utf8"));
  const args = ["--entry", entry.entryId, "--expansion", "1", "--task", "Find launch", "--optional-path", "missing.ts"];
  await assert.rejects(contextRouteCommand(args, root, assets, undefined, options), (error: unknown) => error instanceof Error && error.cause instanceof Error && error.cause.message === "Optional source unavailable");
  const after = calls;
  await assert.rejects(contextRouteCommand(args, root, assets, undefined, options), (error: unknown) => error instanceof Error && error.cause instanceof Error && error.cause.message === "Optional source unavailable"); assert.equal(calls, after);
  const final = await contextRouteCommand(["--entry", entry.entryId, "--expansion", "2", "--task", "Find launch", "--optional-path", "app.ts"], root, assets, undefined, options);
  assert.equal(final.expansion?.status, "reserved"); assert.equal(final.expansion?.completed, true);
  assert.match(final.optional!.entries[0]!.excerpt, /ready/);
});
