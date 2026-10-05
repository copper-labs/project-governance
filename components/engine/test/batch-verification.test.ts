import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "../../harness/src/store/store.ts";
import { proposeAction, authorizeAction } from "../../harness/src/ops/actions.ts";
import { defaultPolicy } from "../../harness/src/ops/authority.ts";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
import { loadSubjectPacks } from "../src/pack-configuration.ts";
import { buildPlan } from "../src/planning.ts";
import { runChecks } from "../src/check-run.ts";
import { checkSummary } from "../src/check-summary.ts";
import { planCommand } from "../src/cli.ts";
import { PackagedCheckerAssets } from "../src/checker-assets.ts";
import { digest, fileDigest } from "../src/core.ts";
import { processLiveFingerprint } from "../src/process-owner.ts";
import { WorkflowStore } from "../src/workflow-store.ts";
import { ResourceRegistry } from "../src/resources.ts";
import { parseRecipe, recipeDigest } from "../src/workflow-types.ts";
import { executeWorkflow } from "../src/workflow-executor.ts";

const checker = fileURLToPath(new URL("fixtures/batch-check.mjs", import.meta.url));
const defaults = fileURLToPath(new URL("../../../src/project_governance_runtime/defaults/", import.meta.url));
const builtinPacks = fileURLToPath(new URL("../../../src/project_governance_runtime/packs/", import.meta.url));
const goodLifecycle = "export function releaseOwner(owners, owner, workspace) { return owners.filter(row => row.owner !== owner); }\n";
const badLifecycle = "export function releaseOwner(owners, owner, workspace) { return owners.filter(row => row.workspace !== workspace); }\n";

function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "batch-verification-"))), root = join(directory, "repo"), runs = join(directory, "runs");
  mkdirSync(root); mkdirSync(join(root, "src")); mkdirSync(join(root, "config/validation/packs"), { recursive: true });
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  const write = (path: string, source: string) => writeFileSync(join(root, path), source);
  const stage = (path: string, source: string) => { write(path, source); git("add", "--", path); };
  for (const [id, paths, mode] of [["fixture-owner", ["src/*.owner.json"], "rule"], ["fixture-lifecycle", ["src/owner-lifecycle.mjs"], "lifecycle"],
    ["fixture-unrelated", ["docs/**"], "unknown"]] as const) {
    write(`config/validation/packs/${id}.yaml`, JSON.stringify({ id, enforcement: "blocking", stages: ["batch"], path_globs: paths,
      change_packet_contract: 1, commands: [{ run: [process.execPath, checker, mode] }] }));
  }
  write("src/session.owner.json", '{"owner":"initial"}\n');
  write("src/legacy.owner.json", '{"owner":null}\n');
  write("src/owner-lifecycle.mjs", goodLifecycle);
  git("init", "-q"); git("add", "."); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Synthetic baseline");
  const capture = (stageName = "batch") => {
    const scope = resolveChangeScope(root, { staged: true }), subject = new ValidationSubject(root, scope);
    const packs = loadSubjectPacks(subject, builtinPacks);
    const plan = buildPlan(packs, { stage: stageName, mode: "impacted", changedPaths: scope.records.map(record => record.path) });
    return { scope, subject, packs, plan };
  };
  const run = async (captured = capture()) => runChecks(captured.packs, captured.plan, { scope: captured.scope, subject: captured.subject,
    assets: new PackagedCheckerAssets(defaults), packIds: new Set(Object.keys(captured.packs)), stage: captured.plan.stage!, asOf: "2026-10-04T12:00:00Z" },
    { root: runs, deadlineMs: 15000, trigger: "test" });
  return { directory, root, runs, git, write, stage, capture, run };
}

