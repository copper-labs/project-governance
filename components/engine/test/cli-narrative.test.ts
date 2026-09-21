import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { prepareCommand } from "../src/cli.ts";
import { executeChecks } from "../src/check-execution.ts";
import { PackagedCheckerAssets } from "../src/checker-assets.ts";
const assetsRoot = fileURLToPath(new URL("../../../src/project_governance_runtime/", import.meta.url));

test("commit hook checks its explicit message without HEAD or upstream and keeps argument bindings", async () => {
  const root = mkdtempSync(join(tmpdir(), "cli-narrative-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    writeFileSync(join(root, "message"), "Preserve task evidence on restart\n\nPersist the accepted source identity before launching the worker.\n");
    const summaryPlan = prepareCommand(["--stage", "commit-msg", "--summary"], root, join(assetsRoot, "packs"), "plan");
    assert.equal(summaryPlan.summary, true);
    const fileCheck = prepareCommand(["--stage", "commit-msg", "--commit-message-file", "message", "--json-output", "result.json", "--summary"], root, join(assetsRoot, "packs"), "check");
    assert.equal(fileCheck.jsonOutput, "result.json");
    assert.throws(() => prepareCommand(["--stage", "commit-msg", "--json-output", "result.json", "--detach"], root, join(assetsRoot, "packs"), "check"));
    const check = async () => {
      const prepared = prepareCommand(["--stage", "commit-msg", "--commit-message-file", "message"], root, join(assetsRoot, "packs"), "check");
      return executeChecks(prepared.registry, prepared.plan, { subject: prepared.subject, scope: prepared.scope, assets: new PackagedCheckerAssets(join(assetsRoot, "defaults")),
        packIds: new Set(Object.keys(prepared.registry)), stage: "commit-msg", asOf: "2026-09-20T12:00:00Z", ...prepared.narrative });
    };
    assert.equal((await check()).status, "passed");
    writeFileSync(join(root, "message"), "update\n");
    const failed = await check(); assert.equal(failed.status, "failed");
    assert.equal(failed.results[0]?.commands[0]?.findings[0]?.rule_id, "commit-message.short-subject");
    assert.throws(() => prepareCommand(["--stage", "commit-msg", "--commit-message-file", "message"], root, join(assetsRoot, "packs"), "plan"));
    assert.throws(() => prepareCommand(["--mode", "all", "--stage", "pre-pr", "--pr-title", "Some title"], root, join(assetsRoot, "packs"), "check"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
