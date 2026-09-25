import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store } from "../../harness/src/store/store.ts";
import { defaultDbPath, workContext } from "../../harness/src/store/location.ts";
import { resolveTaskContext } from "../src/decision-task-binding.ts";
import { gitHookLauncher } from "../src/git-hooks.ts";
import { pathToFileURL } from "node:url";
import { prepareCommand } from "../src/cli.ts";
import { contextRouteCommand } from "../src/context-route-command.ts";
import { contextStateRoot } from "../src/context-command.ts";
import { digest, fileDigest } from "../src/core.ts";
import { decisionOutcomeReport } from "../src/decision-outcomes.ts";
import type { DecisionProvider } from "../src/decisions.ts";
import { DatabaseSync } from "node:sqlite";
import { contextCandidateInventory, automaticContextCandidates } from "../src/context-candidates.ts";
import { ValidationSubject, resolveChangeScope } from "../src/change-subject.ts";

const assets = resolve("src/project_governance_runtime/assets/skills");
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "task-entry-")));
  const before = { ...process.env };
  process.env.HARNESS_SESSION = "session-one";
  process.env.XDG_STATE_HOME = join(root, "state");
  delete process.env.GOVERNANCE_DECISION_CONTEXT; delete process.env.JEV_TOKEN;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q"); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "fixture");
  const write = (path: string, content: string) => { mkdirSync(join(root, path, ".."), { recursive: true }); writeFileSync(join(root, path), content); };
  write(".gitignore", "state/\nignored/\n");
  write("rules.md", "REQUIRED ALL TASKS"); write("docs-rules.md", "REQUIRED DOCUMENT RULES"); write("source-rules.md", "REQUIRED SOURCE RULES");
  const profile = { context_router: { default_context: ["rules.md"], routes: [
    { id: "documentation", match: { path_globs: ["docs/**", "design/**"] }, primary_context: ["docs-rules.md"] },
    { id: "source", match: { path_globs: ["src/**"] }, primary_context: ["source-rules.md"] },
  ] }, continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"],
    allowed_source_paths: ["docs/*.md", "design/*.md", "src/*.ts"], consumers: { DL03: { mode: "auto" } } } } };
  write("config/governance/profile.yaml", JSON.stringify(profile));
  write("config/governance/facts.lock.yaml", JSON.stringify({ facts: {} }));
  write("docs/plan.md", "Repair the relevant workflow"); write("src/feature.ts", "export const useful = true;");
  git("add", "."); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "tracked inputs");
  const bind = (scopes = ["docs", "src/feature.ts"], session = "session-one") => {
    const store = new Store(defaultDbPath(root)), where = workContext(root);
    try {
      const task = store.createTask("Repair source and its plan", [...scopes.map(path => ({ kind: "scope" as const, provenance: "operator" as const, body: join(root, path) })),
        { kind: "acceptance", provenance: "operator", body: "Required evidence survives" }], { ...where, session, mode: "implement" });
      store.bind(task.taskId, session, store.workspace(where.locator, root), root);
      return task;
    } finally { store.close(); }
  };
  return { root, write, git, bind, cleanup: () => { process.env = before; rmSync(root, { recursive: true, force: true }); } };
}

test("normal commands resolve the existing session task without writes, mixing sessions or accepting stale intent", () => {
  const f = fixture();
  try {
    assert.equal(resolveTaskContext(f.root).status, "task-store-unavailable");
    assert.equal(existsSync(defaultDbPath(f.root)), false);
    const task = f.bind(), second = f.bind(["docs"], "session-two");
    const before = fileDigest(defaultDbPath(f.root));
    assert.equal(resolveTaskContext(f.root).context?.taskId, task.taskId);
    assert.equal(fileDigest(defaultDbPath(f.root)), before);
    const prepared = prepareCommand(["--stage", "pre-commit", "--mode", "all"], f.root, resolve("src/project_governance_runtime/packs"));
    assert.equal(prepared.decisionOptions.context?.taskId, task.taskId);
    assert.equal(prepared.decisionOptions.binding?.source, "session");
    const focused = prepareCommand(["--stage", "pre-commit", "--mode", "all", "--decision-purpose", "Check documentation only"], f.root, resolve("src/project_governance_runtime/packs"));
    assert.equal(focused.decisionOptions.context?.requirement, "Repair source and its plan");
    assert.equal(focused.decisionOptions.purpose, "Check documentation only");
    assert.throws(() => resolveTaskContext(f.root, { taskId: "another" }), /conflicts/);
    process.env.HARNESS_SESSION = "session-two";
    assert.equal(resolveTaskContext(f.root).context?.taskId, second.taskId);
    process.env.HARNESS_SESSION = "unknown";
    assert.equal(resolveTaskContext(f.root).status, "session-unbound");
    delete process.env.HARNESS_SESSION; delete process.env.CODEX_THREAD_ID;
    assert.equal(resolveTaskContext(f.root).status, "session-unavailable");
    process.env.HARNESS_SESSION = "session-one";
    const store = new Store(defaultDbPath(f.root));
    try { store.reviseTask(task.taskId, [], { expectedVersion: task.version, outcome: "Changed intent" }); }
    finally { store.close(); }
    assert.equal(resolveTaskContext(f.root).status, "task-version-stale");
    const worktree = join(f.root, "linked");
    f.git("worktree", "add", "--detach", worktree, "HEAD");
    assert.equal(resolveTaskContext(worktree).status, "workspace-unbound");
  } finally { f.cleanup(); }
});

