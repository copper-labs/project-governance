import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promptContext, renderPromptContext } from "../src/prompt-context.ts";
import { contextStateRoot } from "../src/context-command.ts";
import { PROJECT_DEFAULTS } from "../src/runtime-project-defaults.ts";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath, workContext } from "../../harness/src/store/location.ts";
import { contextBudget } from "../src/checkers/context-router.ts";

test("raw prompt delivers source before a task exists, then a follow-up reuses the exact host binding", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "prompt-context-"))), old = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  const assets = resolve("src/project_governance_runtime/assets/skills");
  try {
    execFileSync("git", ["init", "-q"], { cwd: root, stdio: "pipe" });
    mkdirSync(join(root, "config/governance"), { recursive: true });
    for (const path of ["config/governance/profile.yaml", "config/governance/facts.lock.yaml"]) writeFileSync(join(root, path), PROJECT_DEFAULTS[path]!);
    writeFileSync(join(root, "parser.ts"), "export function parse() { return 'parsed'; }\n");
    const event = { hook_event_name: "UserPromptSubmit", session_id: "host-session", turn_id: "turn-1", cwd: root, prompt: "- Fix the parser unique-private-prompt\n- preserve tests" };
    const first = await promptContext("codex", event, root, { environment: {}, assetRoot: assets });
    assert.match((first as any).hookSpecificOutput.additionalContext, /parser.ts/);
    assert.doesNotMatch((first as any).hookSpecificOutput.additionalContext, /JEV index coverage/);
    const folder = join(contextStateRoot(root), "prompt-entries");
    const saved = JSON.parse(readFileSync(join(folder, readdirSync(folder)[0]!), "utf8"));
    assert.equal(saved.scopeKind, "provisional-session"); assert.equal(saved.confirmedModelUse, null);
    assert.ok(!JSON.stringify(saved).includes("unique-private-prompt"));
    const originalFetch = globalThis.fetch, originalToken = process.env.JEV_TOKEN;
    writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify({ context_router: { default_route: "project", routes: [{ id: "project" }] },
      continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["**"], consumers: { DL03: { mode: "auto", questions: ["context.relevance/1"] } } } } }));
    let legacyCalls = 0;
    globalThis.fetch = async () => { legacyCalls++; throw new Error("Legacy source consumers are not prompt metadata"); };
    process.env.JEV_TOKEN = "fixture";
    try {
      const legacy = await promptContext("codex", { ...event, turn_id: "legacy-profile" }, root, { environment: {}, assetRoot: assets });
      assert.match((legacy as any).hookSpecificOutput.additionalContext, /parser.ts/); assert.equal(legacyCalls, 0);
    } finally { globalThis.fetch = originalFetch; if (originalToken === undefined) delete process.env.JEV_TOKEN; else process.env.JEV_TOKEN = originalToken; }
    const store = new Store(defaultDbPath(root));
    const where = workContext(root);
    const task = store.createTask("Correct parser behaviour", [], { worktree: root, session: "host-session" });
    const prior = store.createTask("Previous parser bug", [], { worktree: root, session: "earlier" });
    const workspace = store.workspace(where.locator, root);
    store.bind(task.taskId, "host-session", workspace, root); store.close();
    const next = await promptContext("codex", { ...event, turn_id: "turn-2", prompt: "Continue" }, root, { environment: {}, assetRoot: assets });
    assert.match((next as any).hookSpecificOutput.additionalContext, /Historical background only/);
    assert.match((next as any).hookSpecificOutput.additionalContext, new RegExp(prior.taskId));
    const second = readdirSync(folder).map(name => JSON.parse(readFileSync(join(folder, name), "utf8"))).find(item => item.turn === "turn-2");
    assert.equal(second.binding.taskId, task.taskId); assert.equal(second.scopeKind, "bound-task");
    const priorContext = process.env.GOVERNANCE_DECISION_CONTEXT;
    process.env.GOVERNANCE_DECISION_CONTEXT = join(root, "stale-context.json");
    try {
      const resumed = await promptContext("codex", { ...event, turn_id: "turn-3", prompt: "Continue" }, root, { environment: {}, assetRoot: assets });
      assert.match((resumed as any).hookSpecificOutput.additionalContext, /parser.ts/);
    } finally { if (priorContext === undefined) delete process.env.GOVERNANCE_DECISION_CONTEXT; else process.env.GOVERNANCE_DECISION_CONTEXT = priorContext; }
    assert.deepEqual(await promptContext("codex", { ...event, cwd: tmpdir() }, root, { environment: {} }), {});
    assert.deepEqual(await promptContext("codex", event, root, { environment: { GOVERNANCE_PARENT_TASK: "parent" } }), {});
    assert.deepEqual(await promptContext("codex", { ...event, turn_id: undefined }, root, { environment: {} }), {});
    assert.deepEqual(await promptContext("other", event, root, { environment: {} }), {});
    mkdirSync(join(root, "subdirectory"));
    assert.match((await promptContext("codex", { ...event, turn_id: "subdirectory", cwd: join(root, "subdirectory") }, root, { environment: {}, assetRoot: assets }) as any).hookSpecificOutput.additionalContext, /parser.ts/);
  } finally {
    if (old === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = old;
    rmSync(root, { recursive: true, force: true });
  }
});

