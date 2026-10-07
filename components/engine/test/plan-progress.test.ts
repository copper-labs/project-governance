import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasImplementationPlanDeclaration, parseImplementationPlan, planBytesDigest, normalizedPlanContent } from "../src/implementation-plan.ts";
import { updateImplementationProgress, inspectImplementationBatch, type PlanProgressRequest } from "../src/plan-progress.ts";
import { ValidationSubject, resolveChangeScope } from "../src/change-subject.ts";
import { buildPlan } from "../src/planning.ts";
import { runChecks } from "../src/check-run.ts";
import { PackagedCheckerAssets } from "../src/checker-assets.ts";
import { digest, durableJson } from "../src/core.ts";
import { checkStructuredPlans } from "../src/structured-plan-check.ts";
import { qualifyPlanCheck } from "../src/plan-proof.ts";
import { commandExecutable } from "../src/native-check-command.ts";
import { RUFF_STARTER } from "../src/lint-setup.ts";
import { path, resources, template, fixture, runFixtureCheck, replaceDeclaration } from "./fixtures/plan-progress.ts";

function configureCustomCheck(f: ReturnType<typeof fixture>) {
  writeFileSync(join(f.root, "checker.mjs"), `import {readFileSync} from 'node:fs';\nimport {createHash} from 'node:crypto';\nconst files=['code.txt','clean.txt','checker.mjs'].map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}));\nconst passed=readFileSync('code.txt','utf8')==='implemented\\n'&&readFileSync('clean.txt','utf8')==='unchanged prerequisite\\n';\nconsole.log(JSON.stringify({status:passed?'passed':'failed',findings:passed?[]:[{rule_id:'fixture.behavior',severity:'blocking',message:'fixture input differs'}],input_manifest:{version:1,status:'complete',files}}));\n`);
  writeFileSync(join(f.builtin, "format.yaml"), JSON.stringify({ id: "fixture-format", enforcement: "blocking", stages: ["batch"], path_globs: ["**"], commands: [{ run: [process.execPath, "checker.mjs"] }] }));
}

test("custom and built-in not-applicable commands cannot complete verification", async () => {
  for (const kind of ["custom", "builtin"]) {
    const f = fixture();
    try {
      if (kind === "custom") {
        configureCustomCheck(f);
        writeFileSync(join(f.root, "checker.mjs"), readFileSync(join(f.root, "checker.mjs"), "utf8").replace("status:passed?'passed':'failed'", "status:'not-applicable'"));
      } else {
        writeFileSync(join(f.builtin, "format.yaml"), JSON.stringify({ id: "fixture-format", enforcement: "blocking", stages: ["batch"], path_globs: ["**"], commands: [{ builtin: "apple-dependencies" }] }));
      }
      f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] });
      const result = await runFixtureCheck(f); assert.equal(result.status, "passed", JSON.stringify(result.results));
      assert.equal(result.results[0]!.commands[0]!.status, "not-applicable");
      const before = f.current();
      assert.throws(() => f.update({ version: 1, expected_digest: before.digest, batch: "B1", updates: [{ id: "B1.V", completed: true, run_id: result.run_id }] }), /not applicable|zero lint/u);
      assert.equal(f.current().content, before.content);
      assert.equal(JSON.parse(readFileSync(join(f.directory, "runs", result.run_id, "result.json"), "utf8")).results[0].commands[0].status, "not-applicable");
    } finally { rmSync(f.directory, { recursive: true, force: true }); }
  }
});

