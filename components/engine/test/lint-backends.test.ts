import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { runChecks } from "../src/check-run.ts";
import { mergePacks } from "../src/pack-configuration.ts";
import { buildPlan } from "../src/planning.ts";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
import { PackagedCheckerAssets } from "../src/checker-assets.ts";
import { commandExecutable } from "../src/native-check-command.ts";
import { eslintStarter, RUFF_STARTER } from "../src/lint-setup.ts";
const checkout = fileURLToPath(new URL("../../../", import.meta.url));
const defaults = join(checkout, "src/project_governance_runtime/defaults");
const adapter = fileURLToPath(new URL("../src/lint-adapter.ts", import.meta.url));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lint-native-")), runs = mkdtempSync(join(tmpdir(), "lint-native-runs-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-q");
  const write = (path: string, content: string) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content); };
  return { root, runs, git, write, clean: () => { rmSync(root, { recursive: true, force: true }); rmSync(runs, { recursive: true, force: true }); } };
}
function pack(backend: "ruff" | "eslint", root: string) {
  return { id: "a-lint", enforcement: "blocking", stages: ["batch", "pre-commit"], path_globs: ["src/**", "ruff.toml", "eslint.config.mjs", "package*.json"], change_packet_contract: 1,
    lint: { version: 1, backend, roots: ["src"], config: backend === "ruff" ? "ruff.toml" : "eslint.config.mjs", inputs: backend === "ruff" ? [] : ["package.json", "package-lock.json"], excludes: [],
      tool: backend === "ruff" ? { argv: [commandExecutable("ruff", root)], version: "0.15.14" } : { argv: [process.execPath, join(root, "node_modules/eslint/bin/eslint.js")], version: "9.39.1" }, dependency_roots: backend === "eslint" ? ["node_modules"] : [] },
    commands: [{ run: [process.execPath, adapter, "--pack", "a-lint"] }] };
}
async function check(f: ReturnType<typeof fixture>, value: ReturnType<typeof pack>, all = false, extra: Record<string, unknown>[] = []) {
  const scope = resolveChangeScope(f.root, all ? { all: true } : { staged: true });
  const packs = mergePacks([value, ...extra].map(value => ({ source: "fixture", origin: "target" as const, value })));
  const plan = buildPlan(packs, { stage: "pre-commit", mode: "all", changedPaths: [] });
  return runChecks(packs, plan, { scope, subject: new ValidationSubject(f.root, scope), assets: new PackagedCheckerAssets(defaults), packIds: new Set(Object.keys(packs)), stage: "pre-commit", asOf: "2026-10-05T12:00:00Z" }, { root: f.runs, deadlineMs: 30000 });
}
function detail(result: Awaited<ReturnType<typeof check>>) {
  const command = result.results.find(entry => entry.pack_id === "a-lint")!.commands[0]!;
  const evidence = command["lint_evidence"] as { path: string };
  return { command, value: JSON.parse(readFileSync(evidence.path, "utf8")) };
}