// Terminal receipts can precede final supervisor writes. Never remove a live owner's evidence.
async function closeFixture(directory: string, verified: boolean) {
  const identities: Array<{ pid: number; fingerprint: string }> = [];
  function scan(path: string) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory() && entry.name !== ".git") scan(full);
      else if (["owner.json", "guardian.json"].includes(entry.name)) identities.push(JSON.parse(readFileSync(full, "utf8")));
    }
  }
  scan(directory);
  const deadline = Date.now() + 5000;
  while (identities.some(owner => processLiveFingerprint(owner.pid) === owner.fingerprint) && Date.now() < deadline)
    await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(identities.every(owner => processLiveFingerprint(owner.pid) !== owner.fingerprint), `Fixture writers remain live: ${directory}`);
  if (verified && process.env["GOVERNANCE_BATCH_PROOF_KEEP"] !== "1") rmSync(directory, { recursive: true, force: true });
  else console.error(`Preserved batch proof evidence: ${directory}`);
}

test("batch target rule selects changed ownership only and detects valid, violating and corrected captured bytes", async () => {
  const f = fixture(); let verified = false;
  try {
    for (const [owner, expected] of [["valid", "passed"], ["", "failed"], ["corrected", "passed"]] as const) {
      f.stage("src/session.owner.json", JSON.stringify({ owner }) + "\n");
      const captured = f.capture();
      assert.equal(captured.scope.mode, "staged"); assert.match(captured.scope.subject_digest!, /^sha256:[a-f0-9]{64}$/);
      assert.deepEqual(captured.plan.selected_packs, ["fixture-owner"]);
      assert.deepEqual(Object.entries(captured.plan.path_matches), [["src/session.owner.json", ["fixture-owner"]]]);
      assert.ok(captured.plan.omitted_packs["fixture-unrelated"]);
      const ordinaryPlan = planCommand(["--stage", "batch", "--mode", "impacted", "--base-ref", "HEAD"], f.root, builtinPacks);
      assert.equal(ordinaryPlan.status, "ready");
      assert.deepEqual(ordinaryPlan.execution_order, captured.plan.execution_order);
      // Opposite checkout bytes cannot repair or break the captured staged candidate.
      f.write("src/session.owner.json", JSON.stringify({ owner: owner ? "" : "unstaged-repair" }) + "\n");
      const result = await f.run(captured);
      assert.equal(result.status, expected);
      const command = result.results[0]!.commands[0]!, output = JSON.parse(String(command.stdout));
      assert.deepEqual(output.evidence, { subject_digest: captured.scope.subject_digest, evaluated_paths: ["src/session.owner.json"] });
      assert.equal((command.command_receipt as { cleanup: string }).cleanup, "confirmed");
      if (expected === "failed") {
        assert.equal(command.findings[0]?.rule_id, "fixture.owner-required");
        const summary = checkSummary(result);
        assert.equal((summary.findings as Array<{ rule_id: string }>)[0]?.rule_id, "fixture.owner-required");
        assert.equal("stdout" in summary, false);
        const original = JSON.parse(readFileSync((summary.evidence as { path: string }).path, "utf8"));
        assert.equal(digest(original), (summary.evidence as { digest: string }).digest);
        assert.equal(original.results[0].commands[0].stdout, command.stdout);
      }
    }
    assert.equal(JSON.parse(readFileSync(join(f.root, "src/legacy.owner.json"), "utf8")).owner, null, "Unchanged baseline debt is outside the packet");
    verified = true;
  } finally { await closeFixture(f.directory, verified); }
});

