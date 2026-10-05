import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse, stringify } from "yaml";
import { ValidationSubject, resolveChangeScope } from "../src/change-subject.ts";
import { mergePacks } from "../src/pack-configuration.ts";
import { lintCoverage, lintPlanBlockers } from "../src/lint-coverage.ts";
import { parseLintDeclaration } from "../src/lint-configuration.ts";
import { prepareLintInputs, validateLintConfigClosure, verifyLintInputs } from "../src/lint-inputs.ts";
import { inspectLintSetup, RUFF_STARTER } from "../src/lint-setup.ts";
import { lintAdapterCommand } from "../src/lint-adapter.ts";
import type { LintToolRunner } from "../src/lint-backends.ts";
import { matchesPackPath } from "../src/planning.ts";
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lint-contract-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q");
  return { root, git, clean: () => rmSync(root, { recursive: true, force: true }) };
}
const declaration = () => parseLintDeclaration({ version: 1, backend: "ruff", roots: ["src"], config: "ruff.toml", inputs: [], excludes: [], tool: { argv: ["ruff"], version: "0.15.14" } });
test("lint inputs preserve first-commit staged source/config and refuse snapshot corruption", () => {
  const f = fixture(), evidence = mkdtempSync(join(tmpdir(), "lint-evidence-"));
  try {
    mkdirSync(join(f.root, "src")); writeFileSync(join(f.root, "src/example.py"), "missing_name\n"); writeFileSync(join(f.root, "ruff.toml"), RUFF_STARTER); f.git("add", ".");
    const scope = resolveChangeScope(f.root, { staged: true }); writeFileSync(join(f.root, "src/example.py"), "1\n"); writeFileSync(join(f.root, "ruff.toml"), '[lint]\nselect=[]\n');
    const prepared = prepareLintInputs(new ValidationSubject(f.root, scope), scope, declaration(), "lint-python", evidence);
    assert.equal(readFileSync(join(prepared.value.candidate, "src/example.py"), "utf8"), "missing_name\n");
    assert.equal(readFileSync(join(prepared.value.candidate, "ruff.toml"), "utf8"), RUFF_STARTER);
    assert.equal(verifyLintInputs(evidence, prepared.env.PROJECT_GOVERNANCE_LINT_INPUTS, prepared.env.PROJECT_GOVERNANCE_LINT_INPUTS_SHA256).selected.length, 1);
    chmodSync(join(prepared.value.candidate, "src/example.py"), 0o600); writeFileSync(join(prepared.value.candidate, "src/example.py"), "tampered\n");
    assert.throws(() => verifyLintInputs(evidence, prepared.env.PROJECT_GOVERNANCE_LINT_INPUTS, prepared.env.PROJECT_GOVERNANCE_LINT_INPUTS_SHA256), /changed/);
  } finally { f.clean(); rmSync(evidence, { recursive: true, force: true }); }
});
test("candidate input change widens only the declared source root; all mode has no fabricated digest", () => {
  const f = fixture(), evidence = mkdtempSync(join(tmpdir(), "lint-wide-")), allEvidence = mkdtempSync(join(tmpdir(), "lint-all-"));
  try {
    mkdirSync(join(f.root, "src")); mkdirSync(join(f.root, "unrelated"));
    writeFileSync(join(f.root, "src/a.py"), "1\n"); writeFileSync(join(f.root, "unrelated/b.py"), "missing\n"); writeFileSync(join(f.root, "ruff.toml"), RUFF_STARTER); f.git("add", "."); f.git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "Initial");
    writeFileSync(join(f.root, "ruff.toml"), RUFF_STARTER + "# change\n"); f.git("add", "ruff.toml");
    const scope = resolveChangeScope(f.root, { staged: true }), subject = new ValidationSubject(f.root, scope);
    const prepared = prepareLintInputs(subject, scope, declaration(), "lint-python", evidence);
    assert.deepEqual(prepared.value.selected, ["src/a.py"]); assert.equal(prepared.value.widening_reason, "configuration-or-toolchain-input");
    const all = resolveChangeScope(f.root, { all: true }); const preparedAll = prepareLintInputs(new ValidationSubject(f.root, all), all, declaration(), "lint-python", allEvidence);
    assert.deepEqual(preparedAll.value.selected, ["src/a.py"]); assert.equal(preparedAll.value.subject_digest, null);
  } finally { f.clean(); rmSync(evidence, { recursive: true, force: true }); rmSync(allEvidence, { recursive: true, force: true }); }
});
test("declared config closure refuses dynamic imports, typed lint and count suppressions", () => {
  const config = parseLintDeclaration({ ...declaration(), backend: "eslint", config: "eslint.config.mjs" });
  assert.throws(() => validateLintConfigClosure(config, new Map([[config.config, 'import x from "./missing.mjs"; export default x;']])), /Undeclared/);
  assert.throws(() => validateLintConfigClosure(config, new Map([[config.config, 'const x=import(process.env.CONFIG); export default x;']])), /Dynamic|Environment|Executable/);
  assert.throws(() => validateLintConfigClosure(config, new Map([[config.config, 'export default [{languageOptions:{parserOptions:{project:true}}}];']])), /Project-aware/);
  assert.throws(() => validateLintConfigClosure(config, new Map([[config.config, 'const project=true; export default [{languageOptions:{parserOptions:{project}}}];']])), /Project-aware/);
  assert.throws(() => validateLintConfigClosure({ ...config, dependency_roots: ["node_modules"] }, new Map([[config.config, 'import fs from "fs/promises"; export default [];']])), /Undeclared/);
  assert.throws(() => validateLintConfigClosure({ ...config, dependency_roots: ["node_modules"] }, new Map([[config.config, 'import rules from "file:///live/rules.mjs"; export default rules;']])), /Undeclared/);
  assert.throws(() => parseLintDeclaration({ ...config, tool: { argv: ["npm", "exec", "eslint"], version: "9.39.1" } }), /Fetching/);
  assert.throws(() => parseLintDeclaration({ ...declaration(), roots: ["../outside"] }), /unsafe/);
});
test("normal gates retain adopted coverage after a pack is removed and allow an exact generic owner", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.root, "config/governance"), { recursive: true }); mkdirSync(join(f.root, "src"));
    writeFileSync(join(f.root, "src/work.kt"), "class Work\n");
    writeFileSync(join(f.root, "config/governance/profile.yaml"), stringify({ lint: { version: 1, require_first_source: true, requirements: [{ pack_id: "lint-native", roots: ["src"], stages: ["batch", "pre-commit"] }], exclusions: [] } }));
    const scope = resolveChangeScope(f.root, { all: true }), subject = new ValidationSubject(f.root, scope);
    assert.ok(lintPlanBlockers(subject, {}, "pre-commit", ["src/work.kt"]).some(finding => finding.code === "lint-required-coverage-missing"));
    const packs = mergePacks([{ source: "project", origin: "target", value: { id: "lint-native", enforcement: "blocking", stages: ["batch", "pre-commit"], path_globs: ["src/**"], change_packet_contract: 1, commands: [{ run: [process.execPath, "--version"] }] } }]);
    assert.equal(lintCoverage(subject, packs).status, "ready"); assert.deepEqual(lintPlanBlockers(subject, packs, "pre-commit", ["src/work.kt"]), []);
    assert.ok(lintPlanBlockers(subject, packs, "pre-commit", ["src/work.kt"], []).some(finding => finding.code === "lint-required-owner-omitted"));
    assert.deepEqual(lintPlanBlockers(subject, packs, "pre-commit", ["README.md"], []), []);
  } finally { f.clean(); }
});
test("setup is passive, preserves existing rules and exposes ambiguity and unsupported source", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, "a.py"), "1\n"); writeFileSync(join(f.root, "work.swift"), "struct Work {}\n"); writeFileSync(join(f.root, "ruff.toml"), '[lint]\nselect=["ALL"]\n');
    const before = readFileSync(join(f.root, "ruff.toml"), "utf8"), proposal = inspectLintSetup(f.root);
    assert.equal(proposal.mutations, "none"); assert.ok(proposal.findings.some(finding => finding.code === "lint-unsupported-starter"));
    assert.ok(!proposal.files.some(file => file.path === "ruff.toml")); assert.equal(readFileSync(join(f.root, "ruff.toml"), "utf8"), before);
    writeFileSync(join(f.root, ".ruff.toml"), RUFF_STARTER); assert.ok(inspectLintSetup(f.root).findings.some(finding => finding.code === "lint-setup-ambiguous"));
  } finally { f.clean(); }
});
test("setup adds first-source owners to the retained empty profile without losing earlier owners", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.root, "config/governance"), { recursive: true }); writeFileSync(join(f.root, "a.py"), "1\n");
    const profile = { version: 1, require_first_source: true, requirements: [], exclusions: [{ root: "native", reason: "Owned by native host checks" }] };
    writeFileSync(join(f.root, "config/governance/profile.yaml"), stringify({ lint: profile }));
    const proposal = inspectLintSetup(f.root); assert.equal(proposal.profile.requirements[0]?.pack_id, "lint-ruff-root"); assert.deepEqual(proposal.profile.exclusions, profile.exclusions);
  } finally { f.clean(); }
});
test("setup root globs select direct and nested source with the existing planner contract", () => {
  const f = fixture();
  try {
    mkdirSync(join(f.root, "src")); writeFileSync(join(f.root, "src/a.py"), "1\n");
    const proposal = inspectLintSetup(f.root, { roots: ["src"] }), packFile = proposal.files.find(file => file.path.startsWith("config/validation/packs"))!;
    const pack = parse(packFile.content) as { path_globs: string[] };
    assert.ok(matchesPackPath("src/a.py", pack.path_globs)); assert.ok(matchesPackPath("src/nested/b.py", pack.path_globs)); assert.ok(!matchesPackPath("outside/b.py", pack.path_globs));
  } finally { f.clean(); }
});
test("a changed owning pack file widens its sources even when its filename differs from its id", () => {
  const f = fixture(), evidence = mkdtempSync(join(tmpdir(), "lint-pack-wide-"));
  try {
    mkdirSync(join(f.root, "src")); mkdirSync(join(f.root, "config/validation/packs"), { recursive: true });
    writeFileSync(join(f.root, "src/a.py"), "1\n"); writeFileSync(join(f.root, "ruff.toml"), RUFF_STARTER); writeFileSync(join(f.root, "config/validation/packs/owner.yaml"), "id: lint-python\n"); f.git("add", ".");
    f.git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "Initial");
    writeFileSync(join(f.root, "config/validation/packs/owner.yaml"), "id: lint-python\n# changed\n"); f.git("add", "config/validation/packs/owner.yaml");
    const scope = resolveChangeScope(f.root, { staged: true });
    const prepared = prepareLintInputs(new ValidationSubject(f.root, scope), scope, declaration(), "lint-python", evidence, "config/validation/packs/owner.yaml");
    assert.deepEqual(prepared.value.selected, ["src/a.py"]); assert.ok(prepared.value.snapshots.some(entry => entry.path === "config/validation/packs/owner.yaml"));
  } finally { f.clean(); rmSync(evidence, { recursive: true, force: true }); }
});
test("nested failure is an outer execution failure; ignored expected source cannot pass", async () => {
  const f = fixture(), evidence = mkdtempSync(join(tmpdir(), "lint-failure-"));
  try {
    mkdirSync(join(f.root, "src")); writeFileSync(join(f.root, "src/a.py"), "1\n"); writeFileSync(join(f.root, "ruff.toml"), RUFF_STARTER); f.git("add", ".");
    const scope = resolveChangeScope(f.root, { staged: true }); const prepared = prepareLintInputs(new ValidationSubject(f.root, scope), scope, declaration(), "lint-python", evidence);
    const runner: LintToolRunner = async argv => ({ argv, exit_code: 0, stdout: argv.includes("--version") ? "ruff 0.15.14\n" : "", stderr: "" });
    const result = await lintAdapterCommand(["--pack", "lint-python"], { ...prepared.env, PROJECT_GOVERNANCE_EVIDENCE_ROOT: evidence, PROJECT_GOVERNANCE_SUBJECT_DIGEST: scope.subject_digest! }, runner);
    assert.equal(result.exitCode, 2); assert.match(String(result.value.findings[0]!.message), /ignored|omitted/);
  } finally { f.clean(); rmSync(evidence, { recursive: true, force: true }); }
});