test("root and revoked scopes preserve requirements and local retrieval without hosted sharing", async () => {
  const f = fixture();
  try {
    f.bind(["."]);
    f.write("docs/new.md", "UNRELATED WORK");
    const profile = JSON.parse(readFileSync(join(f.root, "config/governance/profile.yaml"), "utf8"));
    delete profile.continuity.decisions.allowed_source_paths;
    f.write("config/governance/profile.yaml", JSON.stringify(profile));
    let calls = 0;
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => { calls++; throw new Error("must not call"); };
    process.env.JEV_TOKEN = "fixture-only";
    let root, revoked;
    try {
    root = await contextRouteCommand([], f.root, assets);
    assert.equal(root.ready, true);
    assert.equal(root.routingPaths.mode, "bound-task-empty-scope");
    assert.ok(root.entries.some(item => item.path === "docs-rules.md"));
    assert.ok(root.selection.candidateCount > 0);
    assert.ok(root.optional?.entries.some(item => item.id === "docs/new.md"));
    const task = f.bind(["docs"]), store = new Store(defaultDbPath(f.root));
    try {
      store.reviseTask(task.taskId, [], { expectedVersion: task.version, revoke: [0], authorityRef: "operator-qualified" });
      store.bind(task.taskId, "session-one", store.workspace(workContext(f.root).locator, f.root), f.root);
    } finally { store.close(); }
    revoked = await contextRouteCommand([], f.root, assets);
    assert.equal(revoked.routingPaths.mode, "bound-task-empty-scope");
    assert.ok(revoked.selection.candidateCount > 0); assert.equal(calls, 0);
    } finally { globalThis.fetch = previousFetch; }
    process.env.HARNESS_SESSION = "unbound";
    await assert.rejects(() => contextRouteCommand([], f.root, assets), /session-unbound.*create or resume/);
  } finally { f.cleanup(); }
});

test("unsupported task projections report actionable reasons without mutating the store", () => {
  const f = fixture();
  try {
    f.bind(["../outside"]);
    assert.equal(resolveTaskContext(f.root).status, "task-scope-outside-workspace");
    f.bind([`docs/${"a".repeat(130)}.md`]);
    assert.equal(resolveTaskContext(f.root).status, "task-path-limit");
    const task = f.bind(), store = new Store(defaultDbPath(f.root));
    try {
      store.reviseTask(task.taskId, Array.from({ length: 16 }, (_, i) => ({ kind: "acceptance", provenance: "operator", body: `Criterion ${i}` })), { expectedVersion: task.version });
      store.bind(task.taskId, "session-one", store.workspace(workContext(f.root).locator, f.root), f.root);
    } finally { store.close(); }
    assert.equal(resolveTaskContext(f.root).status, "task-acceptance-limit");
    const closed = f.bind(), closer = new Store(defaultDbPath(f.root));
    try { closer.reviseTask(closed.taskId, [], { expectedVersion: closed.version, status: "cancelled" }); }
    finally { closer.close(); }
    assert.equal(resolveTaskContext(f.root).status, "task-not-open");
    const old = new DatabaseSync(defaultDbPath(f.root));
    try { old.prepare("UPDATE meta SET value='5' WHERE key='schema_version'").run(); } finally { old.close(); }
    const before = fileDigest(defaultDbPath(f.root));
    assert.equal(resolveTaskContext(f.root).status, "task-store-schema-mismatch");
    assert.equal(fileDigest(defaultDbPath(f.root)), before);
  } finally { f.cleanup(); }
});

