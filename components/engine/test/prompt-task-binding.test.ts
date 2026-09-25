import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promptContext } from "../src/prompt-context.ts";
import { contextStateRoot } from "../src/context-command.ts";
import { PROJECT_DEFAULTS } from "../src/runtime-project-defaults.ts";
import { promptEntryTaskBinding, readPromptEntry, importContextUsage, collectContextHostUsage } from "../src/context-observations.ts";
import { digest, durableJson } from "../src/core.ts";
import { resolveTaskContext } from "../src/decision-task-binding.ts";
import { providerContext } from "../src/provider-context.ts";
import { contextDoctor } from "../src/context-doctor.ts";
import { startupHooks } from "../src/startup-hooks.ts";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath } from "../../harness/src/store/location.ts";

const assets = resolve("src/project_governance_runtime/assets/skills"), cli = resolve("components/engine/src/cli.ts");
function fixture() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "prompt-bind-"))), root = join(base, "repo");
  const old = { state: process.env.XDG_STATE_HOME, session: process.env.HARNESS_SESSION };
  process.env.XDG_STATE_HOME = join(base, "state"); process.env.HARNESS_SESSION = "owner-session";
  mkdirSync(join(root, "config/governance"), { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: root, stdio: "pipe" });
  for (const path of ["config/governance/profile.yaml", "config/governance/facts.lock.yaml"]) writeFileSync(join(root, path), PROJECT_DEFAULTS[path]!);
  writeFileSync(join(root, "parser.ts"), "export function parse() { return 'original'; }\n");
  const event = { hook_event_name: "UserPromptSubmit", session_id: "owner-session", turn_id: "turn-one", cwd: root, prompt: "Fix parser behavior" };
  const run = (...args: string[]) => JSON.parse(execFileSync(process.execPath, [cli, "harness", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  const entryId = () => readdirSync(join(contextStateRoot(root), "prompt-entries"))[0]!.slice(0, -5);
  const cleanup = () => {
    if (old.state === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = old.state;
    if (old.session === undefined) delete process.env.HARNESS_SESSION; else process.env.HARNESS_SESSION = old.session;
    rmSync(base, { recursive: true, force: true });
  };
  return { root, base, event, run, entryId, cleanup };
}

function turnMarker(f: ReturnType<typeof fixture>, entry: ReturnType<typeof readPromptEntry>) {
  durableJson(join(contextStateRoot(f.root), "prompt-preparations", digest(f.event.session_id).slice(7), `${digest(entry.turn).slice(7)}.json`),
    { version: 1, entryId: entry.entryId, session: f.event.session_id, turn: entry.turn, submittedAt: entry.submittedAt });
}

test("normal task create links its provisional prompt without rewriting intent; resume and hook replay keep it", async () => {
  const f = fixture();
  try {
    const original = await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
    const id = f.entryId(), path = join(contextStateRoot(f.root), "prompt-entries", `${id}.json`), bytes = readFileSync(path, "utf8");
    const task = f.run("task", "create", "--outcome", "Correct parser", "--session", "owner-session");
    assert.equal(task.contextEntry.status, "linked"); assert.equal(task.contextEntry.entryId, id);
    const entry = readPromptEntry(f.root, id), binding = promptEntryTaskBinding(f.root, entry);
    assert.equal(entry.scopeKind, "provisional-session"); assert.equal(binding?.taskId, task.task.taskId);
    assert.equal(readFileSync(path, "utf8"), bytes);
    const resumed = f.run("resume", "--task", task.task.taskId, "--session", "owner-session");
    assert.equal(resumed.contextEntry.replay, true);
    const routeCount = readdirSync(join(contextStateRoot(f.root), "routes")).length;
    assert.deepEqual(await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets }), original);
    assert.equal(readdirSync(join(contextStateRoot(f.root), "routes")).length, routeCount);
    assert.equal(readFileSync(path, "utf8"), bytes);
    const context = resolveTaskContext(f.root, { session: "owner-session" }).context!;
    const provider = await providerContext(f.root, context, {}, assets);
    assert.equal("promptEntry" in provider.delivery && provider.delivery.promptEntry?.entryId, id);
    writeFileSync(join(f.root, "parser.ts"), "export function parse() { return 'changed'; }\n");
    const stale = await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
    assert.match((stale as any).hookSpecificOutput.additionalContext, /No selection was repeated/);
    assert.equal(readFileSync(path, "utf8"), bytes);
  } finally { f.cleanup(); }
});

test("another task cannot retarget an associated entry or its native usage", async () => {
  const f = fixture();
  try {
    await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
    const first = f.run("task", "create", "--outcome", "First task");
    const second = f.run("task", "create", "--outcome", "Different task");
    assert.equal(second.contextEntry.reason, "entry-already-associated");
    const id = f.entryId();
    assert.equal(promptEntryTaskBinding(f.root, readPromptEntry(f.root, id))?.taskId, first.task.taskId);
    const provider = await providerContext(f.root, resolveTaskContext(f.root).context!, {}, assets);
    assert.equal("promptEntry" in provider.delivery && provider.delivery.promptEntry, null);
    const transcript = join(f.base, "usage.jsonl");
    writeFileSync(transcript, JSON.stringify({ type: "token_usage_record", payload: { thread_id: f.event.session_id,
      root_turn_id: f.event.turn_id, response_id: "response-one", usage: { input_tokens: 15, output_tokens: 3 } } }) + "\n");
    assert.equal(importContextUsage(f.root, id, transcript).recorded, 1);
    assert.equal(importContextUsage(f.root, id, transcript).duplicates, 1);
    const store = new Store(defaultDbPath(f.root), { readOnly: true });
    try { assert.equal(store.usageTotals(first.task.taskId).inputTokens, 15); assert.notEqual(store.usageTotals(second.task.taskId).inputTokens, 15); }
    finally { store.close(); }
  } finally { f.cleanup(); }
});

test("foreign sessions cannot adopt another session's provisional prompt", async () => {
  const f = fixture();
  try {
    await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
    const other = f.run("task", "create", "--outcome", "Foreign task", "--session", "different-session");
    assert.equal(other.contextEntry.status, "not-linked");
    assert.equal(promptEntryTaskBinding(f.root, readPromptEntry(f.root, f.entryId())), null);
    const task = f.run("task", "create", "--outcome", "Own task");
    assert.equal(task.contextEntry.status, "linked");
  } finally { f.cleanup(); }
});

test("changed worktree identity and changed duplicate prompt cannot acquire a new association", async () => {
  const f = fixture();
  try {
    await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
    const id = f.entryId(), path = join(contextStateRoot(f.root), "prompt-entries", `${id}.json`);
    const changed = await promptContext("codex", { ...f.event, prompt: "An entirely different task" }, f.root, { environment: {}, assetRoot: assets });
    assert.match((changed as any).hookSpecificOutput.additionalContext, /No selection was repeated/);
    assert.equal(readdirSync(join(contextStateRoot(f.root), "prompt-entries")).length, 1);
    const entry = readPromptEntry(f.root, id); entry.worktreeLocator = "fs:another-worktree";
    writeFileSync(path, JSON.stringify(entry));
    assert.equal(f.run("task", "create", "--outcome", "Should remain unlinked").contextEntry.reason, "entry-worktree-identity-changed");
  } finally { f.cleanup(); }
});

test("doctor reports required-file bytes and unavailable sources without provider activity", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, "policy.md"), "Required policy\n");
    writeFileSync(join(f.root, "config/governance/profile.yaml"), JSON.stringify({ context_router: { default_route: "default", routes: [{ id: "default", primary_context: ["policy.md", "missing.md"], active_plan_context: ["policy.md"] }] } }));
    const report = contextDoctor(f.root);
    assert.deepEqual(report.requiredGuidance, [{ path: "policy.md", bytes: 16 }, { path: "missing.md", bytes: null }]);
    assert.ok(report.findings.some(item => item.id === "context.required-unavailable"));
    assert.equal(report.network, "not-attempted"); assert.equal(report.mutations, "none");
  } finally { f.cleanup(); }
});