test("executed lifecycle test catches the seeded sibling-release fault and passes the corrected candidate through the same batch entry", async () => {
  const f = fixture(); let verified = false;
  try {
    for (const [source, expected] of [[goodLifecycle + "// valid candidate\n", "passed"], [badLifecycle, "failed"], [goodLifecycle + "// corrected candidate\n", "passed"]] as const) {
      f.stage("src/owner-lifecycle.mjs", source);
      const captured = f.capture(), result = await f.run(captured), command = result.results[0]!.commands[0]!;
      assert.deepEqual(captured.plan.execution_order, ["fixture-lifecycle"]);
      assert.equal(result.status, expected);
      const output = JSON.parse(String(command.stdout)), original = readFileSync(output.evidence.original, "utf8");
      assert.equal(output.evidence.subject_digest, captured.scope.subject_digest);
      assert.equal(output.evidence.test_exit_code, expected === "failed" ? 1 : 0);
      assert.match(original, expected === "failed" ? /not ok 1 - release keeps another owner in the same worktree/ : /ok 1 - release keeps another owner in the same worktree/);
      if (expected === "failed") {
        assert.equal(command.findings[0]?.rule_id, "fixture.lifecycle-owner-isolation");
        assert.match(original, /ERR_ASSERTION/);
      }
      const packet = JSON.parse(readFileSync(join(result.run_directory, "packet/change-packet.json"), "utf8"));
      assert.equal(readFileSync(packet.records[0].after_path, "utf8"), source);
      assert.equal(fileDigest(packet.records[0].after_path), `sha256:${packet.records[0].after_sha256}`);
    }
    verified = true;
  } finally { await closeFixture(f.directory, verified); }
});

test("unconfigured batch stage and native infrastructure failure cannot establish passing proof", async () => {
  const f = fixture(); let verified = false;
  try {
    f.stage("src/session.owner.json", '{"owner":"changed"}\n');
    const undeclared = f.capture("unconfigured-batch"), refused = await f.run(undeclared);
    assert.equal(undeclared.plan.status, "blocked");
    assert.equal(undeclared.plan.blockers[0]?.code, "unknown-stage");
    assert.equal(refused.status, "failed"); assert.deepEqual(refused.results, []);
    const broken = f.capture();
    broken.packs["fixture-owner"]!.enforcement = "advisory";
    broken.packs["fixture-owner"]!.commands = [{ run: [process.execPath, checker, "infrastructure"] }];
    const result = await f.run(broken), command = result.results[0]!.commands[0]!;
    assert.equal(result.status, "failed");
    assert.equal(JSON.parse(String(command.stdout)).status, "passed", "Fixture process lies about success");
    assert.equal(command.process_failure, true); assert.equal(command.exit_code, 7);
    assert.equal(command.findings[0]?.rule_id, "checker.command-failed");
    assert.equal((checkSummary(result).command_issues as unknown[]).length, 1);
    const unavailable = f.capture();
    unavailable.packs["fixture-owner"]!.commands = [{ run: [join(f.root, "missing-checker")] }];
    const missing = await f.run(unavailable);
    assert.equal(missing.status, "failed");
    assert.equal(missing.results[0]!.commands[0]!.findings[0]?.rule_id, "checker.invocation-invalid");
    verified = true;
  } finally { await closeFixture(f.directory, verified); }
});

