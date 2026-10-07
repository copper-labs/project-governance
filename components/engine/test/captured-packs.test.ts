import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
import { loadSubjectPacks, mergePacks } from "../src/pack-configuration.ts";
import { buildPlan } from "../src/planning.ts";
const builtins = fileURLToPath(new URL("../../../src/project_governance_runtime/packs/", import.meta.url));

test("planning retains staged pack ownership despite later worktree edits", () => {
  const root = mkdtempSync(join(tmpdir(), "captured-packs-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  try {
    git("init", "-q"); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "Initial");
    mkdirSync(join(root, "config/validation/packs"), { recursive: true });
    const path = join(root, "config/validation/packs/example.yaml");
    const pack = { id: "example", enforcement: "blocking", stages: ["pre-commit"], path_globs: ["*.custom"], commands: [{ argv: ["example"] }] };
    writeFileSync(path, JSON.stringify(pack)); writeFileSync(join(root, "file.custom"), "candidate"); git("add", ".");
    const scope = resolveChangeScope(root, { staged: true });
    writeFileSync(path, JSON.stringify({ ...pack, path_globs: [] }));
    const packs = loadSubjectPacks(new ValidationSubject(root, scope), builtins);
    const plan = buildPlan(packs, { stage: "pre-commit", mode: "impacted", changedPaths: ["file.custom"] });
    assert.equal(plan.status, "ready"); assert.ok(plan.selected_packs.includes("example"));
    const live = resolveChangeScope(root, { all: true });
    assert.equal(buildPlan(loadSubjectPacks(new ValidationSubject(root, live), builtins), { stage: "pre-commit", mode: "impacted", changedPaths: ["file.custom"] }).status, "blocked");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("pack admission validates credential declarations before detached persistence", () => {
  const pack = (command: unknown) => [{ source: "fixture", origin: "target" as const, value: { id: "fixture", enforcement: "blocking", commands: [command] } }];
  assert.deepEqual(mergePacks(pack({ run: ["tool"], credentialEnv: ["OPENAI_API_KEY"] })).fixture!.commands,
    [{ run: ["tool"], credentialEnv: ["OPENAI_API_KEY"] }]);
  for (const credentialEnv of [["OTHER_API_KEY"], ["OPENAI_API_KEY", "OPENAI_API_KEY"], { OPENAI_API_KEY: "fixture-only" }])
    assert.throws(() => mergePacks(pack({ run: ["tool"], credentialEnv })), /credential/);
  assert.throws(() => mergePacks(pack({ builtin: "docs", credentialEnv: ["OPENAI_API_KEY"] })), /Built-in commands/);
  assert.throws(() => mergePacks(pack({ run: ["tool"], env: { OPENAI_API_KEY: "fixture-only" } })), /credentials cannot be embedded/);
  for (const name of ["ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "OTHER_API_KEY", "API_KEY", "anthropic_api_key"]) {
    assert.throws(() => mergePacks(pack({ run: ["tool"], credentialEnv: [name] })), /credential/);
    assert.throws(() => mergePacks(pack({ run: ["tool"], env: { [name]: "fixture-only" } })), /credentials cannot be embedded/);
    assert.throws(() => mergePacks(pack({ run: ["tool"], [name]: "fixture-only" })), /credentials cannot be embedded/);
    assert.throws(() => mergePacks(pack({ run: ["tool"], [name]: { value: "fixture-only" } })), /credentials cannot be embedded/);
  }
});
