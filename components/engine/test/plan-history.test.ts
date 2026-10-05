import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseImplementationPlan, planBytesDigest } from "../src/implementation-plan.ts";
import { updateImplementationProgress } from "../src/plan-progress.ts";
import { buildPlan } from "../src/planning.ts";
import { checkRunRoot, runChecks } from "../src/check-run.ts";
import { dispatchChecks } from "../src/check-worker.ts";
import { PackagedCheckerAssets } from "../src/checker-assets.ts";
import { durableJson } from "../src/core.ts";
import { checkStructuredPlans } from "../src/structured-plan-check.ts";
import { qualifyPlanCheck } from "../src/plan-proof.ts";
import { processLiveFingerprint } from "../src/process-owner.ts";
import { path, resources, fixture, runFixtureCheck, replaceDeclaration } from "./fixtures/plan-progress.ts";

function replaceVerificationReference(content: string, change: (reference: Record<string, unknown>) => void) {
  const plan = parseImplementationPlan(path, content), slot = plan.slots.get("B1.V")!;
  const evidence = structuredClone(slot.evidence); change(evidence.at(-1) as Record<string, unknown>);
  return content.slice(0, slot.evidenceStart) + JSON.stringify(evidence) + content.slice(slot.evidenceEnd);
}

test("historical gate permits missing originals but rejects malformed metadata and new completion", async () => {
  const f = fixture(), previousState = process.env.XDG_STATE_HOME;
  try {
    const state = join(f.directory, "state"), runsRoot = join(state, "project-governance/check-runs");
    process.env.XDG_STATE_HOME = state;
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] });
    const result = await runFixtureCheck(f, "batch", runsRoot); assert.equal(result.status, "passed");
    updateImplementationProgress({ ...f.capture(), runsRoot, request: { version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.V", completed: true, run_id: result.run_id }] } });
    const completed = f.current();
    assert.match((completed.slots.get("B1.V")!.evidence.at(-1) as Record<string, string>).declaration_digest!, /^sha256:[a-f0-9]{64}$/u);
    let captured = f.capture(); assert.deepEqual(checkStructuredPlans(captured.subject, captured.scope, captured.packs), []);
    process.env.XDG_STATE_HOME = join(f.directory, "missing-state");
    captured = f.capture();
    const unavailable = checkStructuredPlans(captured.subject, captured.scope, captured.packs);
    assert.equal(unavailable.length, 1); assert.equal(unavailable[0]!.severity, "advisory");
    assert.equal(unavailable[0]!.rule_id, "implementation-plan.historical-proof-unavailable");
    assert.match(String(unavailable[0]!.message), /historical|freshness/u);
    const item = completed.slots.get("B1.V")!.item;
    assert.throws(() => qualifyPlanCheck({ ...captured, plan: completed, item, runId: result.run_id }), /ENOENT/u);
    const invalid = [
      (reference: Record<string, unknown>) => { delete reference.declaration_digest; },
      (reference: Record<string, unknown>) => { reference.run_id = "../outside"; },
      (reference: Record<string, unknown>) => { reference.result_digest = "invalid"; },
      (reference: Record<string, unknown>) => { reference.subject_digest = null; },
      (reference: Record<string, unknown>) => { reference.stage = "pre-commit"; },
      (reference: Record<string, unknown>) => { reference.packs = ["another-pack"]; },
      (reference: Record<string, unknown>) => { reference.task_revision = "revision-without-task"; },
    ];
    for (const change of invalid) {
      writeFileSync(join(f.root, path), replaceVerificationReference(completed.content, change));
      captured = f.capture(); const findings = checkStructuredPlans(captured.subject, captured.scope, captured.packs);
      assert.ok(findings.some(finding => finding.rule_id === "implementation-plan.proof-invalid" && finding.severity === "blocking"));
      assert.ok(findings.every(finding => finding.rule_id !== "implementation-plan.historical-proof-unavailable"));
    }
    writeFileSync(join(f.root, path), completed.content);
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.V", completed: false, reason: "Exercise strict new completion" }] });
    const pending = f.current();
    assert.throws(() => updateImplementationProgress({ ...f.capture(), request: { version: 1, expected_digest: pending.digest, batch: "B1", updates: [{ id: "B1.V", completed: true, run_id: result.run_id }] } }), /ENOENT/u);
    assert.equal(f.current().content, pending.content);
  } finally {
    if (previousState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previousState;
    rmSync(f.directory, { recursive: true, force: true });
  }
});

test("documentation gate uses the canonical owning run root outside the ambient default and blocks present tampering", async () => {
  const f = fixture(), previousState = process.env.XDG_STATE_HOME, workerRuns: string[] = [];
  try {
    process.env.XDG_STATE_HOME = join(f.directory, "unrelated-state");
    const runsRoot = join(f.directory, "retained-runs"), alias = join(f.directory, "run-alias");
    assert.notEqual(runsRoot, checkRunRoot());
    const metadata = (id: string, type: string, status: string) => `---\nid: ${id}\ntitle: Captured plan\ntype: ${type}\nstatus: ${status}\nowner: fixture\ncreated: 2026-10-05\nupdated: 2026-10-05\nsummary: Original check proof fixture\n---\n\n`;
    writeFileSync(join(f.root, path), metadata("plan.proof", "exec-plan", "active") + f.current().content);
    writeFileSync(join(f.root, "docs/exec-plans/README.md"), metadata("plans.proof", "guide", "current") + "# Plans\n\n[Active plan](active/plan.md)\n");
    writeFileSync(join(f.builtin, "documentation.yaml"), JSON.stringify({ id: "documentation", enforcement: "blocking", stages: ["pre-push"],
      path_globs: ["docs/**"], commands: [{ builtin: "documentation" }] }));
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] });
    const batch = await runFixtureCheck(f, "batch", runsRoot); assert.equal(batch.status, "passed");
    updateImplementationProgress({ ...f.capture(), runsRoot, request: { version: 1, expected_digest: f.current().digest, batch: "B1",
      updates: [{ id: "B1.V", completed: true, run_id: batch.run_id }] } });
    const originalPath = join(runsRoot, batch.run_id, "result.json"), original = readFileSync(originalPath);
    assert.equal(existsSync(join(checkRunRoot(), batch.run_id)), false);
    symlinkSync(runsRoot, alias, "dir");
    const documentation = async (detached = false) => {
      const captured = f.capture(), validation = buildPlan(captured.packs, { stage: "pre-push", mode: "impacted",
        changedPaths: captured.scope.records.map(record => record.path), explicitPackIds: ["documentation"] });
      const request = { subject: captured.subject, scope: captured.scope, assets: new PackagedCheckerAssets(join(resources, "defaults")),
        packIds: new Set(Object.keys(captured.packs)), stage: "pre-push", asOf: new Date().toISOString() };
      if (!detached) return runChecks(captured.packs, validation, request, { root: alias, trigger: "test" });
      const job = dispatchChecks(captured.packs, validation, request, { root: alias, trigger: "test", deadlineMs: 5000 });
      workerRuns.push(job.run_directory);
      const resultPath = join(job.run_directory, "result.json"), until = Date.now() + 5000;
      while (!existsSync(resultPath) && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 25));
      assert.ok(existsSync(resultPath), "Detached documentation worker did not retain its terminal result");
      return JSON.parse(readFileSync(resultPath, "utf8")) as Awaited<ReturnType<typeof runChecks>>;
    };
    const valid = await documentation();
    assert.equal(valid.run_directory, join(realpathSync(runsRoot), valid.run_id));
    assert.equal(valid.status, "passed", JSON.stringify(valid.results));
    assert.equal((await documentation(true)).status, "passed");
    assert.deepEqual(readFileSync(originalPath), original);
    durableJson(originalPath, { ...JSON.parse(original.toString()), duration_ms: -1 });
    const tampered = await documentation(true);
    assert.equal(tampered.status, "failed");
    assert.ok(tampered.results.flatMap(pack => pack.commands).some(command => command.findings.some(finding =>
      finding.rule_id === "implementation-plan.proof-invalid" && finding.severity === "blocking")));
    assert.ok(tampered.results.flatMap(pack => pack.commands).every(command => command.findings.every(finding =>
      finding.rule_id !== "implementation-plan.historical-proof-unavailable")));
    writeFileSync(originalPath, original);
    assert.equal((await documentation()).status, "passed");
    assert.deepEqual(readFileSync(originalPath), original);
  } finally {
    if (previousState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previousState;
    const active = () => workerRuns.some(directory => {
      const owner = JSON.parse(readFileSync(join(directory, "run.json"), "utf8")).owner;
      return owner?.fingerprint && processLiveFingerprint(owner.pid) === owner.fingerprint;
    }), until = Date.now() + 5000;
    while (active() && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(active(), false, `Detached proof writers must exit; evidence retained at ${f.directory}`);
    assert.ok(workerRuns.every(directory => existsSync(join(directory, "result.json"))), `Detached proof must complete before removal; evidence retained at ${f.directory}`);
    rmSync(f.directory, { recursive: true, force: true });
  }
});