test("a normal zero-source Ruff check retains its outcome and cannot complete verification", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, "ruff.toml"), RUFF_STARTER);
    f.git("add", "ruff.toml"); f.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Lint configuration baseline");
    writeFileSync(join(f.builtin, "format.yaml"), JSON.stringify({ id: "fixture-format", enforcement: "blocking", stages: ["batch"], path_globs: ["**"],
      lint: { version: 1, backend: "ruff", roots: ["src"], config: "ruff.toml", inputs: [], excludes: [], tool: { argv: [commandExecutable("ruff", f.root)], version: "0.15.14" }, dependency_roots: [] },
      commands: [{ run: [process.execPath, fileURLToPath(new URL("../src/lint-adapter.ts", import.meta.url)), "--pack", "fixture-format"] }] }));
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] });
    const result = await runFixtureCheck(f); assert.equal(result.status, "passed", JSON.stringify(result.results));
    const command = result.results[0]!.commands[0]!;
    assert.equal(command.status, "not-applicable"); assert.equal((command.lint_evidence as { checked_count: number }).checked_count, 0);
    assert.ok((command.input_manifest as { files: unknown[] }).files.length > 0);
    const before = f.current(), request: PlanProgressRequest = { version: 1, expected_digest: before.digest, batch: "B1", updates: [{ id: "B1.V", completed: true, run_id: result.run_id }] };
    assert.throws(() => f.update(request), /not applicable|zero lint/u);
    // Even a conflicting passed summary cannot certify that the linter checked any source.
    const resultPath = join(f.directory, "runs", result.run_id, "result.json"), retained = JSON.parse(readFileSync(resultPath, "utf8"));
    retained.results[0].commands[0].status = "passed"; durableJson(resultPath, retained);
    assert.throws(() => f.update(request), /not applicable|zero lint/u);
    assert.equal(f.current().content, before.content);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test("invalidation covers batch dependencies and closeout's implicit prerequisites", async () => {
  const f = fixture();
  try {
    let content = replaceDeclaration(f.current().content, declaration => {
      declaration.batches[0]!.items[2]!.requires = [];
      declaration.batches.push({ id: "B2", depends_on: ["B1"], items: [{ id: "B2.I", kind: "implementation", requires: [] }] });
    });
    content += "\n<!-- governance:item B2.I -->\n- [ ] Implement dependent behavior.\n<!-- governance:evidence B2.I -->[]<!-- /governance:evidence -->\n";
    writeFileSync(join(f.root, path), content);
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] });
    const result = await runFixtureCheck(f); assert.equal(result.status, "passed", JSON.stringify(result.results));
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.V", completed: true, run_id: result.run_id }, { id: "B1.C", completed: true }] });
    const closeout = f.current();
    assert.throws(() => f.update({ version: 1, expected_digest: closeout.digest, batch: "B1", updates: [{ id: "B1.V", completed: false, reason: "Rework" }] }), /Dependent|prerequisite/u);
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B2", updates: [{ id: "B2.I", completed: true }] });
    const dependent = f.current();
    assert.throws(() => f.update({ version: 1, expected_digest: dependent.digest, batch: "B1", updates: [{ id: "B1.V", completed: false, reason: "Rework" }, { id: "B1.C", completed: false, reason: "Rework" }] }), /Dependent|prerequisite/u);
    assert.equal(f.current().content, dependent.content);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test("custom proof requires a complete native input manifest and confirmed native cleanup", async () => {
  const f = fixture();
  try {
    configureCustomCheck(f);
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] });
    const result = await runFixtureCheck(f); assert.equal(result.status, "passed", JSON.stringify(result.results));
    const directory = join(f.directory, "runs", result.run_id), resultPath = join(directory, "result.json"), original = JSON.parse(readFileSync(resultPath, "utf8"));
    assert.equal(f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.V", completed: true, run_id: result.run_id }] }).status, "updated");
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.V", completed: false, reason: "Exercise proof refusal" }] });
    const before = f.current(), request: PlanProgressRequest = { version: 1, expected_digest: before.digest, batch: "B1", updates: [{ id: "B1.V", completed: true, run_id: result.run_id }] };
    for (const manifest of [undefined, { version: 1, status: "incomplete", files: [] }, { version: 1, status: "complete", files: [{ path: "code.txt", sha256: "0".repeat(64) }] }]) {
      const damaged = structuredClone(original);
      if (manifest === undefined) delete damaged.results[0].commands[0].input_manifest;
      else damaged.results[0].commands[0].input_manifest = manifest;
      durableJson(resultPath, damaged);
      assert.throws(() => f.update(request), /input|manifest|cleanup|evidence/u);
      if (manifest === undefined) {
        const captured = f.capture();
        assert.throws(() => qualifyPlanCheck({ ...captured, plan: before, item: before.slots.get("B1.V")!.item, runId: result.run_id, runsRoot: join(f.directory, "runs"), historical: true }), /input|manifest|evidence/u);
      }
    }
    durableJson(resultPath, original);
    const nativeDirectory = join(directory, digest("fixture-format").slice(7), "command-0"), nativePath = join(nativeDirectory, "result.json");
    const native = JSON.parse(readFileSync(nativePath, "utf8")), unknown = { ...native, cleanup: "unknown" };
    durableJson(nativePath, unknown);
    const damaged = structuredClone(original); damaged.results[0].commands[0].command_receipt = unknown;
    durableJson(resultPath, damaged);
    assert.throws(() => f.update(request), /cleanup|evidence/u);
    assert.equal(f.current().content, before.content);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test("complete custom manifests recheck live dependencies outside explicit changed paths", async () => {
  const f = fixture();
  try {
    configureCustomCheck(f);
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] });
    const scope = resolveChangeScope(f.root, { baseRef: "HEAD", paths: [path, "code.txt", "checker.mjs"] });
    const captured = { scope, subject: new ValidationSubject(f.root, scope), packs: f.capture().packs };
    const result = await runFixtureCheck(f, "batch", join(f.directory, "runs"), { ...captured, path });
    assert.equal(result.status, "passed", JSON.stringify(result.results));
    const before = f.current();
    writeFileSync(join(f.root, "clean.txt"), "changed outside explicit selection\n");
    assert.throws(() => updateImplementationProgress({ ...captured, path, runsRoot: join(f.directory, "runs"), request: {
      version: 1, expected_digest: before.digest, batch: "B1", updates: [{ id: "B1.V", completed: true, run_id: result.run_id }],
    } }), /input|manifest|evidence|stale/u);
    assert.equal(f.current().content, before.content);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test("progress preserves a UTF-8 BOM outside its machine-owned slots", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, path), "\ufeff" + f.current().content);
    const before = f.current();
    assert.equal(f.update({ version: 1, expected_digest: before.digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] }).status, "updated");
    assert.equal(readFileSync(join(f.root, path)).subarray(0, 3).toString("hex"), "efbbbf");
    assert.equal(normalizedPlanContent(f.current()), normalizedPlanContent(before));
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test("a JSON array cannot impersonate an implementation or verification item kind", () => {
  for (const kind of [["implementation"], ["verification"], ["closeout"]]) {
    const content = template().replace('"kind": "implementation"', `"kind": ${JSON.stringify(kind)}`);
    assert.throws(() => parseImplementationPlan(path, content), /item|kind/u);
  }
});