test("scoped metadata inventory preserves captured directories and exposes failures", () => {
  const f = fixture();
  try {
    const subject = new ValidationSubject(f.root, resolveChangeScope(f.root, { staged: true }));
    rmSync(join(f.root, "docs"), { recursive: true });
    assert.deepEqual(contextCandidateInventory(subject, ["docs"], []).relevant, ["docs/plan.md"]);
    assert.deepEqual(subject.paths(["src/feature.ts"]), ["src/feature.ts"]);
    const bounded = { paths: (scopes: string[]) => { assert.deepEqual(scopes, ["src/feature.ts"]); return scopes; } } as ValidationSubject;
    assert.equal(contextCandidateInventory(bounded, ["src/feature.ts"], []).unavailable, false);
    const failed = { paths: () => { throw new Error("inventory failed"); } } as unknown as ValidationSubject;
    assert.equal(contextCandidateInventory(failed, ["docs"], []).unavailable, true);
    assert.throws(() => automaticContextCandidates(subject, [], new Set(), [], 0), /candidate limit/);
  } finally { f.cleanup(); }
});

test("failed directory inspection blocks context explicitly before optional provider work", async () => {
  const f = fixture(), original = ValidationSubject.prototype.paths;
  try {
    f.bind(["src"]);
    ValidationSubject.prototype.paths = () => { throw new Error("metadata unavailable"); };
    let calls = 0;
    const packet = await contextRouteCommand([], f.root, assets, { async decide() { calls++; throw new Error("must not run"); } });
    assert.equal(packet.ready, false);
    assert.ok(packet.blockers.includes("context-inventory-unavailable"));
    assert.equal(packet.selection.inventoryUnavailable, true); assert.equal(calls, 0);
  } finally { ValidationSubject.prototype.paths = original; f.cleanup(); }
});

test("ordinary bound files retain bounded baseline delivery without classifier sharing", async () => {
  const f = fixture(), previousFetch = globalThis.fetch;
  try {
    f.bind(["src/feature.ts", "docs/binary.md"]);
    const profile = JSON.parse(readFileSync(join(f.root, "config/governance/profile.yaml"), "utf8"));
    delete profile.continuity.decisions.allowed_source_paths;
    f.write("config/governance/profile.yaml", JSON.stringify(profile));
    f.write("src/feature.ts", "const useful = true;\n".repeat(500));
    f.write("docs/binary.md", "not\0text");
    process.env.JEV_TOKEN = "fixture-only";
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error("no sharing allowed"); };
    const packet = await contextRouteCommand([], f.root, assets);
    assert.equal(packet.ready, true); assert.equal(calls, 0);
    assert.equal(packet.optional?.reason, "source-scope-disabled");
    assert.equal(packet.optional?.entries[0]?.id, "src/feature.ts");
    assert.equal(packet.optional?.entries[0]?.sourceRange?.complete, false);
    assert.ok(packet.selection.automatic.excluded.some(item => item.path === "docs/binary.md"));
    await assert.rejects(() => contextRouteCommand(["--optional-path", "docs/binary.md"], f.root, assets), /Binary optional source/);
  } finally { globalThis.fetch = previousFetch; f.cleanup(); }
});

