import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectStartupHookSource, assertSharedStartupHookSource, startupHookSource } from "../src/startup-hook-source.ts";
import { startupHooks, MANAGED_CODEX_STARTUP_COMMAND } from "../src/startup-hooks.ts";
import { installStartupHooks } from "../src/startup-hook-installation.ts";
import { contextDoctor } from "../src/context-doctor.ts";
import { runtimeDoctor } from "../src/runtime-doctor.ts";
import { readCurrentMigrationPlan, runtimeMigrationPlan } from "../src/runtime-migration-plan.ts";
import { assertNoLegacyStartupHooks } from "../src/startup-hook-transition.ts";

function fixture() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "shared-startup-")));
  const main = join(base, "main ' source"), linked = join(base, "linked ' $(false)");
  mkdirSync(main);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: main, encoding: "utf8", stdio: "pipe" });
  git("init", "-q");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "fixture");
  git("worktree", "add", "--detach", "-q", linked, "HEAD");
  for (const root of [main, linked]) {
    mkdirSync(join(root, ".codex"));
    mkdirSync(join(root, ".governance/runtime/bin"), { recursive: true });
    writeFileSync(join(root, ".governance/runtime/bin/project-governance"), '#!/bin/sh\nprintf "%s\\n" "$PWD" "$@"\ncat\n', { mode: 0o700 });
  }
  const hooks = (root: string, current: boolean) => writeFileSync(join(root, ".codex/hooks.json"), current
    ? startupHooks({}, root, join(base, "startup.sqlite")).content
    : JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: 'python3 "$(git rev-parse --show-toplevel)/tools/governance-startup.py" codex', timeout: 10 }] }] } }));
  return { base, main, linked, git, hooks, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

test("current sibling hooks cannot hide the obsolete shared source from readiness or installation", () => {
  const f = fixture();
  try {
    f.hooks(f.main, false); f.hooks(f.linked, true);
    const mainBefore = readFileSync(join(f.main, ".codex/hooks.json"), "utf8");
    const linkedBefore = readFileSync(join(f.linked, ".codex/hooks.json"), "utf8");
    const source = inspectStartupHookSource(f.linked);
    assert.equal(source.definitionRoot, f.main); assert.equal(source.shared, true); assert.equal(source.status, "conflicting");
    assert.equal(source.hostDiscovery, "not-performed");
    assert.throws(() => installStartupHooks(f.linked, join(f.base, "startup.sqlite")), /Shared Codex hook source is conflicting/);
    assert.throws(() => assertNoLegacyStartupHooks(f.linked), /Shared Codex hook source/);
    const context = contextDoctor(f.linked);
    assert.notEqual(context.promptHook, "configured");
    assert.ok(context.findings.some(item => item.id === "context.shared-hook-source" && item.message.includes(f.main)));
    const installation = runtimeDoctor(f.linked, join(f.base, "missing.sqlite"));
    assert.ok(installation.findings.some(item => item.id === "context.shared-hook-source"));
    assert.equal(readFileSync(join(f.main, ".codex/hooks.json"), "utf8"), mainBefore);
    assert.equal(readFileSync(join(f.linked, ".codex/hooks.json"), "utf8"), linkedBefore);
  } finally { f.cleanup(); }
});

test("repairing the main definition restores shared readiness and executes only the sibling launcher", () => {
  const f = fixture();
  try {
    f.hooks(f.main, false); f.hooks(f.linked, true);
    assert.throws(() => assertSharedStartupHookSource(f.linked), /Shared Codex/);
    // The coordinated main-owner cutover changes definitions; it does not copy a runtime or receipts.
    f.hooks(f.main, true);
    const source = assertSharedStartupHookSource(f.linked);
    assert.equal(source.status, "current"); assert.equal(source.path, join(f.main, ".codex/hooks.json"));
    const event = JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: "synthetic", cwd: f.linked });
    const command = JSON.parse(readFileSync(source.path, "utf8")).hooks.UserPromptSubmit[0].hooks[0].command;
    assert.equal(command, MANAGED_CODEX_STARTUP_COMMAND);
    const result = execFileSync("/bin/sh", ["-c", command], { cwd: f.linked, input: event, encoding: "utf8", timeout: 5000 });
    assert.equal(result, `${f.linked}\nstartup\nobserve\n--provider\ncodex\n--event-stdin\n${event}`);
    assert.equal(installStartupHooks(f.linked, join(f.base, "startup.sqlite")).changed, false);
    assert.equal(contextDoctor(f.linked).promptHook, "configured");
  } finally { f.cleanup(); }
});

test("doctor distinguishes the executable main hook from an obsolete linked copy", () => {
  const f = fixture();
  try {
    f.hooks(f.main, true); f.hooks(f.linked, false);
    const context = contextDoctor(f.linked);
    assert.equal(context.promptHook, "configured");
    assert.equal(context.promptHookSource?.definitionRoot, f.main);
    assert.equal(context.hostTrust, "not-observable");
    // Authored linked files still require the existing deliberate migration rather than overwrite.
    assert.throws(() => installStartupHooks(f.linked, join(f.base, "startup.sqlite")), /Legacy/);
  } finally { f.cleanup(); }
});

test("missing, malformed and redirected main hook sources never qualify a linked installation", () => {
  const f = fixture();
  try {
    f.hooks(f.linked, true);
    assert.equal(inspectStartupHookSource(f.linked).status, "missing");
    assert.throws(() => assertSharedStartupHookSource(f.linked), /missing/);
    writeFileSync(join(f.main, ".codex/hooks.json"), "{");
    assert.equal(inspectStartupHookSource(f.linked).status, "conflicting");
    assert.throws(() => assertSharedStartupHookSource(f.linked), /conflicting/);
    rmSync(join(f.main, ".codex/hooks.json"));
    symlinkSync(join(f.linked, ".codex/hooks.json"), join(f.main, ".codex/hooks.json"));
    assert.equal(inspectStartupHookSource(f.linked).status, "unavailable");
    assert.throws(() => assertSharedStartupHookSource(f.linked), /unavailable/);
  } finally { f.cleanup(); }
});

test("migration plans bind shared source changes without adding another checkout to write scope", () => {
  const f = fixture();
  try {
    f.hooks(f.main, true); f.hooks(f.linked, true);
    const plan = runtimeMigrationPlan(f.linked), path = join(f.base, "plan.json");
    writeFileSync(path, JSON.stringify(plan));
    assert.equal(plan.codexHookSource.shared, true);
    assert.ok(plan.inputs.every(input => input.path.startsWith(f.linked + "/")));
    assert.deepEqual(readCurrentMigrationPlan(path), plan);
    f.hooks(f.main, false);
    assert.throws(() => readCurrentMigrationPlan(path), /plan changed/);
  } finally { f.cleanup(); }
});

test("main checkouts and non-Git proposals remain local, with invalid Git identity reported", () => {
  const f = fixture();
  try {
    assert.equal(startupHookSource(f.main).shared, false);
    const plain = join(f.base, "plain"); mkdirSync(plain);
    assert.equal(startupHookSource(plain).resolution, "local-directory");
    writeFileSync(join(plain, ".git"), "gitdir: /missing-governance-fixture\n");
    assert.throws(() => startupHookSource(plain));
    assert.ok(contextDoctor(plain).findings.some(item => item.id === "context.hook-source-unavailable"));
  } finally { f.cleanup(); }
});