test("declaration and slot examples inside Markdown fences do not opt in or gain ownership", () => {
  const example = "````markdown\n" + template() + "````\n";
  assert.equal(hasImplementationPlanDeclaration(example), false);
  assert.throws(() => parseImplementationPlan(path, example), /governance-plan/u);
  const current = template(true), wrapped = current + "\r\n" + example.replaceAll("\n", "\r\n");
  const parsed = parseImplementationPlan(path, wrapped);
  assert.equal(hasImplementationPlanDeclaration(wrapped), true);
  assert.equal(parsed.slots.size, 3);
  for (const slot of parsed.slots.values()) assert.ok(slot.stateOffset < current.length);
  assert.ok(normalizedPlanContent(parsed).endsWith(example.replaceAll("\n", "\r\n")));
  const fencedSlots = template().replace(/(<!-- governance:item B1.I -->[\s\S]*?<!-- \/governance:evidence -->)/u, "```markdown\n$1\n```");
  assert.throws(() => parseImplementationPlan(path, fencedSlots), /progress slots/u);
});

test("progress recaptures clean-file and new-file changes after the original check dispatch", async () => {
  const f = fixture();
  try {
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] });
    const captured = f.capture(), result = await runFixtureCheck(f), before = f.current();
    assert.equal(result.status, "passed");
    const request: PlanProgressRequest = { version: 1, expected_digest: before.digest, batch: "B1", updates: [{ id: "B1.V", completed: true, run_id: result.run_id }] };
    writeFileSync(join(f.root, "clean.txt"), "changed after dispatch\n");
    assert.throws(() => updateImplementationProgress({ ...captured, path, request, runsRoot: join(f.directory, "runs") }), /stale|changed|unqualified/u);
    writeFileSync(join(f.root, "clean.txt"), "unchanged prerequisite\n");
    writeFileSync(join(f.root, "new.txt"), "new source after dispatch\n");
    assert.throws(() => updateImplementationProgress({ ...captured, path, request, runsRoot: join(f.directory, "runs") }), /stale|changed|unqualified/u);
    assert.equal(f.current().content, before.content);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test("updating explicit progress commentary reuses the original check without changing its receipt", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, path), f.current().content.replace("Current/next: original.\n",
      "<!-- governance:notes progress -->\nCurrent/next: original.\n<!-- /governance:notes progress -->\n"));
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] });
    const result = await runFixtureCheck(f); assert.equal(result.status, "passed");
    const originalPath = join(f.directory, "runs", result.run_id, "result.json"), original = readFileSync(originalPath);
    writeFileSync(join(f.root, path), f.current().content.replace("Current/next: original.", "Current/next: record the completed narrow proof."));
    const request: PlanProgressRequest = { version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.V", completed: true, run_id: result.run_id }] };
    assert.equal(f.update(request).status, "updated");
    assert.deepEqual(readFileSync(originalPath), original);
    assert.equal(f.current().slots.get("B1.V")?.completed, true);
    assert.equal(f.update(request).status, "unchanged");
    writeFileSync(join(f.root, "code.txt"), "changed after proof\n");
    const staleRequest = { ...request, expected_digest: f.current().digest };
    assert.throws(() => f.update(staleRequest), /stale|changed|unqualified/u);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test("staged proof permits live bookkeeping but refuses revised live semantic plan content", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.builtin, "format.yaml"), JSON.stringify({ id: "fixture-format", enforcement: "blocking", stages: ["batch", "pre-commit"], path_globs: ["**"], commands: [{ builtin: "format" }] }));
    writeFileSync(join(f.root, path), replaceDeclaration(f.current().content, declaration => { declaration.batches[0]!.items[1]!.check!.stage = "pre-commit"; }));
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] });
    f.git("add", path, "code.txt");
    const scope = resolveChangeScope(f.root, { staged: true }), captured = { scope, subject: new ValidationSubject(f.root, scope), packs: f.capture().packs, path };
    const result = await runFixtureCheck(f, "pre-commit", join(f.directory, "runs"), captured); assert.equal(result.status, "passed");
    const request: PlanProgressRequest = { version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.V", completed: true, run_id: result.run_id }] };
    assert.equal(updateImplementationProgress({ ...captured, request, runsRoot: join(f.directory, "runs") }).status, "updated");
    writeFileSync(join(f.root, path), f.current().content.replace("Keep this exact prose.", "A revised semantic requirement."));
    const revised = f.current();
    assert.throws(() => updateImplementationProgress({ ...captured, request: { ...request, expected_digest: revised.digest }, runsRoot: join(f.directory, "runs") }), /subject|semantic|captured|plan|candidate/iu);
    assert.equal(f.current().content, revised.content);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test("renaming a bound specification selects its unchanged plan and reports the unresolved old path", () => {
  const f = fixture(), specPath = "docs/specs/feature.md";
  try {
    const specification = '# Feature\n\n```governance-spec\n{"version":1,"criteria":[{"id":"R1","claim":"The operation preserves scope.","verification":"mechanical"}]}\n```\n';
    mkdirSync(join(f.root, "docs/specs")); writeFileSync(join(f.root, specPath), specification);
    const content = replaceDeclaration(f.current().content, declaration => {
      declaration.specifications = [{ path: specPath, digest: planBytesDigest(specification), criteria: ["R1"] }];
      declaration.batches[0]!.items[0]!.criteria = [{ path: specPath, id: "R1" }];
    });
    writeFileSync(join(f.root, path), content); f.git("add", ".");
    f.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Bound specification");
    renameSync(join(f.root, specPath), join(f.root, "docs/specs/renamed.md")); f.git("add", ".");
    const captured = f.capture();
    assert.equal(captured.scope.records.find(record => record.path === "docs/specs/renamed.md")?.previous_path, specPath);
    assert.equal(captured.scope.records.some(record => record.path === path), false);
    assert.ok(checkStructuredPlans(captured.subject, captured.scope, captured.packs).some(finding => finding.rule_id === "specification.source-unavailable"));
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test("failed native checks, another stage and another workspace cannot complete verification", async () => {
  const f = fixture(), foreign = fixture();
  try {
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] });
    const before = f.current(), update = (runId: string) => f.update({ version: 1, expected_digest: before.digest, batch: "B1", updates: [{ id: "B1.V", completed: true, run_id: runId }] });
    writeFileSync(join(f.root, "code.txt"), "implemented   \n");
    const failed = await runFixtureCheck(f); assert.equal(failed.status, "failed");
    assert.throws(() => update(failed.run_id), /failed|incomplete/u);
    writeFileSync(join(f.root, "code.txt"), "implemented\n");
    writeFileSync(join(f.builtin, "format.yaml"), JSON.stringify({ id: "fixture-format", enforcement: "blocking", stages: ["batch", "pre-push"], path_globs: ["**"], commands: [{ builtin: "format" }] }));
    const wrongStage = await runFixtureCheck(f, "pre-push"); assert.equal(wrongStage.status, "passed");
    assert.throws(() => update(wrongStage.run_id), /stage/u);
    const otherWorkspace = await runFixtureCheck(foreign, "batch", join(f.directory, "runs")); assert.equal(otherWorkspace.status, "passed");
    assert.throws(() => update(otherWorkspace.run_id), /unrelated/u);
    assert.equal(f.current().content, before.content);
  } finally { rmSync(f.directory, { recursive: true, force: true }); rmSync(foreign.directory, { recursive: true, force: true }); }
});

test("explicit task identity and revision require matching original dispatch binding", async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, path), replaceDeclaration(f.current().content, declaration => {
      Object.assign(declaration.batches[0]!.items[1]!.check!, { task_id: "expected-task", task_revision: "2" });
    }));
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] });
    const result = await runFixtureCheck(f), before = f.current(), directory = join(f.directory, "runs", result.run_id);
    assert.equal(result.status, "passed");
    const request: PlanProgressRequest = { version: 1, expected_digest: before.digest, batch: "B1", updates: [{ id: "B1.V", completed: true, run_id: result.run_id }] };
    for (const binding of [{ status: "bound", taskId: "wrong-task", revision: "2" }, { status: "bound", taskId: "expected-task", revision: "1" }]) {
      durableJson(join(directory, "dispatch.json"), { taskBinding: binding });
      assert.throws(() => f.update(request), /task identity|revision/u);
    }
    assert.equal(f.current().content, before.content);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test("a formerly task-bound receipt refuses unknown current binding while retaining historical identity", async () => {
  const f = fixture();
  try {
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] });
    const result = await runFixtureCheck(f); assert.equal(result.status, "passed");
    durableJson(join(f.directory, "runs", result.run_id, "dispatch.json"), { taskBinding: { status: "bound", source: "explicit", taskId: "original-task", revision: "3" } });
    const before = f.current(), captured = f.capture(), proofOptions = { ...captured, plan: before, item: before.slots.get("B1.V")!.item, runId: result.run_id, runsRoot: join(f.directory, "runs") };
    assert.throws(() => f.update({ version: 1, expected_digest: before.digest, batch: "B1", updates: [{ id: "B1.V", completed: true, run_id: result.run_id }] }), /task binding is unavailable/u);
    const historical = qualifyPlanCheck({ ...proofOptions, historical: true });
    assert.equal(historical.task_id, "original-task"); assert.equal(historical.task_revision, "3");
    assert.equal(f.current().content, before.content);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});