test("real Ruff checks first-commit staged bytes, retains native evidence, and continues independent packs", async () => {
  const f = fixture();
  try {
    f.write("src/a.py", "undefined_name\n"); f.write("ruff.toml", RUFF_STARTER); f.git("add", ".");
    f.write("src/a.py", "1\n"); f.write("ruff.toml", "[lint]\nselect=[]\n");
    const ordinary = { enforcement: "blocking", stages: ["pre-commit"], commands: [{ run: [process.execPath, "-e", "console.log(JSON.stringify({status:'passed',findings:[]}))"] }] };
    const result = await check(f, pack("ruff", f.root), false, [{ ...ordinary, id: "b-dependent", depends_on: ["a-lint"] }, { ...ordinary, id: "z-independent" }]);
    assert.equal(result.status, "failed"); assert.ok(result.results.some(entry => entry.pack_id === "z-independent")); assert.deepEqual(result.blocked["b-dependent"], ["a-lint"]);
    const { command, value } = detail(result);
    assert.equal(command["exit_code"], 0); assert.equal(command["process_failure"], false);
    assert.equal(command.findings[0]?.rule_id, "lint.ruff.F821"); assert.equal(command.findings[0]?.path, "src/a.py");
    assert.equal(value.checked_count, 1); assert.equal(value.native_results.at(-1).exit_code, 1); assert.equal(value.input_manifest.status, "complete");
    assert.equal(result.results[0]?.evidence_manifest?.status, "valid");
  } finally { f.clean(); }
});
test("real Ruff passes staged clean source/config despite live violations and widens only its root", async () => {
  const f = fixture();
  try {
    f.write("src/a.py", "1\n"); f.write("outside/b.py", "undefined_name\n"); f.write("ruff.toml", RUFF_STARTER); f.git("add", ".");
    f.git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "Initial");
    f.write("ruff.toml", RUFF_STARTER + "# candidate change\n"); f.git("add", "ruff.toml");
    f.write("src/a.py", "undefined_name\n"); f.write("ruff.toml", "[lint]\nselect=[\"ALL\"]\n");
    const result = await check(f, pack("ruff", f.root)); assert.equal(result.status, "passed");
    assert.deepEqual(detail(result).value.selected_paths, ["src/a.py"]); assert.equal(detail(result).value.widening_reason, "configuration-or-toolchain-input");
    const all = await check(f, pack("ruff", f.root), true); assert.equal(all.status, "failed"); assert.equal(detail(all).value.input_mode, "all");
    assert.equal(all.results[0]?.evidence_manifest?.status, "absent"); assert.equal(detail(all).value.subject_digest, null);
  } finally { f.clean(); }
});
test("real Ruff refuses an implicitly ignored selected file", async () => {
  const f = fixture();
  try {
    f.write("src/a.py", "undefined_name\n"); f.write("ruff.toml", 'exclude=["src/a.py"]\n' + RUFF_STARTER); f.git("add", ".");
    const result = await check(f, pack("ruff", f.root)); assert.equal(result.status, "failed");
    assert.equal(result.results[0]?.commands[0]?.["process_failure"], true);
    assert.match(String(result.results[0]?.commands[0]?.["stdout"]), /ignored|omitted/);
  } finally { f.clean(); }
});
test("real pinned ESLint/parser check staged TypeScript and preserve native warning severity", async () => {
  const f = fixture();
  try {
    // Tools are test-only installed dependencies, copied into this disposable project ownership boundary.
    cpSync(join(checkout, "node_modules"), join(f.root, "node_modules"), { recursive: true });
    f.write(".gitignore", "node_modules/\n"); f.write("package.json", readFileSync(join(checkout, "package.json"), "utf8")); f.write("package-lock.json", readFileSync(join(checkout, "package-lock.json"), "utf8"));
    f.write("src/a.ts", 'const typed: number = 1; const object = { a: typed, a: 2 };\n'); f.write("eslint.config.mjs", eslintStarter(true)); f.git("add", ".");
    f.write("src/a.ts", "const typed: number = 1;\n"); f.write("eslint.config.mjs", 'export default [{files:["**/*.ts"],rules:{}}];\n');
    const failed = await check(f, pack("eslint", f.root)); assert.equal(failed.status, "failed"); assert.equal(detail(failed).command["exit_code"], 0);
    assert.ok(detail(failed).command.findings.some(finding => finding.rule_id === "lint.eslint.no-dupe-keys" && finding.severity === "blocking"));
    f.write("src/a.ts", 'const typed: number = 1; const object = { a: typed, a: 2 };\n');
    f.write("eslint.config.mjs", eslintStarter(true).replace('"no-dupe-keys":"error"', '"no-dupe-keys":"warn"')); f.git("add", "src/a.ts", "eslint.config.mjs");
    const warning = await check(f, pack("eslint", f.root)); assert.equal(warning.status, "warning");
    assert.ok(detail(warning).command.findings.every(finding => finding.severity === "advisory")); assert.equal(detail(warning).value.native_results.at(-1).exit_code, 0);
    f.write("src/a.ts", "const typed: number = 1;\n"); f.write("eslint.config.mjs", eslintStarter(true)); f.git("add", "src/a.ts", "eslint.config.mjs");
    f.write("src/a.ts", 'const object = { a: 1, a: 2 };\n'); f.write("eslint.config.mjs", "export default [invalid];\n");
    const passed = await check(f, pack("eslint", f.root)); assert.equal(passed.status, "passed");
    f.write("src/a.ts", "const typed: number = ;\n"); f.write("eslint.config.mjs", eslintStarter(true)); f.git("add", "src/a.ts", "eslint.config.mjs");
    const syntax = await check(f, pack("eslint", f.root)); assert.equal(syntax.status, "failed");
    assert.ok(detail(syntax).command.findings.some(finding => finding.rule_id === "lint.eslint.syntax" && finding.severity === "blocking"));
    f.write("src/a.ts", "const typed: number = 1;\n"); f.write("eslint.config.mjs", 'export default [{ignores:["src/**"]}];\n'); f.git("add", "src/a.ts", "eslint.config.mjs");
    const ignored = await check(f, pack("eslint", f.root)); assert.equal(ignored.status, "failed"); assert.equal(ignored.results[0]?.commands[0]?.["process_failure"], true);
    assert.match(String(ignored.results[0]?.commands[0]?.["stdout"]), /ignored|omitted/);
  } finally { f.clean(); }
});