test("doctor identifies a host preview limit without claiming hook trust", () => {
  const f = fixture();
  try {
    const proposal = startupHooks({}, f.root, join(f.base, "startup.sqlite"));
    const config = proposal.configuration as { hooks: Record<string, Array<{ hooks: Record<string, unknown>[] }>> };
    delete config.hooks.UserPromptSubmit![0]!.hooks[0]!.additionalContextLimit;
    mkdirSync(join(f.root, ".codex")); writeFileSync(join(f.root, ".codex/hooks.json"), JSON.stringify(config));
    const before = contextDoctor(f.root);
    assert.equal(before.status, "needs-attention"); assert.ok(before.findings.some(item => item.id === "context.prompt-hook-preview"));
    writeFileSync(join(f.root, ".codex/hooks.json"), startupHooks(config, f.root, join(f.base, "startup.sqlite")).content);
    const after = contextDoctor(f.root);
    assert.ok(!after.findings.some(item => item.id === "context.prompt-hook-preview")); assert.equal(after.hostTrust, "not-observable");
    assert.equal(after.promptHook, "missing-or-conflicting", "A tracked hook without this worktree's launcher is not ready");
    mkdirSync(join(f.root,".governance/runtime/bin"),{recursive:true});
    writeFileSync(join(f.root,".governance/runtime/bin/project-governance"),"#!/bin/sh\nexit 0\n",{mode:0o700});
    assert.equal(contextDoctor(f.root).promptHook,"configured");
    const duplicate = structuredClone(startupHooks(config, f.root, join(f.base, "startup.sqlite")).configuration) as typeof config;
    duplicate.hooks.UserPromptSubmit!.push({ hooks: [{ type: "command", timeout: 10,
      command: `'${f.root}/.governance/runtime/bin/project-governance' startup observe --provider codex --event-stdin --receipts '${join(f.base, "startup.sqlite")}'` }] });
    writeFileSync(join(f.root, ".codex/hooks.json"), JSON.stringify(duplicate));
    assert.equal(contextDoctor(f.root).promptHook, "missing-or-conflicting");
  } finally { f.cleanup(); }
});