test("typed progress updates preserve CRLF, narrative and mode; repeats are harmless and stale writes refuse", () => {
  const f = fixture(true);
  try {
    const before = f.current(), request: PlanProgressRequest = { version: 1, expected_digest: before.digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] };
    assert.equal(f.update(request).status, "updated"); const after = f.current();
    assert.equal(normalizedPlanContent(before), normalizedPlanContent(after));
    assert.equal(after.content.includes("\n") && !after.content.replaceAll("\r\n", "").includes("\n"), true);
    assert.equal(statSync(join(f.root, path)).mode & 0o777, 0o640);
    assert.equal(f.update(request).status, "unchanged");
    assert.equal(inspectImplementationBatch(after, "B1").items[0]?.completed, true);
    assert.throws(() => f.update({ ...request, updates: [{ id: "B1.C", completed: true }] }), /Plan changed/u);
    assert.throws(() => f.update({ ...request, expected_digest: after.digest, updates: [{ id: "B1.C", completed: true }] }), /prerequisite/u);
    writeFileSync(join(f.root, path), after.content + "New requirement.\r\n");
    assert.throws(() => f.update({ ...request, expected_digest: after.digest, updates: [{ id: "B1.I", completed: false, reason: "rework" }] }), /Plan changed/u);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});
test("completed verification uses original native receipt, tolerates bookkeeping and rejects source drift", async () => {
  const f = fixture();
  try {
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] });
    const before = f.current(), captured = f.capture(), validation = buildPlan(captured.packs, { stage: "batch", mode: "impacted", changedPaths: captured.scope.records.map(record => record.path) });
    const result = await runChecks(captured.packs, validation, { subject: captured.subject, scope: captured.scope, assets: new PackagedCheckerAssets(join(resources, "defaults")), packIds: new Set(Object.keys(captured.packs)), stage: "batch", asOf: new Date().toISOString() }, { root: join(f.directory, "runs"), trigger: "test" });
    assert.equal(result.status, "passed");
    const request: PlanProgressRequest = { version: 1, expected_digest: before.digest, batch: "B1", updates: [{ id: "B1.V", completed: true, run_id: result.run_id }] };
    assert.equal(f.update(request).status, "updated"); assert.equal(f.update(request).status, "unchanged");
    assert.equal(f.current().slots.get("B1.V")?.completed, true);
    f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.V", completed: false, reason: "New candidate" }] });
    writeFileSync(join(f.root, "code.txt"), "later source\n");
    assert.throws(() => f.update({ ...request, expected_digest: f.current().digest }), /stale/u);
    assert.equal(f.current().slots.get("B1.V")?.completed, false);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});
