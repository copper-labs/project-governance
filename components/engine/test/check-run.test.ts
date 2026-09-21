import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { readRunProjection } from "../src/telemetry-projection.ts";
import { runChecks } from "../src/check-run.ts";
import { mergePacks } from "../src/pack-configuration.ts";
import { buildPlan } from "../src/planning.ts";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
import { PackagedCheckerAssets } from "../src/checker-assets.ts";
import { inspectEvidenceManifest } from "../src/evidence-manifest.ts";
const defaults = fileURLToPath(new URL("../../../src/project_governance_runtime/defaults/", import.meta.url));

test("custom pack receives captured packet bytes and durable terminal evidence", async () => {
  const root = mkdtempSync(join(tmpdir(), "check-run-")), runs = mkdtempSync(join(tmpdir(), "check-run-records-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  try {
    git("init", "-q"); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "Initial");
    writeFileSync(join(root, "example.txt"), "staged\n"); git("add", ".");
    const scope = resolveChangeScope(root, { staged: true }); writeFileSync(join(root, "example.txt"), "later\n");
    const code = "const fs=require('fs');const p=JSON.parse(fs.readFileSync(process.env.PROJECT_GOVERNANCE_CHANGE_PACKET));if(fs.readFileSync(p.records[0].after_path,'utf8')!=='staged\\n')process.exit(7);console.error('diagnostic');console.log(JSON.stringify({status:'passed',findings:[]}));";
    const draft = "require('fs').writeFileSync(require('path').join(process.env.PROJECT_GOVERNANCE_EVIDENCE_ROOT,'evidence-manifest.json'),'unfinished');";
    const finish = "const fs=require('fs');fs.writeFileSync(require('path').join(process.env.PROJECT_GOVERNANCE_EVIDENCE_ROOT,'evidence-manifest.json'),JSON.stringify({kind:'project-governance-evidence-manifest',version:1,subject_digest:process.env.PROJECT_GOVERNANCE_SUBJECT_DIGEST,claims:[]}));console.log(JSON.stringify({status:'passed',findings:[]}));";
    const packs = mergePacks([{ source: "fixture", origin: "target", value: { id: "fixture", enforcement: "blocking", stages: ["pre-commit"], commands: [{ run: [process.execPath, "-e", draft + code] }, { run: [process.execPath, "-e", finish] }] } }]);
    const plan = buildPlan(packs, { stage: "pre-commit", mode: "all", changedPaths: [] });
    const result = await runChecks(packs, plan, { scope, subject: new ValidationSubject(root, scope), assets: new PackagedCheckerAssets(defaults), packIds: new Set(["fixture"]), stage: "pre-commit", asOf: "2026-09-20T12:00:00Z" }, { root: runs, deadlineMs: 3000, trigger: "hook" });
    assert.equal(result.status, "passed");
    const projection = readRunProjection(runs, root);
    assert.equal(projection.state, "available");
    assert.equal(projection.metrics[0]?.trigger, "hook");
    assert.equal(projection.metrics[0]?.run_id, result.run_id);
    assert.equal(result.results[0]?.commands.length, 2);
    assert.equal(result.results[0]?.evidence_manifest?.status, "valid");
    assert.equal(JSON.parse(readFileSync(join(result.run_directory, "result.json"), "utf8")).run_id, result.run_id);
    assert.equal(result.results[0]?.commands[0]?.["stderr"], "diagnostic\n");
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(runs, { recursive: true, force: true }); }
});
test("manifest summaries reject duplicate keys and source identity mismatches", () => {
  const root = mkdtempSync(join(tmpdir(), "evidence-manifest-"));
  try {
    const schema = new PackagedCheckerAssets(defaults).schema("evidence-manifest"), subject = "sha256:" + "a".repeat(64);
    const value = { kind: "project-governance-evidence-manifest", version: 1, subject_digest: subject, claims: [{ id: "example", outcome: "passed", artifact_digests: [] }] };
    writeFileSync(join(root, "evidence-manifest.json"), JSON.stringify(value));
    assert.equal(inspectEvidenceManifest(root, subject, schema).status, "valid");
    assert.equal(inspectEvidenceManifest(root, null, schema).status, "invalid");
    writeFileSync(join(root, "evidence-manifest.json"), JSON.stringify(value).replace('"version":1', '"version":1,"version":1'));
    assert.equal(inspectEvidenceManifest(root, subject, schema).status, "invalid");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