test("long sessions bind the newest prompt and duplicate index pointers do not lose usage", async () => {
  const f = fixture();
  try {
    await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
    const id = f.entryId(), entry = readPromptEntry(f.root, id), earlier = Date.parse(String(entry.submittedAt)) - 1000;
    for (let i = 0; i < 160; i++) turnMarker(f, { entryId: digest(i).slice(7), turn: `older-${i}`, submittedAt: new Date(earlier - i).toISOString() });
    const binding = f.run("task", "create", "--outcome", "Latest intent").contextEntry;
    assert.equal(binding.entryId, id, JSON.stringify(binding));
    // Older runtime pointers can coexist with the timestamped pointer for this exact entry.
    const directory = join(contextStateRoot(f.root), "prompt-session-index", digest(f.event.session_id).slice(7));
    writeFileSync(join(directory, `${digest(f.event.turn_id).slice(7)}-${id}.json`), JSON.stringify({ entryId: id }));
    const transcript = join(f.base, "usage.jsonl");
    writeFileSync(transcript, JSON.stringify({ type: "token_usage_record", payload: { thread_id: f.event.session_id,
      root_turn_id: f.event.turn_id, response_id: "response-one", usage: { input_tokens: 15, output_tokens: 3 } } }) + "\n");
    const usage = collectContextHostUsage(f.root, f.event.session_id, transcript);
    assert.equal(usage.state, "observed"); assert.equal("recorded" in usage && usage.recorded, 1);
    assert.equal("ambiguous" in usage && usage.ambiguous, 0);
  } finally { f.cleanup(); }
});

test("ambiguous or later prompt entries cannot be guessed into a binding", async () => {
  const f = fixture();
  try {
    await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
    const id = f.entryId(), entry = readPromptEntry(f.root, id), otherId = digest("other-entry").slice(7);
    turnMarker(f, { entryId: otherId, turn: "another-turn", submittedAt: entry.submittedAt });
    assert.equal(f.run("task", "create", "--outcome", "Ambiguous intent").contextEntry.reason, "session-entry-ambiguous");
    assert.equal(promptEntryTaskBinding(f.root, entry), null);
    const later = { ...entry, entryId: digest("future-entry").slice(7), turn: "future-turn", submittedAt: new Date(Date.now() + 60000).toISOString() };
    writeFileSync(join(contextStateRoot(f.root), "prompt-entries", `${later.entryId}.json`), JSON.stringify(later));
    turnMarker(f, later);
    assert.equal(f.run("task", "create", "--outcome", "Earlier command").contextEntry.reason, "entry-after-binding-request");
    assert.equal(promptEntryTaskBinding(f.root, later), null);
  } finally { f.cleanup(); }
});

test("interrupted preparation is not repeated when the native turn is replayed", async () => {
  const f = fixture();
  try {
    await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
    const id = f.entryId(), root = contextStateRoot(f.root), routeCount = readdirSync(join(root, "routes")).length;
    rmSync(join(root, "prompt-packets", `${id}.json`));
    rmSync(join(root, "prompt-entries", `${id}.json`));
    const output = await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
    assert.match((output as any).hookSpecificOutput.additionalContext, /No selection was repeated/);
    assert.equal(readdirSync(join(root, "routes")).length, routeCount);
    assert.equal(readdirSync(join(root, "prompt-entries")).length, 0);
  } finally { f.cleanup(); }
});

