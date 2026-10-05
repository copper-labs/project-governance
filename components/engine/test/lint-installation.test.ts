import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { parse, stringify } from "yaml";
import { installLintSetup } from "../src/lint-installation.ts";
import { inspectLintSetup, RUFF_STARTER } from "../src/lint-setup.ts";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lint-installation-"));
  execFileSync("git", ["init", "-q"], { cwd: root, stdio: "pipe" });
  const write = (path: string, content: string) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content); };
  return { root, write, clean: () => rmSync(root, { recursive: true, force: true }) };
}
function plan(root: string, includeDependencies = false, roots?: string[]) {
  const value = installLintSetup(root, { includeDependencies, ...(roots ? { roots } : {}) });
  assert.ok("apply" in value);
  return value;
}
test("lint setup proposal is passive and applying requires the exact current digest", () => {
  const f = fixture();
  try {
    f.write("a.py", "1\n");
    const proposed = plan(f.root);
    assert.equal(proposed.mutations, "none"); assert.equal(proposed.apply, "explicit-plan-digest-required");
    assert.ok(!existsSync(join(f.root, "ruff.toml"))); assert.ok(!existsSync(join(f.root, "config")));
    assert.throws(() => installLintSetup(f.root, { apply: true }), /changed|conflict/);
    assert.throws(() => installLintSetup(f.root, { apply: true, expectedDigest: "sha256:" + "0".repeat(64) }), /changed|conflict/);
    f.write("ruff.toml", RUFF_STARTER + "# Operator choice\n");
    assert.throws(() => installLintSetup(f.root, { apply: true, expectedDigest: proposed.plan_digest }), /changed|conflict/);
    assert.ok(!existsSync(join(f.root, "config")));
  } finally { f.clean(); }
});
test("greenfield dependency declarations stay stable when the planned npm lock appears", () => {
  const f = fixture();
  try {
    f.write("a.ts", "const value: number = 1;\n");
    const proposed = plan(f.root, true), packFile = proposed.files.find(file => file.path === "config/validation/packs/lint-eslint-root.yaml")!;
    const firstPack = parse(packFile.content) as { lint: { inputs: string[] }; path_globs: string[] };
    assert.deepEqual(proposed.declarations["lint-eslint-root"]!.tool.argv, ["node", "node_modules/eslint/bin/eslint.js"]);
    assert.ok(firstPack.lint.inputs.includes("package.json")); assert.ok(firstPack.path_globs.includes("package.json"));
    assert.ok(firstPack.lint.inputs.includes("package-lock.json")); assert.ok(firstPack.path_globs.includes("package-lock.json"));
    assert.ok(!proposed.files.some(file => file.path === "package-lock.json"));
    const applied = installLintSetup(f.root, { includeDependencies: true, apply: true, expectedDigest: proposed.plan_digest });
    assert.equal(applied.status, "installed"); assert.ok("acquisition" in applied); assert.equal(applied.acquisition, "not-performed");
    assert.ok("checks" in applied); assert.equal(applied.checks, "not-performed"); assert.ok(!existsSync(join(f.root, "node_modules"))); assert.ok(!existsSync(join(f.root, "package-lock.json")));
    const manifest = JSON.parse(readFileSync(join(f.root, "package.json"), "utf8"));
    assert.deepEqual(manifest.devDependencies, { eslint: "9.39.1", "@typescript-eslint/parser": "8.46.4" });
    assert.deepEqual(inspectLintSetup(f.root).findings, []);
    assert.ok(!inspectLintSetup(f.root).files.some(file => file.path.startsWith("config/validation/packs/")));
    const repeated = plan(f.root, true); assert.deepEqual(repeated.files, []); assert.deepEqual(repeated.findings, []);
    assert.ok(repeated.owners.some(owner => owner.state === "needs-setup" && (owner.missing_inputs as string[]).includes("package-lock.json")));
    const reapplied = installLintSetup(f.root, { includeDependencies: true, apply: true, expectedDigest: repeated.plan_digest });
    assert.equal(reapplied.status, "unchanged"); assert.deepEqual(reapplied.files, []);
    // This fixture represents the output of the operator's later npm install; setup never runs it.
    f.write("package-lock.json", '{"name":"fixture","lockfileVersion":3,"packages":{}}\n');
    const acquired = plan(f.root, true); assert.deepEqual(acquired.files, []); assert.deepEqual(acquired.findings, []);
    assert.ok(!inspectLintSetup(f.root).files.some(file => file.path.startsWith("config/validation/packs/")));
    const afterAcquisition = installLintSetup(f.root, { includeDependencies: true, apply: true, expectedDigest: acquired.plan_digest });
    assert.equal(afterAcquisition.status, "unchanged"); assert.ok(!existsSync(join(f.root, "node_modules")));
  } finally { f.clean(); }
});
test("nested source owners capture the project manifest created by setup", () => {
  const f = fixture();
  try {
    f.write("src/a.ts", "const value: number = 1;\n");
    const proposed = plan(f.root, true, ["src"]);
    assert.ok(proposed.declarations["lint-eslint-src"]!.inputs.includes("package.json"));
    installLintSetup(f.root, { roots: ["src"], includeDependencies: true, apply: true, expectedDigest: proposed.plan_digest });
    const repeated = plan(f.root, true, ["src"]); assert.deepEqual(repeated.findings, []); assert.deepEqual(repeated.files, []);
  } finally { f.clean(); }
});
test("Python-only dependency opt-in does not declare a manifest the writer will not create", () => {
  const f = fixture();
  try {
    f.write("a.py", "1\n"); const proposed = plan(f.root, true);
    assert.ok(!proposed.declarations["lint-ruff-root"]!.inputs.includes("package.json"));
    assert.ok(!proposed.declarations["lint-ruff-root"]!.inputs.includes("package-lock.json"));
    installLintSetup(f.root, { includeDependencies: true, apply: true, expectedDigest: proposed.plan_digest });
    assert.ok(!existsSync(join(f.root, "package.json"))); assert.deepEqual(plan(f.root, true).files, []);
  } finally { f.clean(); }
});
test("dependency setup retains existing pnpm and Yarn lock owners", () => {
  for (const lock of ["pnpm-lock.yaml", "yarn.lock"]) {
    const f = fixture();
    try {
      f.write("a.ts", "const value: number = 1;\n"); f.write(lock, lock === "pnpm-lock.yaml" ? "lockfileVersion: '9.0'\n" : "# yarn lockfile v1\n");
      const proposed = plan(f.root, true), inputs = proposed.declarations["lint-eslint-root"]!.inputs;
      assert.ok(inputs.includes(lock)); assert.ok(!inputs.includes("package-lock.json"));
      installLintSetup(f.root, { includeDependencies: true, apply: true, expectedDigest: proposed.plan_digest });
      assert.ok(!existsSync(join(f.root, "package-lock.json"))); assert.deepEqual(plan(f.root, true).files, []);
    } finally { f.clean(); }
  }
});
test("setup preserves existing config rules and profile fields, obligations and exclusions", () => {
  const f = fixture();
  try {
    f.write("a.py", "1\n");
    const config = '# Owner rules\n[lint]\nselect=["ALL"]\n'; f.write("ruff.toml", config);
    const retained = { version: 1, require_first_source: true, requirements: [{ pack_id: "lint-native", roots: ["native"], stages: ["batch", "pre-commit"] }], exclusions: [{ root: "generated", reason: "Generated externally" }] };
    f.write("config/governance/profile.yaml", "# Project profile\n" + stringify({ schema_version: 1, project_extensions: ["retained-owner"], custom: { unchanged: true }, lint: retained }));
    const proposed = plan(f.root); assert.ok(!proposed.files.some(file => file.path === "ruff.toml"));
    installLintSetup(f.root, { apply: true, expectedDigest: proposed.plan_digest });
    assert.equal(readFileSync(join(f.root, "ruff.toml"), "utf8"), config);
    const profileBytes = readFileSync(join(f.root, "config/governance/profile.yaml"), "utf8"), profile = parse(profileBytes);
    assert.ok(profileBytes.startsWith("# Project profile\n")); assert.deepEqual(profile.project_extensions, ["retained-owner"]); assert.deepEqual(profile.custom, { unchanged: true });
    assert.deepEqual(profile.lint.requirements[0], retained.requirements[0]); assert.deepEqual(profile.lint.exclusions, retained.exclusions);
    const repeated = plan(f.root); assert.deepEqual(repeated.files, []); assert.equal(readFileSync(join(f.root, "config/governance/profile.yaml"), "utf8"), profileBytes);
  } finally { f.clean(); }
});
test("setup refuses to replace an existing dependency pin or conflicting owned pack", () => {
  const f = fixture();
  try {
    f.write("a.ts", "const value: number = 1;\n"); f.write("package.json", '{"devDependencies":{"eslint":"10.0.0"}}\n');
    assert.throws(() => plan(f.root, true), /explicit reconciliation/); assert.ok(!existsSync(join(f.root, "config")));
    f.write("config/validation/packs/lint-eslint-root.yaml", "id: lint-eslint-root\n# Existing owner\n");
    const proposed = plan(f.root); assert.ok(proposed.findings.some(finding => finding.code === "lint-setup-conflict"));
    assert.throws(() => installLintSetup(f.root, { apply: true, expectedDigest: proposed.plan_digest }), /conflicts/);
  } finally { f.clean(); }
});
