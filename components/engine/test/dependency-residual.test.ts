import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
import { checkDependencies } from "../src/checkers/dependencies.ts";

const policyPath = "config/policies/dependency-freshness.yaml";
const evidencePath = "config/policies/dependency-freshness-evidence.yaml";
const options = { policyPath, evidencePath, overridesPath: "config/policies/dependency-freshness-overrides.yaml",
  asOf: "2026-11-18T12:00:00Z" };
const consumer = "fixtures/consumer/package.json", lock = "fixtures/consumer/package-lock.json";
const owner = "packages/owner/package.json", otherOwner = "packages/other/package.json", name = "@example/owner";
const spec = "file:../../packages/owner", version = "1.0.0-beta.1";
const makeLock = () => ({ lockfileVersion: 3, packages: {
  "": { dependencies: { [name]: spec } },
  ["node_modules/" + name]: { link: true, resolved: "../../packages/owner" },
  "../../packages/owner": { name, version },
} });

function fixture(run: (context: { write: (path: string, value: unknown) => void; git: (...args: string[]) => string;
  check: (base?: string, candidate?: string) => ReturnType<typeof checkDependencies>; root: string }) => void) {
  const root = mkdtempSync(join(tmpdir(), "dependency-residual-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const write = (path: string, value: unknown) => {
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, JSON.stringify(value, null, 2) + "\n");
  };
  try {
    git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@invalid");
    git("config", "core.hooksPath", "/dev/null");
    write(policyPath, { version: 1, owner: "fixture", minimum_age_days: 14, fail_closed_when_unknown: true,
      evidence_path: evidencePath, override_max_days: 30 });
    git("add", "."); git("commit", "-qm", "Base policy");
    const check = (base?: string, candidate?: string) => {
      const scope = resolveChangeScope(root, candidate ? { baseRef: base!, candidateRef: candidate } : { staged: true });
      return checkDependencies(new ValidationSubject(root, scope), scope, options);
    };
    run({ write, git, check, root });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("captured file link requires the same version and path in the owner and sibling npm lock", () => fixture(({ write, git, check }) => {
  const base = git("rev-parse", "HEAD");
  write(consumer, { dependencies: { [name]: spec } });
  write(owner, { name, version });
  write(lock, makeLock());
  git("add", ".");
  write(owner, { name: "live-only-drift", version: "9.0.0" });
  const staged = check();
  assert.deepEqual(staged.findings, []);
  assert.deepEqual(staged.tracked_npm_link_admissions, [{
    path: consumer, field: "dependencies", name, spec, version,
    consumer_blob: git("rev-parse", ":" + consumer), owner_path: owner, owner_blob: git("rev-parse", ":" + owner),
    lock_path: lock, lock_blob: git("rev-parse", ":" + lock),
  }]);
  git("commit", "-qm", "File link");
  assert.deepEqual(check(base, git("rev-parse", "HEAD")), staged);
  git("add", owner);
  const broken = check();
  assert.equal(broken.tracked_npm_link_admissions, undefined);
  assert(broken.findings.some(row => row.path === consumer && row.rule_id === "dependency.unsupported-format"));
}));

test("a lock-only change rechecks a tracked consumer; an alternate same-name owner is not its lock target", () => fixture(({ write, git, check }) => {
  write(consumer, { dependencies: { [name]: spec } });
  write(owner, { name, version });
  write(otherOwner, { name, version });
  write(lock, makeLock());
  git("add", ".");
  git("commit", "-qm", "Accepted locally");
  const redirected = makeLock();
  redirected.packages["node_modules/" + name] = { link: true, resolved: "../../packages/other" };
  write(lock, redirected);
  git("add", lock);
  assert.deepEqual(check().findings.map(row => [row.rule_id, row.path]), [["dependency.unsupported-format", consumer]]);
}));

test("external, escaping, unsupported and untracked file owners retain format findings", () => {
  for (const unaccepted of ["https://example.com/pkg.tgz", "file:/pkg", "file:../../../escape", "file:../../packages/owner.tgz",
    "file:../../packages/owner/../owner", "file:../../packages/%6fwner", "workspace:*", "link:../../packages/owner", spec]) {
    fixture(({ write, git, check }) => {
      write(consumer, { dependencies: { [name]: unaccepted } });
      write(lock, makeLock());
      git("add", ".");
      write(owner, { name, version });
      const result = check();
      assert.equal(result.tracked_npm_link_admissions, undefined);
      assert.deepEqual(result.findings.map(row => row.rule_id), ["dependency.unsupported-format"], unaccepted);
    });
  }
});

test("stale and registry locks, peer links and symlinked owner manifests fail closed", () => {
  for (const mode of ["stale", "registry", "peer", "symlink", "shadow-lock", "workspace-lock"]) fixture(({ write, git, check, root }) => {
    write(consumer, { [mode === "peer" ? "peerDependencies" : "dependencies"]: { [name]: spec } });
    if (mode === "symlink") {
      write(otherOwner, { name, version });
      mkdirSync(join(root, dirname(owner)), { recursive: true });
      symlinkSync("../other/package.json", join(root, owner));
    } else write(owner, { name, version });
    const lockData = makeLock();
    if (mode === "stale") lockData.packages["../../packages/owner"].version = "0.0.0";
    if (mode === "registry") lockData.packages["node_modules/" + name] = { link: true, resolved: "https://registry.npmjs.org/pkg" };
    if (mode === "shadow-lock") write("fixtures/consumer/npm-shrinkwrap.json", {});
    if (mode === "workspace-lock") write("package.json", { workspaces: ["fixtures/*"] });
    write(lock, lockData);
    git("add", ".");
    const result = check();
    assert.equal(result.tracked_npm_link_admissions, undefined);
    assert(result.findings.some(row => row.path === consumer && row.rule_id === "dependency.unsupported-format"), mode);
  });
});

test("a tracked directory with an archive suffix cannot impersonate an npm file link", () => fixture(({ write, git, check }) => {
  const archiveSpec = spec + ".tgz";
  write(consumer, { dependencies: { [name]: archiveSpec } });
  write("packages/owner.tgz/package.json", { name, version });
  write(lock, { lockfileVersion: 3, packages: {
    "": { dependencies: { [name]: archiveSpec } },
    ["node_modules/" + name]: { link: true, resolved: "../../packages/owner.tgz" },
    "../../packages/owner.tgz": { name, version },
  } });
  git("add", ".");
  assert.deepEqual(check().findings.map(row => [row.rule_id, row.path]), [["dependency.unsupported-format", consumer]]);
}));

test("a new or newly scoped exact override requires ordinary release age evidence for the leaf", () => fixture(({ write, git, check }) => {
  const path = "package.json";
  write(path, { overrides: { parent: { leaf: "^1.0.0" } } });
  git("add", path); git("commit", "-qm", "Previous ranged leaf");
  write(path, { overrides: { parent: { leaf: "1.2.3" } } });
  git("add", path);
  const missing = check();
  assert.deepEqual(missing.findings.map(row => row.rule_id), ["dependency.evidence-missing"]);
  assert.match(String(missing.findings[0]!.message), /\["npm","leaf","1\.2\.3","override"\]/u);
  const record = { ecosystem: "npm", name: "leaf", version: "1.2.3", artifact_type: "override",
    source_url: "https://registry.npmjs.org/leaf/1.2.3", evaluated_at: options.asOf };
  const catalog = (published_at: string) => ({ version: 2, owner: "fixture", records: [{ ...record, published_at }] });
  write(evidencePath, catalog("2026-11-04T12:00:01Z")); git("add", evidencePath);
  assert.deepEqual(check().findings.map(row => row.rule_id), ["dependency.evidence-invalid"]);
  write(evidencePath, catalog("2026-11-04T12:00:00Z")); git("add", evidencePath);
  assert.deepEqual(check().findings, []);
}));

test("an exact nested leaf keeps its authored parent in change detection", () => {
  for (const next of [{ parent: { leaf: "1.2.3" } }, { another: { leaf: "1.2.3" } }, { leaf: "1.2.3" }]) {
    fixture(({ write, git, check }) => {
      write("package.json", { overrides: { parent: { leaf: "1.2.3" } } });
      git("add", "."); git("commit", "-qm", "Existing scoped pin");
      write("package.json", { description: "edited manifest", overrides: next }); git("add", ".");
      assert.deepEqual(check().findings.map(row => row.rule_id), "parent" in next ? [] : ["dependency.evidence-missing"]);
    });
  }
});

test("wildcards, version selectors, scope-widening forms and unreviewed leaves fail closed", () => {
  for (const overrides of [{ "*": { leaf: "1.2.3" } }, { "parent@^1": { leaf: "1.2.3" } },
    { parent: { "leaf@1.2.3": "1.2.3" } }, { parent: { ".": "1.2.3", leaf: "1.2.3" } },
    { parent: { leaf: "1.2.3", extra: "^2.0.0" } }, { parent: { leaf: { extra: "2.0.0" } } },
    { parent: { leaf: "$leaf" } }, { parent: { leaf: "file:../pkg" } }, { parent: { leaf: "npm:other@1.2.3" } }]) {
    fixture(({ write, git, check }) => {
      write("package.json", { overrides }); git("add", ".");
      assert.deepEqual(check().findings.map(row => row.rule_id), ["dependency.unsupported-format"]);
    });
  }
});