test("a refused newer turn prevents task attribution to an older question", async () => {
  const f = fixture();
  try {
    await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
    const id = f.entryId();
    assert.deepEqual(await promptContext("codex", { ...f.event, turn_id: "later", prompt: "X".repeat(32001) }, f.root, { environment: {}, assetRoot: assets }), {});
    assert.equal(f.run("task", "create", "--outcome", "Implement the later request").contextEntry.reason, "session-entry-superseded");
    assert.equal(promptEntryTaskBinding(f.root, readPromptEntry(f.root, id)), null);
  } finally { f.cleanup(); }
});

test("a missing newer receipt cannot fall back to an older prompt", async () => {
  const f = fixture();
  try {
    await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
    const id = f.entryId();
    await promptContext("codex", { ...f.event, turn_id: "later", prompt: "Implement something else" }, f.root, { environment: {}, assetRoot: assets });
    for (const name of readdirSync(join(contextStateRoot(f.root), "prompt-entries"))) if (name !== `${id}.json`) rmSync(join(contextStateRoot(f.root), "prompt-entries", name));
    assert.equal(f.run("task", "create", "--outcome", "Later task").contextEntry.reason, "session-entry-superseded");
    assert.equal(promptEntryTaskBinding(f.root, readPromptEntry(f.root, id)), null);
  } finally { f.cleanup(); }
});

test("lost recording delivers local context without any paid advice", async () => {
  const f = fixture(), fetch = globalThis.fetch, token = process.env.JEV_TOKEN;
  try {
    writeFileSync(join(f.root, "policy.md"), "Keep required rules intact.\n");
    writeFileSync(join(f.root, "config/governance/profile.yaml"), JSON.stringify({ context_router: { default_route: "project", routes: [{ id: "project", primary_context: ["policy.md"] }] },
      continuity: { decisions: { mode: "auto", allowed_data_classes: ["metadata", "source"], allowed_metadata_paths: ["**"], allowed_source_paths: ["**"],
        consumers: { DL03: { mode: "auto", questions: ["context.metadata-relevance/1"] } } } } }));
    let calls = 0; globalThis.fetch = async () => { calls++; throw new Error("Unreserved provider call"); }; process.env.JEV_TOKEN = "fixture";
    // A regular file in place of the state root reliably models failed persistence on every platform.
    const state = contextStateRoot(f.root); mkdirSync(join(state, ".."), { recursive: true }); writeFileSync(state, "unwritable state");
    for (let i = 0; i < 2; i++) {
      const output = await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
      assert.match((output as any).hookSpecificOutput.additionalContext, /Keep required rules intact/);
      assert.match((output as any).hookSpecificOutput.additionalContext, /parser.ts/);
    }
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = fetch; if (token === undefined) delete process.env.JEV_TOKEN; else process.env.JEV_TOKEN = token;
    f.cleanup();
  }
});

test("explicit task fork links the current provisional entry to the child only", async () => {
  const f = fixture();
  try {
    const parent = f.run("task", "create", "--outcome", "Parent work", "--session", "parent-session");
    await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
    const child = f.run("task", "fork", "--task", parent.task.taskId, "--outcome", "Child work");
    assert.equal(child.contextEntry.status, "linked");
    assert.equal(promptEntryTaskBinding(f.root, readPromptEntry(f.root, f.entryId()))?.taskId, child.task.taskId);
  } finally { f.cleanup(); }
});

test("a throwing analytics observer cannot change task-create success", () => {
  const f = fixture();
  try {
    const source = pathToFileURL(resolve("components/harness/src/cli.ts")).href;
    const script = `import {continuityCommand} from ${JSON.stringify(source)}; process.exitCode=continuityCommand(['task','create','--outcome','Successful creation'],{observeBinding(){throw Error('Lost analytics');}});`;
    const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: f.root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    assert.equal(result.ok, true); assert.equal(result.contextEntry.reason, "binding-observation-unavailable");
    assert.equal(f.run("task", "show", "--task", result.task.taskId).task.outcome, "Successful creation");
  } finally { f.cleanup(); }
});

test("concurrent duplicate hooks prepare only once", async () => {
  const f = fixture();
  try {
    const pending = promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
    const duplicate = await promptContext("codex", f.event, f.root, { environment: {}, assetRoot: assets });
    assert.match((duplicate as any).hookSpecificOutput.additionalContext, /No selection was repeated/);
    assert.match((await pending as any).hookSpecificOutput.additionalContext, /parser.ts/);
    assert.equal(readdirSync(join(contextStateRoot(f.root), "routes")).length, 1);
  } finally { f.cleanup(); }
});