test("a lock, alias, duplicate slot, summary receipt and all-mode proof cannot complete verification", async () => {
  const f = fixture();
  try {
    const plan = f.current();
    assert.throws(() => parseImplementationPlan(path, plan.content + plan.content.slice(plan.content.indexOf("<!-- governance:item B1.I"))), /Duplicate|duplicated|ambiguous/u);
    mkdirSync(join(f.root, path + ".progress.lock"));
    assert.throws(() => f.update({ version: 1, expected_digest: plan.digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] }), /EEXIST/u);
    rmSync(join(f.root, path + ".progress.lock"), { recursive: true });
    f.update({ version: 1, expected_digest: plan.digest, batch: "B1", updates: [{ id: "B1.I", completed: true }] });
    assert.throws(() => f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.V", completed: true, run_id: "summary" }] }), /native check identity/u);
    const captured = f.capture(), scope = resolveChangeScope(f.root, { all: true }), subject = new ValidationSubject(f.root, scope);
    const result = await runChecks(captured.packs, buildPlan(captured.packs, { stage: "batch", mode: "all", changedPaths: [] }), { subject, scope, assets: new PackagedCheckerAssets(join(resources, "defaults")), packIds: new Set(Object.keys(captured.packs)), stage: "batch", asOf: new Date().toISOString() }, { root: join(f.directory, "runs"), trigger: "test" });
    assert.throws(() => f.update({ version: 1, expected_digest: f.current().digest, batch: "B1", updates: [{ id: "B1.V", completed: true, run_id: result.run_id }] }), /stale|unqualified/u);
    const saved = f.current().content; rmSync(join(f.root, path)); symlinkSync(join(f.directory, "foreign.md"), join(f.root, path)); writeFileSync(join(f.directory, "foreign.md"), saved);
    assert.throws(() => f.update({ version: 1, expected_digest: planBytesDigest(saved), batch: "B1", updates: [{ id: "B1.I", completed: true }] }), /ordinary/u);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});