test("historical gate shows sibling-workspace limits and blocks retained original tampering", async () => {
  const f = fixture(), sibling = fixture(), previousState = process.env.XDG_STATE_HOME;
  try {
    const state = join(f.directory, "state"), runsRoot = join(state, "project-governance/check-runs");
    process.env.XDG_STATE_HOME = state;
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] });
    f.git("add", path); f.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Implementation progress baseline");
    assert.ok(f.capture().scope.records.every(record => record.path !== path));
    const result = await runFixtureCheck(f, "batch", runsRoot); assert.equal(result.status, "passed");
    updateImplementationProgress({ ...f.capture(), runsRoot, request: { version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.V", completed: true, run_id: result.run_id }] } });
    writeFileSync(join(sibling.root, path), f.current().content);
    let captured = sibling.capture(), findings = checkStructuredPlans(captured.subject, captured.scope, captured.packs);
    assert.equal(findings.length, 1); assert.equal(findings[0]!.severity, "advisory"); assert.equal(findings[0]!.reason, "different-workspace");
    const resultPath = join(runsRoot, result.run_id, "result.json"), original = JSON.parse(readFileSync(resultPath, "utf8"));
    durableJson(resultPath, { ...original, duration_ms: original.duration_ms + 1 });
    captured = sibling.capture(); findings = checkStructuredPlans(captured.subject, captured.scope, captured.packs);
    assert.equal(findings.length, 1); assert.equal(findings[0]!.rule_id, "implementation-plan.proof-invalid"); assert.equal(findings[0]!.severity, "blocking");
  } finally {
    if (previousState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previousState;
    rmSync(f.directory, { recursive: true, force: true }); rmSync(sibling.directory, { recursive: true, force: true });
  }
});

test("historical proof stays advisory after original local Git history is pruned", async () => {
  const f = fixture(), previousState = process.env.XDG_STATE_HOME;
  try {
    process.env.XDG_STATE_HOME = join(f.directory, "state");
    const runsRoot = join(f.directory, "state/project-governance/check-runs");
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] });
    f.git("add", path); f.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Implementation baseline");
    const original = f.capture(); assert.ok(original.scope.records.every(record => record.path !== path));
    const result = await runFixtureCheck(f, "batch", runsRoot, original);
    updateImplementationProgress({ ...f.capture(), runsRoot, request: { version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.V", completed: true, run_id: result.run_id }] } });
    const oldBranch = f.git("symbolic-ref", "--short", "HEAD").toString().trim();
    f.git("checkout", "--orphan", "replacement"); f.git("add", ".");
    f.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Replacement history");
    f.git("branch", "-D", oldBranch); f.git("reflog", "expire", "--expire=now", "--all"); f.git("gc", "--prune=now");
    writeFileSync(join(f.root, path), f.current().content + "\n");
    const captured = f.capture(), findings = checkStructuredPlans(captured.subject, captured.scope, captured.packs);
    assert.equal(findings.length, 1); assert.equal(findings[0]!.severity, "advisory");
    assert.equal(findings[0]!.reason, "original-plan-unreachable");
    const resultPath = join(runsRoot, result.run_id, "result.json"), retained = JSON.parse(readFileSync(resultPath, "utf8"));
    durableJson(resultPath, { ...retained, duration_ms: retained.duration_ms + 1 });
    assert.equal(checkStructuredPlans(captured.subject, captured.scope, captured.packs)[0]!.severity, "blocking");
  } finally {
    if (previousState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previousState;
    rmSync(f.directory, { recursive: true, force: true });
  }
});

test("portable historical metadata binds check items and the entire specification declarations", async () => {
  const f = fixture(), previousState = process.env.XDG_STATE_HOME, specPath = "docs/specs/feature.md";
  try {
    const specification = '# Feature\n\n```governance-spec\n{"version":1,"criteria":[{"id":"R1","claim":"The operation preserves scope.","verification":"mechanical"}]}\n```\n';
    mkdirSync(join(f.root, "docs/specs")); writeFileSync(join(f.root, specPath), specification);
    writeFileSync(join(f.root, path), replaceDeclaration(f.current().content, declaration => {
      declaration.specifications = [{ path: specPath, digest: planBytesDigest(specification), criteria: ["R1"] }];
      declaration.batches[0]!.items[0]!.criteria = [{ path: specPath, id: "R1" }];
    }));
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] });
    const result = await runFixtureCheck(f); assert.equal(result.status, "passed");
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.V", completed: true, run_id: result.run_id }] });
    const completed = f.current(); process.env.XDG_STATE_HOME = join(f.directory, "missing-state");
    const changedItem = replaceDeclaration(completed.content, declaration => { declaration.batches[0]!.items[1]!.requires = []; });
    writeFileSync(join(f.root, path), changedItem);
    let captured = f.capture(); assert.ok(checkStructuredPlans(captured.subject, captured.scope, captured.packs).some(finding => finding.rule_id === "implementation-plan.proof-invalid"));
    const revised = specification.replace("# Feature", "# Revised feature rationale"); writeFileSync(join(f.root, specPath), revised);
    writeFileSync(join(f.root, path), replaceDeclaration(completed.content, declaration => { declaration.specifications[0]!.digest = planBytesDigest(revised); }));
    captured = f.capture(); const findings = checkStructuredPlans(captured.subject, captured.scope, captured.packs);
    assert.ok(findings.some(finding => finding.rule_id === "implementation-plan.proof-invalid"));
    assert.ok(findings.every(finding => finding.rule_id !== "specification.digest-mismatch"));
  } finally {
    if (previousState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previousState;
    rmSync(f.directory, { recursive: true, force: true });
  }
});