test("declared workflow executes the batch before review, blocks review on a fault and carries corrected source evidence forward", async () => {
  const f = fixture(), database = join(f.directory, "ledger.sqlite"); let verified = false;
  const continuity = new Store(database), store = new WorkflowStore(database), registry = new ResourceRegistry(join(f.directory, "resources.sqlite"));
  try {
    for (const [source, expected] of [[badLifecycle, "failed"], [goodLifecycle + "// correction\n", "succeeded"]] as const) {
      f.stage("src/owner-lifecycle.mjs", source);
      const policy = defaultPolicy(), task = continuity.createTask("Release only the ending fixture owner", [{ kind: "scope", provenance: "operator", body: f.root }]);
      const request = { operation: "check" as const, scope: [f.root], targets: [], destination: null, policyRevision: policy.revision };
      const action = authorizeAction(continuity, proposeAction(continuity, task.taskId, request), request, policy, f.root);
      const module = (name: string) => new URL(`../src/${name}.ts`, import.meta.url).href;
      const code = `
        import {writeFileSync} from 'node:fs'; import {join} from 'node:path';
        import {prepareCommand} from ${JSON.stringify(module("cli"))};
        import {runChecks} from ${JSON.stringify(module("check-run"))};
        import {PackagedCheckerAssets} from ${JSON.stringify(module("checker-assets"))};
        const prepared=prepareCommand(['--stage','batch','--mode','impacted','--base-ref','HEAD'],process.cwd(),${JSON.stringify(builtinPacks)},'check');
        const result=await runChecks(prepared.registry,prepared.plan,{scope:prepared.scope,subject:prepared.subject,assets:new PackagedCheckerAssets(${JSON.stringify(defaults)}),
          packIds:new Set(Object.keys(prepared.registry)),stage:'batch',asOf:'2026-10-04T12:00:00Z'},
          {root:${JSON.stringify(f.runs)},deadlineMs:15000,trigger:'test'});
        writeFileSync(join(process.env.PROJECT_GOVERNANCE_WORKFLOW_ARTIFACT_DIR,'batch-result.json'),JSON.stringify(result));
        process.exitCode=result.status==='failed'?1:0;
      `;
      const recipe = parseRecipe({ version: 1, id: "batch-before-review", workspace: f.root, resources: [],
        inputs: [{ path: "src/owner-lifecycle.mjs", digest: fileDigest(join(f.root, "src/owner-lifecycle.mjs")) }],
        operations: { batch: { argv: [process.execPath, "--input-type=module", "-e", code], cwd: f.root, effect: "local" },
          review: { argv: [process.execPath, checker, "review"], cwd: f.root, effect: "read" } },
        stages: [{ id: "batch", operation: "batch", deadlineMs: 20000 }, { id: "review", operation: "review", dependsOn: ["batch"], deadlineMs: 5000 }],
        deadlineMs: 30000, policyRevision: policy.revision, claims: ["Early batch precedes fixture review preparation"] });
      const binding = { taskId: task.taskId, taskVersion: task.version, actionId: action.actionId, authorityRef: "host:fixture",
        recipe, recipeDigest: recipeDigest(recipe), operationId: `batch-review-${expected}` };
      store.authorizeWorkflow(binding);
      const run = store.submit(binding), commands = join(f.directory, "workflow-commands");
      const result = await executeWorkflow(store, run.id, { commandsDirectory: commands, registry, observeCleanup: async () => null });
      assert.equal(result.state, expected);
      const stages = store.stages(run.id), reviewPath = join(commands, `${run.id}-1-artifacts`, "review-input.json");
      if (expected === "failed") {
        assert.deepEqual(stages.map(stage => stage.state), ["failed", "blocked"]);
        assert.equal(existsSync(join(commands, `${run.id}-1`)), false, "Review command was never dispatched");
        const early = JSON.parse(readFileSync(join(commands, `${run.id}-0-artifacts`, "batch-result.json"), "utf8"));
        assert.equal(early.results[0].commands[0].findings[0].rule_id, "fixture.lifecycle-owner-isolation");
      } else {
        assert.deepEqual(stages.map(stage => stage.state), ["succeeded", "succeeded"]);
        const receipt = JSON.parse(readFileSync(reviewPath, "utf8"));
        assert.equal(receipt.subject_digest, resolveChangeScope(f.root, { baseRef: "HEAD" }).subject_digest);
        assert.equal(receipt.difference[0].path, "src/owner-lifecycle.mjs");
        assert.equal(receipt.difference[0].after_sha256, fileDigest(join(f.root, "src/owner-lifecycle.mjs")).slice(7));
        assert.ok(existsSync(receipt.original_result));
        assert.deepEqual(receipt.unknowns, ["No semantic reviewer was invoked"]);
      }
      assert.ok(stages.filter(stage => stage.result).every(stage => stage.result!.cleanup === "confirmed"));
    }
    verified = true;
  } finally { store.close(); registry.close(); continuity.close(); await closeFixture(f.directory, verified); }
});