test("oversized required context is a blocker, never silently truncated guidance", () => {
  const packet = { receiptId: "route", ready: true, entries: [{ path: "policy.md", content: "A".repeat(25000), sourceDigest: "digest" }],
    route: { primary: ["policy.md"], active: [], budget: contextBudget({ total_context_tokens: 6000 }) }, skills: { entries: [] }, blockers: [], optional: null } as any;
  const output = renderPromptContext(packet, { state: "unavailable", candidates: [], inspected: 0, omissions: [] }, "entry");
  assert.equal(output.status, "blocked"); assert.match(output.text, /prompt-required-byte-budget/);
  assert.ok(Buffer.byteLength(output.text) < 1000); assert.deepEqual(output.delivered, []);
  packet.entries[0].content = "A".repeat(21400);
  const bounded = renderPromptContext(packet, { state: "ready", candidates: [{ summary: "B".repeat(3000) }] as any, inspected: 1, omissions: [] }, "entry");
  assert.equal(bounded.status, "prepared"); assert.ok(Buffer.byteLength(bounded.text) <= 24000);
  assert.equal("historyDelivered" in bounded && bounded.historyDelivered, false);
  packet.entries[0].content = "required";
  packet.metadata = { coverage: { attempted: true, complete: false, answeredCount: 63, eligibleCount: 500, notPermittedCount: 20, unavailableCount: 1, unassessedCount: 416, reason: "budget-exhausted" } };
  const partial = renderPromptContext(packet, { state: "ready", candidates: [], inspected: 0, omissions: [] }, "entry");
  assert.match(partial.text, /coverage is incomplete: 63\/500/);
  assert.match(partial.text, /Missing matches are not proof of absence/);
  packet.metadata.coverage.mode = "shadow";
  assert.match(renderPromptContext(packet, { state: "ready", candidates: [], inspected: 0, omissions: [] }, "entry").text, /Shadow results were not applied/);
  packet.metadata.coverage = { attempted: true, complete: true, answeredCount: 10, mode: "shadow", applied: false };
  const shadow = renderPromptContext(packet, { state: "ready", candidates: [], inspected: 0, omissions: [] }, "entry");
  assert.match(shadow.text, /Shadow JEV assessment/); assert.match(shadow.text, /Results were not applied/);
});

test("native delivery honors the declared envelope above the old cap, with required skills intact", () => {
  const packet = { receiptId: "route", ready: true, entries: [{ path: "policy.md", content: "A".repeat(28_000), sourceDigest: "digest" }],
    route: { primary: ["policy.md"], active: [], budget: contextBudget({ primary_context_tokens: 8000, total_context_tokens: 12000 }), budgetAuthority: { nativePacketBytes: 48000 } },
    skills: { entries: [{ path: "required/SKILL.md", content: "Required skill".repeat(500), sourceDigest: "skill-digest" }] }, blockers: [], optional: null } as any;
  const history = { state: "unavailable" as const, candidates: [], inspected: 0, omissions: [] };
  const result = renderPromptContext(packet, history, "entry");
  assert.equal(result.status, "prepared"); assert.ok(Buffer.byteLength(result.text) > 24000); assert.ok(Buffer.byteLength(result.text) <= 48000);
  assert.ok(result.text.includes(packet.entries[0].content)); assert.ok(result.text.includes(packet.skills.entries[0].content));
  packet.route.budget.total_context_tokens = 8000;
  packet.route.budgetAuthority.nativePacketBytes = 32000;
  assert.equal(renderPromptContext(packet, history, "entry").status, "blocked");
  packet.route.budget = contextBudget(undefined); packet.route.budgetAuthority.nativePacketBytes = 24000;
  packet.skills.entries = [];
  assert.equal(renderPromptContext(packet, history, "entry").status, "blocked", "An undeclared budget retains the 24 KB native limit");
});

