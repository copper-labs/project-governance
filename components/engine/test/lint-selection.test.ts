import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";
import { prepareCommand, planCommand } from "../src/cli.ts";
import { runChecks } from "../src/check-run.ts";
import { PackagedCheckerAssets } from "../src/checker-assets.ts";
import { inspectLintSetup, RUFF_STARTER } from "../src/lint-setup.ts";
import { lintPlanBlockers } from "../src/lint-coverage.ts";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
import { loadSubjectPacks } from "../src/pack-configuration.ts";
const checkout = fileURLToPath(new URL("../../../", import.meta.url)), assets = join(checkout, "src/project_governance_runtime"), adapter = fileURLToPath(new URL("../src/lint-adapter.ts", import.meta.url));
const profilePath = "config/governance/profile.yaml";
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lint-selection-")), runs = mkdtempSync(join(tmpdir(), "lint-selection-runs-"));
  mkdirSync(join(root, "fixture-builtin-packs"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" }); git("init", "-q");
  const write = (path: string, bytes: string | Buffer) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes); };
  return { root, runs, git, write, clean: () => { rmSync(root, { recursive: true, force: true }); rmSync(runs, { recursive: true, force: true }); } };
}
async function ordinary(f: ReturnType<typeof fixture>) {
  const args = ["--stage", "pre-commit", "--mode", "impacted", "--staged"], builtins = join(f.root, "fixture-builtin-packs"), planned = planCommand(args, f.root, builtins), prepared = prepareCommand(args, f.root, builtins, "check");
  assert.equal(planned.status, "ready"); assert.equal(prepared.plan.status, "ready");
  const checked = await runChecks(prepared.registry, prepared.plan, { scope: prepared.scope, subject: prepared.subject, assets: new PackagedCheckerAssets(join(assets, "defaults")), packIds: new Set(Object.keys(prepared.registry)), stage: "pre-commit", asOf: "2026-10-05T12:00:00Z" }, { root: f.runs, deadlineMs: 30000 });
  return { planned, checked };
}
test("ordinary profile context edits retain their owner and neither select nor widen lint", async () => {
  const f = fixture();
  try {
    f.write("src/good.py", "value=1\n"); f.write("src/untouched.py", "undefined_name\n"); f.write("ruff.toml", RUFF_STARTER);
    const lint = { version: 1, require_first_source: true, requirements: [{ pack_id: "lint-ruff-src", roots: ["src"], stages: ["batch", "pre-commit"] }], exclusions: [] };
    const profile = { lint, continuity: { decisions: { mode: "off" } }, context_router: { budget: 1 } };
    f.write(profilePath, stringify(profile));
    f.write("config/validation/packs/lint.yaml", stringify({ id: "lint-ruff-src", enforcement: "blocking", stages: ["batch", "pre-commit"], path_globs: ["src/*.py", "ruff.toml", profilePath], lint: { version: 1, backend: "ruff", roots: ["src"], config: "ruff.toml", inputs: [], excludes: [], tool: { argv: ["ruff"], version: "0.15.14" } }, commands: [{ run: [process.execPath, adapter, "--pack", "lint-ruff-src"] }] }));
    f.write("config/validation/packs/profile.yaml", stringify({ id: "profile-owner", enforcement: "blocking", stages: ["batch", "pre-commit"], path_globs: [profilePath], commands: [{ builtin: "format" }] }));
    f.git("add", "."); f.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Synthetic profile baseline");
    f.write(profilePath, stringify({ ...profile, context_router: { budget: 2 } })); f.git("add", profilePath);
    const context = await ordinary(f); assert.deepEqual(context.planned.selected_packs, ["profile-owner"]); assert.equal(context.checked.status, "passed");
    assert.ok(context.planned.changed_paths.includes(profilePath));
    f.write("src/good.py", "value=2\n"); f.git("add", "src/good.py");
    const changed = await ordinary(f); assert.ok(changed.planned.selected_packs.includes("lint-ruff-src")); assert.equal(changed.checked.status, "passed");
    const command = changed.checked.results.find(pack => pack.pack_id === "lint-ruff-src")!.commands[0]!;
    const detail = JSON.parse(readFileSync((command.lint_evidence as { path: string }).path, "utf8"));
    assert.deepEqual(detail.selected_paths, ["src/good.py"]); assert.equal(detail.widening_reason, null);
    assert.ok(command.input_manifest && (command.input_manifest as { files: Array<{ path: string }> }).files.some(file => file.path === profilePath));
    f.write(profilePath, stringify({ ...profile, lint: { ...lint, exclusions: [{ root: "ignored", reason: "Deliberate policy change" }] } })); f.git("add", profilePath);
    const policy = await ordinary(f); assert.equal(policy.checked.status, "failed");
    const policyCommand = policy.checked.results.find(pack => pack.pack_id === "lint-ruff-src")!.commands[0]!;
    const policyDetail = JSON.parse(readFileSync((policyCommand.lint_evidence as { path: string }).path, "utf8"));
    assert.deepEqual(policyDetail.selected_paths, ["src/good.py", "src/untouched.py"]); assert.equal(policyDetail.widening_reason, "configuration-or-toolchain-input");
  } finally { f.clean(); }
});
test("generated ESLint ownership executes each tree's local tool after copying the declaration", async () => {
  const first = fixture(), second = fixture();
  try {
    for (const f of [first, second]) {
      cpSync(join(checkout, "node_modules"), join(f.root, "node_modules"), { recursive: true }); f.write(".gitignore", "node_modules/\n");
      f.write("package.json", readFileSync(join(checkout, "package.json"))); f.write("package-lock.json", readFileSync(join(checkout, "package-lock.json"))); f.write("src/example.ts", "const value: number=1; const object={one:value};\n");
    }
    const proposal = inspectLintSetup(first.root, { roots: ["src"] });
    assert.deepEqual(proposal.declarations["lint-eslint-src"]!.tool.argv, ["node", "node_modules/eslint/bin/eslint.js"]);
    const raw = parse(proposal.files.find(file => file.path.startsWith("config/validation/packs"))!.content);
    assert.deepEqual(raw.commands[0].run, [".governance/runtime/bin/project-governance", "lint-adapter", "--pack", "lint-eslint-src"]);
    raw.commands = [{ run: [process.execPath, adapter, "--pack", "lint-eslint-src"] }];
    for (const f of [first, second]) {
      for (const file of proposal.files) f.write(file.path, file.path.startsWith("config/validation/packs") ? stringify(raw) : file.content);
      f.write(profilePath, stringify({ lint: proposal.profile, continuity: { decisions: { mode: "off" } } })); f.git("add", ".");
      f.write("config/validation/packs/metadata.yaml", stringify({ id: "metadata-owner", enforcement: "blocking", stages: ["pre-commit"], path_globs: ["*.yaml", "*.json", ".gitignore"], commands: [{ builtin: "format" }] })); f.git("add", "config/validation/packs/metadata.yaml");
    }
    assert.equal((await ordinary(first)).checked.status, "passed");
    unlinkSync(join(first.root, "node_modules/eslint/bin/eslint.js"));
    second.write("src/example.ts", "const value: number=1; const object={one:value,one:2};\n"); second.git("add", "src/example.ts");
    const local = await ordinary(second); assert.equal(local.checked.status, "failed");
    const command = local.checked.results.find(pack => pack.pack_id === "lint-eslint-src")!.commands[0]!;
    const detail = JSON.parse(readFileSync((command.lint_evidence as { path: string }).path, "utf8"));
    assert.ok(detail.native_results.every((result: { argv: string[] }) => result.argv[1] === join(second.root, "node_modules/eslint/bin/eslint.js")));
    assert.ok(command.findings.some(finding => finding.rule_id === "lint.eslint.no-dupe-keys"));
  } finally { first.clean(); second.clean(); }
});
test("captured required roots and stages survive removal until an explicit exclusion or replacement", () => {
  const f = fixture();
  try {
    const prior = { version: 1, require_first_source: true, requirements: [{ pack_id: "lint-old", roots: ["src"], stages: ["batch", "pre-commit", "pre-push"] }], exclusions: [] };
    f.write(profilePath, stringify({ lint: prior })); f.git("add", "."); f.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Synthetic retained obligation");
    const inspect = (lint: unknown, stage: string) => {
      f.write(profilePath, stringify({ lint })); f.git("add", profilePath);
      const scope = resolveChangeScope(f.root, { staged: true }), subject = new ValidationSubject(f.root, scope);
      return lintPlanBlockers(subject, loadSubjectPacks(subject, join(assets, "packs")), stage, [profilePath], [], false, scope);
    };
    assert.ok(inspect({ ...prior, requirements: [] }, "pre-push").some(finding => finding.code === "lint-required-obligation-removed"));
    assert.deepEqual(inspect({ ...prior, requirements: [] }, "ci-pr"), []);
    assert.ok(inspect({ ...prior, requirements: [{ ...prior.requirements[0], stages: ["batch", "pre-commit"] }] }, "pre-push").some(finding => finding.code === "lint-required-obligation-removed"));
    assert.ok(!inspect({ ...prior, requirements: [], exclusions: [{ root: "src", reason: "Deliberate root exclusion" }] }, "pre-push").some(finding => finding.code === "lint-required-obligation-removed"));
    assert.ok(!inspect({ ...prior, requirements: [{ pack_id: "lint-replacement", roots: ["src"], stages: prior.requirements[0]!.stages }] }, "pre-push").some(finding => finding.code === "lint-required-obligation-removed"));
  } finally { f.clean(); }
});
