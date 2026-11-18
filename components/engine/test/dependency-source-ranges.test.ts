import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
import { checkDependencies } from "../src/checkers/dependencies.ts";
import { loadSubjectPacks } from "../src/pack-configuration.ts";
import { buildPlan } from "../src/planning.ts";

const path = "binding/package.json", providerPath = "producer/package.json", resolver = "build/graph.js";
const proofPath = "config/policies/dependency-source-ranges.yaml";
const options = { policyPath: "config/policies/dependency-freshness.yaml", evidencePath: "config/policies/dependency-freshness-evidence.yaml",
  overridesPath: "config/policies/dependency-freshness-overrides.yaml", asOf: "2026-11-16T20:00:00Z" };
const name = "@project/carrier";
const declaration = { name: "@project/binding", version: "1.0.0", dependencies: { [name]: "^1.0.0-beta.1", outside: "2.1.0" } };
const target = { path, field: "dependencies", name, range: "^1.0.0-beta.1", recipe: "movement", framework: "react-native",
  os: "android", provider_path: providerPath, component_id: "native-movement", artifact_id: "npm-movement", version: "1.0.0-beta.1.movement" };
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const sha256 = (bytes: string) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function fixture(mode: "pass" | "swapped" | "missing-os" | "missing-owner" | "missing-input" | "unchanged-manifest" | "live-only" | "unrelated" | "self-approval") {
  const expected = [target, { ...target, os: "ios" }];
  const provider = json({ name: "@project/movement", version: "1.0.0-beta.1" });
  const resolverBytes = "// reviewed source\n";
  const bindings = expected.map(item => ({ ...item, source_name: "@project/movement", source_version: "1.0.0-beta.1" }));
  if (mode === "missing-os") bindings.pop();
  if (mode === "swapped") bindings[0]!.artifact_id = "npm-timer";
  if (mode === "missing-owner") bindings[0]!.provider_path = "missing/package.json";
  const inputs = [{ path: providerPath, sha256: sha256(provider) }, { path: resolver, sha256: sha256(resolverBytes) }];
  const proof = json({ version: 1, bindings, inputs: mode === "missing-input" ? inputs.slice(0, 1) : inputs });
  const normal = { version: 1, owner: "fixture", minimum_age_days: 14, fail_closed_when_unknown: true,
    evidence_path: options.evidencePath, override_max_days: 30 };
  const approved = { ...normal, npm_source_ranges: { projection_sha256: sha256(proof), targets: expected, inputs: inputs.map(item => item.path) } };
  const scratch = mkdtempSync(join(tmpdir(), "dependency-source-ranges-")), root = join(scratch, "source"), packs = join(scratch, "packs");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const write = (path: string, content: string) => {
    const output = join(root, path); mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, content);
  };
  try {
    mkdirSync(root); mkdirSync(packs);
    writeFileSync(join(packs, "dependencies.yaml"), json({ id: "dependencies", enforcement: "blocking",
      path_globs: ["**/package.json"], stages: ["pre-commit"], commands: [{ builtin: "dependencies" }] }));
    git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    write("config/validation/packs/project-dependencies.yaml", json({ id: "project-dependencies", enforcement: "blocking",
      path_globs: ["**/package.json"], stages: ["pre-commit"], replaces_builtin_packs: ["dependencies"], change_packet_contract: 1,
      commands: [{ run: ["node", "./check.js"] }] }));
    write(options.policyPath, json(mode === "self-approval" ? normal : approved));
    if (mode !== "self-approval") write(proofPath, proof);
    write(resolver, resolverBytes); write(providerPath, provider);
    if (mode === "unchanged-manifest") write(path, json(declaration));
    git("add", "."); git("commit", "-qm", "Fixture comparison base");
    const base = git("rev-parse", "HEAD");
    if (mode === "unchanged-manifest") write(resolver, "// modified staged source\n");
    else write(path, json(mode === "unrelated" ? { ...declaration, dependencies: { ...declaration.dependencies, unrelated: "^1.0.0-beta.1" } } : declaration));
    if (mode === "self-approval") {
      write(options.policyPath, json(approved));
      write(proofPath, proof);
    }
    git("add", ".");
    if (mode === "live-only") write(resolver, "// different live bytes\n");
    const scope = resolveChangeScope(root, { staged: true }), subject = new ValidationSubject(root, scope);
    if (mode === "unchanged-manifest") {
      assert.deepEqual(scope.records.map(row => row.path), [resolver]);
      const plan = buildPlan(loadSubjectPacks(subject, packs), { stage: "pre-commit", mode: "impacted", changedPaths: [resolver] });
      assert.deepEqual(plan.selected_packs, ["project-dependencies"]);
      assert.equal(plan.status, "ready");
    }
    const result = checkDependencies(subject, scope, options);
    git("commit", "-qm", "Fixture candidate");
    const committed = resolveChangeScope(root, { baseRef: base, candidateRef: git("rev-parse", "HEAD") });
    assert.deepEqual(checkDependencies(new ValidationSubject(root, committed), committed, options), result);
    return result;
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

test("immutable source proof resolves both expected OS bindings and retains ordinary exact obligations", () => {
  for (const mode of ["pass", "live-only"] as const) {
    const result = fixture(mode);
    assert.deepEqual(result.source_range_admissions?.map(row => row.os), ["android", "ios"]);
    assert.equal(result.signed_lock_admissions, undefined);
    assert.deepEqual(result.findings.map(row => row.rule_id), ["dependency.evidence-missing"]);
  }
});

test("source admission rejects a swapped carrier, missing OS, missing owner or staged resolver mutation", () => {
  for (const mode of ["swapped", "missing-os", "missing-owner", "missing-input", "unchanged-manifest"] as const) {
    const result = fixture(mode);
    assert.equal(result.source_range_admissions, undefined);
    assert.ok(result.findings.some(row => row.rule_id === "dependency.source-range-invalid"), mode);
  }
});

test("admission respects exact declaration and comparison-base authority", () => {
  const unrelated = fixture("unrelated");
  assert.equal(unrelated.source_range_admissions?.length, 2);
  assert.equal(unrelated.findings.filter(row => row.rule_id === "dependency.unsupported-format").length, 1);
  const candidate = fixture("self-approval");
  assert.equal(candidate.source_range_admissions, undefined);
  assert.equal(candidate.findings.filter(row => row.rule_id === "dependency.unsupported-format").length, 1);
});

const transitionPath = "config/policies/dependency-source-range-transition.yaml";
type RefreshCase = "approved" | "policy-only" | "unapproved" | "candidate-approval" | "wrong-parent" |
  "wrong-tree" | "wrong-old-digest" | "wrong-new-digest" | "extra-base-change" | "stale-base" | "retained-approval" | "delete-receipt-only" | "delete-with-unrelated-change" |
  "wrong-input-bytes" | "widened-target" | "widened-input" | "rebound-provider" | "other-policy-change";

function refreshFixture(mode: RefreshCase) {
  const root = mkdtempSync(join(tmpdir(), "dependency-source-refresh-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const write = (path: string, content: string) => {
    const output = join(root, path); mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, content);
  };
  try {
    git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    const oldTargets = [target, { ...target, os: "ios" }];
    const nextTargets = mode === "widened-target" ? [...oldTargets, { ...target, recipe: "experience" }] : oldTargets;
    const provider = json({ name: "@project/movement", version: "1.0.0-beta.1" });
    const nextProvider = mode === "rebound-provider" ? json({ name: "@project/other", version: "1.0.0-beta.1" }) : provider;
    const inputs = [providerPath, resolver], nextInputs = mode === "widened-input" ? [...inputs, "build/extra.js"] : inputs;
    const projection = (paths: string[], targets: typeof oldTargets, provider: string, graph: string) => json({
      version: 1,
      inputs: paths.map(path => ({ path, sha256: sha256(path === providerPath ? provider : graph) })),
      bindings: targets.map(row => ({ ...row, source_name: JSON.parse(provider).name, source_version: JSON.parse(provider).version })),
    });
    const oldProof = projection(inputs, oldTargets, provider, "previous producer");
    const nextProof = projection(nextInputs, nextTargets, nextProvider, "new producer");
    const policy = (proof: string, targets: typeof oldTargets, inputs: string[], minimum = 14) => json({
      version: 1, owner: "fixture", minimum_age_days: minimum, fail_closed_when_unknown: true,
      evidence_path: options.evidencePath, override_max_days: 30,
      npm_source_ranges: { projection_sha256: sha256(proof), targets, inputs },
    });
    write(options.policyPath, policy(oldProof, oldTargets, inputs));
    write(proofPath, oldProof);
    write(providerPath, provider);
    git("add", "."); git("commit", "-qm", "Original approved projection");
    const originalBase = git("rev-parse", "HEAD");

    const discardsApproval = mode === "delete-receipt-only" || mode === "delete-with-unrelated-change";
    if (!discardsApproval) {
      write(options.policyPath, policy(nextProof, nextTargets, nextInputs, mode === "other-policy-change" ? 15 : 14));
      write(proofPath, nextProof);
    }
    if (mode === "delete-with-unrelated-change") write("unrelated.txt", "This change does not apply the approval.");
    if (!discardsApproval && mode !== "policy-only") {
      write(resolver, mode === "wrong-input-bytes" ? "unreviewed producer" : "new producer");
      write(providerPath, nextProvider);
      write(path, json(declaration));
      if (mode === "widened-input") write("build/extra.js", "new producer");
    }
    git("add", ".");
    const tree = git("write-tree");
    git("reset", "--hard", originalBase);
    const approval = json({
      version: 1,
      prior_base: mode === "wrong-parent" ? "a".repeat(40) : originalBase,
      candidate_tree: mode === "wrong-tree" ? git("rev-parse", "HEAD^{tree}") : tree,
      previous_projection_sha256: mode === "wrong-old-digest" ? sha256("old") : sha256(oldProof),
      successor_projection_sha256: mode === "wrong-new-digest" ? sha256("new") : sha256(discardsApproval ? oldProof : nextProof),
    });
    if (mode !== "unapproved" && mode !== "candidate-approval") {
      write(transitionPath, approval);
      if (mode === "extra-base-change") write("other.txt", "unrelated change alongside approval");
      git("add", "."); git("commit", "-qm", "Accept only the exact transition");
    }
    if (mode === "stale-base") {
      write("after-approval.txt", "This commit is outside the reviewed transition.");
      git("add", "."); git("commit", "-qm", "Advance past the approval base");
    }
    const base = git("rev-parse", "HEAD");
    git("read-tree", "--reset", "-u", tree);
    if (mode === "candidate-approval" || mode === "retained-approval") { write(transitionPath, approval); git("add", transitionPath); }
    const stagedScope = resolveChangeScope(root, { staged: true });
    if (mode === "approved") write(resolver, "unrelated unstaged bytes");
    const staged = checkDependencies(new ValidationSubject(root, stagedScope), stagedScope, options);
    git("commit", "-qm", "Apply candidate exactly");
    const committedScope = resolveChangeScope(root, { baseRef: base, candidateRef: git("rev-parse", "HEAD") });
    const committed = checkDependencies(new ValidationSubject(root, committedScope), committedScope, options);
    assert.deepEqual(committed, staged, mode);
    return staged;
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("protected base can approve a projection refresh for one exact staged and committed tree", () => {
  const result = refreshFixture("approved");
  assert.deepEqual(result.source_range_admissions?.map(row => row.os), ["android", "ios"]);
  assert.deepEqual(result.findings.map(row => row.rule_id), ["dependency.evidence-missing"]);
});

test("a proof refresh fails closed on policy-only, unauthorized, stale, mismatched or widened subjects", () => {
  for (const mode of ["policy-only", "unapproved", "candidate-approval", "wrong-parent", "wrong-tree", "wrong-old-digest",
    "wrong-new-digest", "extra-base-change", "stale-base", "retained-approval", "delete-receipt-only", "delete-with-unrelated-change", "wrong-input-bytes", "widened-target", "widened-input", "rebound-provider",
    "other-policy-change"] as const) {
    const result = refreshFixture(mode);
    assert.equal(result.source_range_admissions, undefined, mode);
    assert.ok(result.findings.some(row => row.rule_id === "dependency.source-range-invalid"), mode);
  }
});