test("mixed native owners retain their individual limits through delivery and replay", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "prompt-mixed-envelope-"))), old = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  const assets = resolve("src/project_governance_runtime/assets/skills");
  try {
    execFileSync("git", ["init", "-q"], { cwd: root, stdio: "pipe" });
    mkdirSync(join(root, "config/governance"), { recursive: true }); mkdirSync(join(root, "src"));
    writeFileSync(join(root, "config/governance/facts.lock.yaml"), PROJECT_DEFAULTS["config/governance/facts.lock.yaml"]!);
    writeFileSync(join(root, "src/code.ts"), "export const enabled=true;\n");
    for (const [total, bytes, expected] of [[5000, 19000, 24000], [8000, 26000, 32000], [14000, 31000, 56000]] as const) {
      writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify({ context_router: { default_context: ["AGENTS.md"], routes: [
        { id: "intent", match: { product_terms: ["review", "project"] }, token_budget: { primary_context_tokens: total, total_context_tokens: total } },
        { id: "source", match: { path_globs: ["src/**"] } },
      ] } }));
      writeFileSync(join(root, "AGENTS.md"), "x".repeat(bytes));
      const event = { hook_event_name: "UserPromptSubmit", session_id: "host", turn_id: String(total), cwd: root, prompt: "Review project" };
      const first = await promptContext("codex", event, root, { environment: {}, assetRoot: assets });
      const output = (first as any).hookSpecificOutput.additionalContext;
      assert.ok(output.includes("x".repeat(bytes)), "Mandatory guidance must arrive intact");
      assert.ok(Buffer.byteLength(output) <= expected);
      const folder = join(contextStateRoot(root), "prompt-entries");
      const entry = readdirSync(folder).map(file => JSON.parse(readFileSync(join(folder, file), "utf8"))).find(item => item.turn === String(total));
      assert.equal(entry.packetLimitBytes, expected);
      assert.deepEqual(await promptContext("codex", event, root, { environment: {}, assetRoot: assets }), first);
    }
  } finally {
    if (old === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = old;
    rmSync(root, { recursive: true, force: true });
  }
});

test("large native packets replay within their captured profile envelope and refuse changed configuration", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "prompt-envelope-"))), old = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = join(root, "state");
  const assets = resolve("src/project_governance_runtime/assets/skills");
  try {
    execFileSync("git", ["init", "-q"], { cwd: root, stdio: "pipe" });
    mkdirSync(join(root, "config/governance"), { recursive: true });
    writeFileSync(join(root, "config/governance/facts.lock.yaml"), PROJECT_DEFAULTS["config/governance/facts.lock.yaml"]!);
    const profile = { context_router: { default_route: "project", default_context: ["AGENTS.md"], routes: [{ id: "project",
      token_budget: { primary_context_tokens: 9000, total_context_tokens: 14000 } }] } };
    writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify(profile));
    writeFileSync(join(root, "AGENTS.md"), "Required current guidance.\n".repeat(1200));
    const event = { hook_event_name: "UserPromptSubmit", session_id: "host", turn_id: "turn", cwd: root, prompt: "Review the current project" };
    const first = await promptContext("codex", event, root, { environment: {}, assetRoot: assets });
    const text = (first as any).hookSpecificOutput.additionalContext;
    assert.ok(Buffer.byteLength(text) > 24000); assert.ok(Buffer.byteLength(text) <= 56000);
    assert.deepEqual(await promptContext("codex", event, root, { environment: {}, assetRoot: assets }), first);
    profile.context_router.routes[0]!.token_budget.total_context_tokens = 10000;
    writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify(profile));
    const stale = await promptContext("codex", event, root, { environment: {}, assetRoot: assets });
    assert.match((stale as any).hookSpecificOutput.additionalContext, /incomplete or stale/);
  } finally {
    if (old === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = old;
    rmSync(root, { recursive: true, force: true });
  }
});
