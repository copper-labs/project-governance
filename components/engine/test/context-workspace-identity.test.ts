import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath, workContext } from "../../harness/src/store/location.ts";
import { contextWorkspaceIdentity, contextWorkspaceAlignmentMessage } from "../src/context-workspace-identity.ts";
import { contextDoctor } from "../src/context-doctor.ts";
import { promptContext, renderPromptContext } from "../src/prompt-context.ts";
import { contextStateRoot } from "../src/context-command.ts";
import { readPromptEntry, collectContextHostUsage } from "../src/context-observations.ts";
import { PROJECT_DEFAULTS } from "../src/runtime-project-defaults.ts";
import { startupHooks } from "../src/startup-hooks.ts";
import { fileDigest } from "../src/core.ts";
import { parse } from "yaml";
import { contextBudget } from "../src/checkers/context-router.ts";

function fixture() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "context-workspace-"))), main = join(base, "main"), linked = join(base, "linked");
  const environment = { ...process.env };
  process.env.XDG_STATE_HOME = join(base, "state"); process.env.HARNESS_SESSION = "host-session";
  mkdirSync(join(main, "config/governance"), { recursive: true });
  for (const path of ["config/governance/profile.yaml", "config/governance/facts.lock.yaml"]) writeFileSync(join(main, path), PROJECT_DEFAULTS[path]!);
  writeFileSync(join(main, "rules.md"), "Required local fixture guidance.\n");
  writeFileSync(join(main, "parser.ts"), "export const parser = 'synthetic';\n");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: main, stdio: "pipe" });
  git("init", "-q"); git("add", ".");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture");
  git("worktree", "add", "--detach", "-q", linked, "HEAD");
  mkdirSync(join(main, ".codex"));
  writeFileSync(join(main, ".codex/hooks.json"), startupHooks({}, main, join(main, ".governance/startup.sqlite")).content);
  for (const root of [main, linked]) {
    mkdirSync(join(root, ".governance/runtime/bin"), { recursive: true });
    writeFileSync(join(root, ".governance/runtime/bin/project-governance"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  }
  const bind = (root = linked, session = "host-session") => {
    const store = new Store(defaultDbPath(root)), where = workContext(root);
    try {
      const task = store.createTask("Synthetic bound task", [], { ...where, session });
      const attempt = store.bind(task.taskId, session, store.workspace(where.locator, root), root);
      return { task, attempt };
    } finally { store.close(); }
  };
  return { base, main, linked, git, bind, cleanup() { process.env = environment; rmSync(base, { recursive: true, force: true }); } };
}

test("missing task stores and foreign sessions stay unknown without creating state", () => {
  const f = fixture();
  try {
    const path = defaultDbPath(f.main);
    assert.equal(contextWorkspaceIdentity(f.main).status, "task-store-unavailable"); assert.equal(existsSync(path), false);
    f.bind();
    const before = fileDigest(path), result = contextWorkspaceIdentity(f.main, "foreign-session");
    assert.equal(result.status, "session-unbound"); assert.equal(result.alignmentRequired, false);
    assert.equal(fileDigest(path), before); assert.equal(contextWorkspaceAlignmentMessage(result), "");
  } finally { f.cleanup(); }
});

test("shared main hook definitions are normal when this chat is explicitly bound in its execution worktree", () => {
  const f = fixture();
  try {
    const linked = f.bind(), main = f.bind(f.main);
    for (const [root, task] of [[f.linked, linked.task], [f.main, main.task]] as const) {
      const identity = contextWorkspaceIdentity(root);
      assert.equal(identity.status, "local-bound"); assert.equal(identity.paidSelectionAllowed, true);
      assert.equal(identity.alignmentRequired, false); assert.equal(contextWorkspaceAlignmentMessage(identity), "");
      assert.ok(identity.bindings.some(binding => binding.taskId === task.taskId));
      const doctor = contextDoctor(root);
      assert.equal(doctor.promptHook, "configured");
      assert.ok(!doctor.findings.some(item => item.id === "context.session-workspace-alignment"));
    }
    assert.equal(contextDoctor(f.linked).promptHookSource?.definitionRoot, f.main);
  } finally { f.cleanup(); }
});

test("a native primary prompt with an external explicit bind delivers local fallback without provider calls or retargeting", async () => {
  const f = fixture(), fetch = globalThis.fetch;
  try {
    const { task } = f.bind(), profilePath = join(f.main, "config/governance/profile.yaml");
    const profile = parse(readFileSync(profilePath, "utf8"));
    profile.context_router = { default_route: "local", routes: [{ id: "local", primary_context: ["rules.md"] }] };
    profile.continuity ??= {}; profile.continuity.decisions = { mode: "auto", allowed_data_classes: ["metadata", "source"],
      allowed_metadata_paths: ["**"], allowed_source_paths: ["**"], consumers: { DL03: { mode: "auto", questions: ["context.metadata-relevance/1"] } } };
    writeFileSync(profilePath, JSON.stringify(profile)); process.env.JEV_TOKEN = "fixture-only";
    let calls = 0; globalThis.fetch = async () => { calls++; throw new Error("Wrong workspace must not call the provider"); };
    const before = fileDigest(defaultDbPath(f.main)), event = { hook_event_name: "UserPromptSubmit", session_id: "host-session",
      turn_id: "synthetic-turn", cwd: f.main, prompt: "Synthetic prompt must not enter a diagnostic receipt" };
    const packet = await promptContext("codex", event, f.main, { environment: {}, assetRoot: resolve("src/project_governance_runtime/assets/skills") });
    const text = (packet as any).hookSpecificOutput.additionalContext;
    assert.match(text, /Hosted selection is paused/); assert.match(text, /Required local fixture guidance/);
    assert.ok(text.includes(f.main) && text.includes(f.linked)); assert.equal(calls, 0);
    const root = contextStateRoot(f.main), id = readdirSync(join(root, "prompt-entries"))[0]!.slice(0, -5), entry = readPromptEntry(f.main, id);
    assert.equal(entry.workspace, f.main); assert.equal(entry.scopeKind, "provisional-session");
    assert.equal(entry.selectionReason, "native-workspace-alignment-required"); assert.equal(entry.binding && (entry.binding as any).taskId, null);
    assert.equal((entry.workspaceIdentity as any).targetSelection, "not-performed");
    assert.ok(!JSON.stringify(entry).includes(event.prompt)); assert.equal(fileDigest(defaultDbPath(f.main)), before);
    assert.equal(existsSync(join(contextStateRoot(f.linked), "prompt-entries")), false);
    assert.throws(() => readPromptEntry(f.linked, id), /unavailable in/);
    const transcript = join(f.base, "native-usage.jsonl");
    writeFileSync(transcript, JSON.stringify({ type: "token_usage_record", payload: { thread_id: event.session_id,
      root_turn_id: event.turn_id, response_id: "synthetic-response", usage: { input_tokens: 17, output_tokens: 3 } } }) + "\n");
    assert.equal(collectContextHostUsage(f.main, event.session_id, transcript).state, "observed");
    const store = new Store(defaultDbPath(f.main), { readOnly: true });
    try { assert.equal(store.usageTotals(task.taskId).inputTokens, null); }
    finally { store.close(); }
    const diagnosis = contextDoctor(f.main);
    assert.equal(diagnosis.workspaceIdentity.status, "external-binding");
    assert.ok(diagnosis.findings.some(item => item.id === "context.session-workspace-alignment"));
  } finally { globalThis.fetch = fetch; f.cleanup(); }
});

test("multiple external bindings are reported without choosing a target", () => {
  const f = fixture();
  try {
    f.bind(); const second = join(f.base, "second"); f.git("worktree", "add", "--detach", "-q", second, "HEAD"); f.bind(second);
    const result = contextWorkspaceIdentity(f.main);
    assert.equal(result.status, "ambiguous-bindings"); assert.equal(result.paidSelectionAllowed, false);
    assert.deepEqual(new Set(result.bindings.map(binding => binding.workspace)), new Set([f.linked, second]));
    assert.equal(result.targetSelection, "not-performed");
  } finally { f.cleanup(); }
});

test("stale task versions and moved worktrees remain unverified rather than a claimed mismatch", () => {
  const f = fixture();
  try {
    const { task } = f.bind(), store = new Store(defaultDbPath(f.main));
    try { store.reviseTask(task.taskId, [], { expectedVersion: task.version, outcome: "Changed synthetic intent" }); }
    finally { store.close(); }
    const stale = contextWorkspaceIdentity(f.main);
    assert.equal(stale.status, "binding-unverified"); assert.equal(stale.invalidBindings, 1); assert.equal(stale.alignmentRequired, false);
    const current = f.bind(), oldLocator = workContext(f.linked).locator;
    f.git("worktree", "remove", "--force", f.linked); f.git("worktree", "add", "--detach", "-q", f.linked, "HEAD");
    assert.notEqual(workContext(f.linked).locator, oldLocator);
    const recreated = contextWorkspaceIdentity(f.main);
    assert.equal(recreated.status, "binding-unverified"); assert.equal(recreated.alignmentRequired, false);
    assert.ok(!recreated.bindings.some(binding => binding.taskId === current.task.taskId));
  } finally { f.cleanup(); }
});

test("an incomplete bounded binding scan pauses advice without inventing a workspace", () => {
  const f = fixture(), inspect = Store.prototype.sessionBindings;
  try {
    f.bind(); Store.prototype.sessionBindings = () => ({ bindings: [], truncated: true });
    const result = contextWorkspaceIdentity(f.main);
    assert.equal(result.status, "binding-scan-incomplete"); assert.equal(result.alignmentRequired, false);
    assert.equal(result.paidSelectionAllowed, false); assert.deepEqual(result.bindings, []);
    assert.match(contextWorkspaceAlignmentMessage(result), /inventory is incomplete/);
  } finally { Store.prototype.sessionBindings = inspect; f.cleanup(); }
});

test("closed tasks and foreign repository pointers cannot establish external-workspace alignment", () => {
  const f = fixture();
  try {
    const { task } = f.bind(), store = new Store(defaultDbPath(f.main));
    try { store.reviseTask(task.taskId, [], { expectedVersion: task.version, status: "accepted", authorityRef: "synthetic-operator-acceptance" }); }
    finally { store.close(); }
    assert.equal(contextWorkspaceIdentity(f.main).status, "binding-unverified");
    const foreign = join(f.base, "foreign"); mkdirSync(foreign);
    execFileSync("git", ["init", "-q"], { cwd: foreign, stdio: "pipe" });
    const owner = new Store(defaultDbPath(f.main)), where = workContext(foreign);
    try {
      const other = owner.createTask("Synthetic foreign pointer", [], { ...where, session: "foreign-pointer" });
      owner.bind(other.taskId, "foreign-pointer", owner.workspace(where.locator, foreign), foreign);
    } finally { owner.close(); }
    const result = contextWorkspaceIdentity(f.main, "foreign-pointer");
    assert.equal(result.status, "binding-unverified"); assert.equal(result.alignmentRequired, false); assert.deepEqual(result.bindings, []);
  } finally { f.cleanup(); }
});

test("identity inspection inherits the operation deadline and keeps a verified local bind authoritative on scan overflow", () => {
  const f = fixture(), inspect = Store.prototype.sessionBindings;
  try {
    f.bind();
    const elapsed = contextWorkspaceIdentity(f.main, "host-session", { deadlineAt: performance.now() - 1 });
    assert.equal(elapsed.status, "binding-scan-incomplete"); assert.equal(elapsed.alignmentRequired, false);
    assert.equal(elapsed.paidSelectionAllowed, false); assert.deepEqual(elapsed.bindings, []);
    f.bind(f.main); Store.prototype.sessionBindings = () => ({ bindings: [], truncated: true });
    const local = contextWorkspaceIdentity(f.main);
    assert.equal(local.status, "local-bound"); assert.equal(local.paidSelectionAllowed, true);
    assert.equal(contextWorkspaceAlignmentMessage(local), "");
  } finally { Store.prototype.sessionBindings = inspect; f.cleanup(); }
});

test("alignment notices reserve native bytes and remain visible when intact required guidance cannot fit", () => {
  const notice = "Known native workspace differs from explicit task binding. " + "界".repeat(400);
  const packet = { receiptId: "synthetic-route", ready: true, entries: [{ path: "rules.md", sourceDigest: "digest", content: "A".repeat(19000) }],
    route: { primary: ["rules.md"], active: [], budget: contextBudget({ total_context_tokens: 6000 }) },
    skills: { entries: [] }, blockers: [], optional: { entries: [{ id: "optional.md", sourceDigest: "digest", excerpt: "B".repeat(10000) }] } } as any;
  const history = { state: "unavailable" as const, candidates: [], inspected: 0, omissions: [] };
  const ready = renderPromptContext(packet, history, "synthetic-entry", notice);
  assert.equal(ready.status, "prepared"); assert.ok(ready.text.includes(packet.entries[0].content));
  assert.ok(ready.text.includes(notice)); assert.ok(Buffer.byteLength(ready.text) <= 24000);
  packet.entries[0].content = "A".repeat(21000);
  const blocked = renderPromptContext(packet, history, "synthetic-entry", notice);
  assert.equal(blocked.status, "blocked"); assert.ok(blocked.text.includes(notice));
  assert.match(blocked.text, /prompt-required-byte-budget/); assert.ok(Buffer.byteLength(blocked.text) <= 8000);
  assert.ok(!blocked.text.includes(packet.entries[0].content));
});