test("Git children inherit the session through the shipped hook launcher and ordinary check preparation", () => {
  const f = fixture();
  try {
    const task = f.bind();
    const hookModule = pathToFileURL(resolve("components/engine/src/git-hooks.ts")).href;
    const cliModule = pathToFileURL(resolve("components/engine/src/cli.ts")).href;
    f.write(".governance/runtime/bin/project-governance", `#!${process.execPath}
import { writeFileSync } from 'node:fs';
import { prepareCommand } from '${cliModule}';
import { hookCheckArguments } from '${hookModule}';
const prepared = prepareCommand(hookCheckArguments(process.cwd(),process.argv[3],process.argv.slice(4)),process.cwd(),${JSON.stringify(resolve("src/project_governance_runtime/packs"))},'check');
writeFileSync('state/hook.json',JSON.stringify(prepared.decisionOptions));
`);
    f.write(".githooks/pre-commit", gitHookLauncher("pre-commit"));
    chmodSync(join(f.root, ".governance/runtime/bin/project-governance"), 0o700);
    chmodSync(join(f.root, ".githooks/pre-commit"), 0o700);
    mkdirSync(join(f.root, "state"), { recursive: true });
    f.git("-c", "core.hooksPath=.githooks", "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "hook inheritance qualification");
    const captured = JSON.parse(readFileSync(join(f.root, "state/hook.json"), "utf8"));
    assert.equal(captured.context.taskId, task.taskId);
    assert.equal(captured.context.revision, String(task.version));
    assert.equal(captured.binding.source, "session");
  } finally { f.cleanup(); }
});

test("task-bound routing discovers new drafts, preserves mixed owners and records real delivery and fallback", async () => {
  const f = fixture();
  try {
    const task = f.bind();
    f.write("docs/new.md", "A NEW DRAFT about the workflow");
    f.write("docs/secret.json", "DO NOT TRANSMIT");
    f.write("other.md", "UNRELATED DIRTY WORK");
    f.write("docs/binary.md", "a\0b");
    let calls = 0;
    const provider: DecisionProvider = { async decide(request) {
      calls++;
      assert.ok(request.candidates.some(item => item.id === "docs/new.md"));
      assert.ok(!JSON.stringify(request).includes("DO NOT TRANSMIT"));
      assert.ok(!JSON.stringify(request).includes("UNRELATED DIRTY WORK"));
      assert.ok(!JSON.stringify(request).includes("REQUIRED"));
      const order = request.candidates.map(item => item.id).reverse();
      return { version: 1, kind: request.kind, inputDigest: digest(request), delivered: order, suggested: order,
        method: "jev", reason: "fixture", model: "fixture", questionVersion: "1", confidence: 1, latencyMs: 1,
        usage: { inputTokens: 10, outputTokens: 1 } };
    } };
    const packet = await contextRouteCommand([], f.root, assets, provider);
    assert.equal(calls, 1); assert.equal(packet.ready, true);
    assert.equal(packet.selection.binding.taskId, task.taskId);
    assert.equal(packet.routingPaths.mode, "bound-task");
    assert.deepEqual(new Set(packet.entries.map(item => item.path)), new Set(["rules.md", "docs-rules.md", "source-rules.md"]));
    assert.equal(packet.optional?.decision?.method, "jev");
    assert.ok(packet.selection.automatic.excluded.some(item => item.path === "docs/secret.json"));
    assert.ok(packet.selection.automatic.excluded.some(item => item.path === "docs/binary.md"));
    const fallback = await contextRouteCommand([], f.root, assets);
    assert.equal(fallback.ready, true); assert.equal(fallback.optional?.reason, "missing-token");
    assert.ok(fallback.optional?.entries.some(item => item.id === "docs/new.md"));
    assert.deepEqual(fallback.entries, packet.entries);
    const episodes = join(contextStateRoot(f.root), "episodes");
    const path = join(episodes, readdirSync(episodes)[0]!);
    const episode = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(episode.entryKind, "context-delivery"); assert.equal(episode.scope.taskId, task.taskId);
    assert.ok(!readFileSync(path, "utf8").includes("A NEW DRAFT"));
    const manifest = join(f.root, "state/outcome.json");
    writeFileSync(manifest, JSON.stringify({ version: 2, episodes: [{ id: episode.id, scope: episode.scope, decisions: [], caller: { path, digest: fileDigest(path) } }] }));
    assert.equal(decisionOutcomeReport(contextStateRoot(f.root), manifest).counts.joined, 1);
    const staged = await contextRouteCommand(["--staged"], f.root, assets);
    assert.ok(!staged.optional?.entries.some(item => item.id === "docs/new.md"));
    await assert.rejects(() => contextRouteCommand([], f.root, assets, { async decide(request) {
      f.write("docs/new.md", "changed after capture"); return provider.decide(request);
    } }), /sources changed/);
  } finally { f.cleanup(); }
});

test("unsafe candidates never become provider evidence and absent required owners prevent calls", async () => {
  const f = fixture();
  try {
    f.bind(["docs"]);
    symlinkSync(join(f.root, "src/feature.ts"), join(f.root, "docs/link.md"));
    let calls = 0;
    const provider: DecisionProvider = { async decide() { calls++; throw new Error("fixture fallback"); } };
    const packet = await contextRouteCommand([], f.root, assets, provider);
    assert.equal(calls, 1); assert.ok(!packet.optional?.entries.some(item => item.id === "docs/link.md"));
    rmSync(join(f.root, "docs-rules.md"));
    const blocked = await contextRouteCommand([], f.root, assets, provider);
    assert.equal(blocked.ready, false); assert.equal(calls, 1);
    assert.equal(blocked.selection.reason, "required-context-unavailable");
  } finally { f.cleanup(); }
});
