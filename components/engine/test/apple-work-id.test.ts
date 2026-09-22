import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { prepareCommand } from "../src/cli.ts";
import { dispatchChecks } from "../src/check-worker.ts";
import { inspectCheckRun } from "../src/check-status.ts";
import { PackagedCheckerAssets } from "../src/checker-assets.ts";
import { processFingerprint } from "../src/process-owner.ts";

const assets = fileURLToPath(new URL("../../../src/project_governance_runtime/", import.meta.url));
const args = ["--stage", "pre-commit", "--staged", "--pack", "apple-dependencies"];

function fixture(expires = "2026-10-01") {
  const directory = mkdtempSync(join(tmpdir(), "apple-work-id-")), root = join(directory, "repo");
  mkdirSync(root);
  const git = (...values: string[]) => execFileSync("git", values, { cwd: root, stdio: "pipe" });
  git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  mkdirSync(join(root, "config/policies"), { recursive: true });
  writeFileSync(join(root, "config/policies/apple-dependency-exceptions.yaml"), JSON.stringify({ version: 1, owner: "team", exceptions: [{
    work_id: "approved-work", products: ["fixture"], path_globs: ["**/*.sh"], reason: "migration-bridge",
    rationale: "Preserve the approved dependency bridge.", status: "approved", operator: "operator",
    approved_on: "2026-09-19", expires, spm_analysis: "The integration still requires its approved bridge.",
    compatibility_evidence: ["fixture"], compatibility_tests: ["fixture"], migration_or_deletion_gate: "operator-approved",
  }] }));
  writeFileSync(join(root, "install.sh"), "pod install\n");
  git("add", "."); git("commit", "-qm", "Initial fixture");
  writeFileSync(join(root, "install.sh"), "pod install\n# Keep the approved integration current.\n");
  git("add", "install.sh");
  return { directory, root, runs: join(directory, "runs") };
}

test("check preparation captures the explicit work ID without substituting a decision task", () => {
  const { directory, root } = fixture(), previous = process.env["GOVERNANCE_WORK_ID"];
  try {
    process.env["GOVERNANCE_WORK_ID"] = "approved-work";
    const prepared = prepareCommand(args, root, join(assets, "packs"), "check");
    process.env["GOVERNANCE_WORK_ID"] = "later-work";
    assert.equal(prepared.workId, "approved-work");
    delete process.env["GOVERNANCE_WORK_ID"];
    assert.equal(prepareCommand([...args, "--decision-task", "approved-work"], root, join(assets, "packs"), "check").workId, "");
  } finally {
    if (previous === undefined) delete process.env["GOVERNANCE_WORK_ID"]; else process.env["GOVERNANCE_WORK_ID"] = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("detached Apple checks preserve work-bound approval without accepting missing, wrong or expired approval", async t => {
  for (const scenario of [
    { label: "matching", workId: "approved-work", expires: "2026-10-01", status: "passed", message: null },
    { label: "missing", workId: "", expires: "2026-10-01", status: "failed", message: /GOVERNANCE_WORK_ID is required/u },
    { label: "wrong", workId: "other-work", expires: "2026-10-01", status: "failed", message: /different work item/u },
    { label: "expired", workId: "approved-work", expires: "2026-09-19", status: "failed", message: /expired/u },
  ]) await t.test(scenario.label, async () => {
    const { directory, root, runs } = fixture(scenario.expires);
    let completed = false, runDirectory: string | undefined;
    try {
      const prepared = prepareCommand(args, root, join(assets, "packs"), "check");
      const submitted = dispatchChecks(prepared.registry, prepared.plan, {
        subject: prepared.subject, scope: prepared.scope, assets: new PackagedCheckerAssets(join(assets, "defaults")),
        packIds: new Set(Object.keys(prepared.registry)), stage: "pre-commit", asOf: "2026-09-20T12:00:00Z", workId: scenario.workId,
      }, { root: runs, deadlineMs: 5000, trigger: "test" });
      runDirectory = submitted.run_directory;
      let observed = inspectCheckRun(submitted.run_id, runs);
      const deadline = Date.now() + 10000;
      while (observed.state !== "terminal" && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 50)); observed = inspectCheckRun(submitted.run_id, runs);
      }
      completed = observed.state === "terminal";
      assert.equal(observed.state, "terminal", JSON.stringify(observed));
      const result = JSON.parse(readFileSync(join(submitted.run_directory, "result.json"), "utf8"));
      const findings = result.results.find((pack: { pack_id: string }) => pack.pack_id === "apple-dependencies").commands[0].findings;
      assert.equal(result.status, scenario.status, JSON.stringify(findings));
      if (scenario.message) assert.ok(findings.some((finding: { message: string }) => scenario.message!.test(finding.message)), JSON.stringify(findings));
      assert.equal(JSON.parse(readFileSync(join(submitted.run_directory, "dispatch.json"), "utf8")).workId, scenario.workId);
    } finally {
      if (completed && runDirectory) {
        // Terminal results precede the detached reader's telemetry and release writes.
        const owner = JSON.parse(readFileSync(join(runDirectory, "run.json"), "utf8")).owner;
        const deadline = Date.now() + 5000;
        while (processFingerprint(owner.pid) === owner.fingerprint && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
        assert.notEqual(processFingerprint(owner.pid), owner.fingerprint, `Retain evidence while reader is alive: ${directory}`);
        rmSync(directory, { recursive: true, force: true });
      }
      else t.diagnostic(`Unresolved worker evidence retained at ${directory}`);
    }
  });
});
