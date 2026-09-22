import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, readFileSync, writeFileSync, renameSync, symlinkSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { runChecks } from "../src/check-run.ts";
import { checkOutput } from "../src/check-output.ts";
import { mergePacks } from "../src/pack-configuration.ts";
import { buildPlan } from "../src/planning.ts";
import { ValidationSubject, resolveChangeScope } from "../src/change-subject.ts";
import { PackagedCheckerAssets } from "../src/checker-assets.ts";
import { durableJson, fileDigest } from "../src/core.ts";
import { decisionOutcomeReport } from "../src/decision-outcomes.ts";

test("native check output selects before delivery, preserves failure and cleanup, joins outcomes and refuses changed evidence", async () => {
  const temp = realpathSync(mkdtempSync(join(tmpdir(), "check-output-"))), root = join(temp, "repo"), runs = join(temp, "runs");
  const previous = process.env.XDG_STATE_HOME; process.env.XDG_STATE_HOME = join(temp, "state");
  mkdirSync(root); mkdirSync(join(root, "config/governance"), { recursive: true });
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "fixture"], { cwd: root });
    const profilePath = join(root, "config/governance/profile.yaml");
    const configure = (mode: string) => durableJson(profilePath, { continuity: { decisions: { mode, allowed_data_classes: ["diagnostic"], consumers: { DL13: { mode } } } } });
    configure("auto");
    const packs = mergePacks([{ source: "fixture", origin: "target", value: { id: "fixture", enforcement: "blocking", stages: ["pre-commit"], commands: [{ run: [process.execPath, "-e", "console.log('start\\n\\nRoutine progress detail\\n\\nERROR original failure\\n\\n  at source.ts:1\\n\\ncleanup unknown\\n\\nend');process.exitCode=1"] }] } }]);
    const plan = buildPlan(packs, { stage: "pre-commit", mode: "all", changedPaths: [] }), scope = resolveChangeScope(root, { all: true });
    const result = await runChecks(packs, plan, { scope, subject: new ValidationSubject(root, scope), assets: new PackagedCheckerAssets(resolve("src/project_governance_runtime/defaults")), packIds: new Set(["fixture"]), stage: "pre-commit", asOf: new Date().toISOString() }, { root: runs, deadlineMs: 3000 });
    const directory = result.run_directory, resultPath = join(directory, "result.json"), original = readFileSync(resultPath, "utf8");
    const context = { version: 1, workspace: root, taskId: "bug", revision: "1", requirement: "Diagnose the error", acceptance: ["Retain all failure evidence"], sourcePaths: [] };
    const dispatch = (revision: string, bound = true) => durableJson(join(directory, "dispatch.json"), { id: result.run_id, root, plan, ...(bound ? { decisionContext: { ...context, revision } } : {}) });
    dispatch("1");
    let calls = 0;
    const transport: typeof fetch = async (_url, init) => { calls++; const body = JSON.parse(String(init?.body));
      return Response.json({ model: "jev-1.13.0", answers: Object.fromEntries(Object.keys(body.questions).map(name => [name, { type: "noul", noul: 0.01 }])) }); };
    const selected = await checkOutput(result.run_id, root, { root: runs, token: "fixture", fetch: transport });
    assert.ok("outputs" in selected);
    assert.equal(calls, 1); assert.equal(selected.status, "failed");
    const output = selected.outputs[0]!;
    assert.equal(output.decision?.providerCalled, true); assert.equal(output.delivered, true);
    assert.doesNotMatch(output.selection!.text, /Routine progress/);
    assert.match(output.selection!.text, /ERROR original failure/); assert.match(output.selection!.text, /at source.ts:1/); assert.match(output.selection!.text, /cleanup unknown/);
    assert.equal(readFileSync(resultPath, "utf8"), original);
    await checkOutput(result.run_id, root, { root: runs, token: "fixture", fetch: transport }); assert.equal(calls, 1);
    assert.equal(selected.episode.status, "recorded");
    if (selected.episode.status === "recorded") {
      const caller = JSON.parse(readFileSync(selected.episode.episode.path, "utf8")), manifest = join(temp, "manifest.json");
      durableJson(manifest, { version: 2, episodes: [{ id: caller.id, scope: caller.scope, decisions: caller.decisions, caller: selected.episode.episode,
        native: [{ kind: "check", path: join(directory, "metrics.json"), digest: fileDigest(join(directory, "metrics.json")) }] }] });
      const joined = decisionOutcomeReport(dirname(dirname(selected.episode.episode.path)), manifest);
      assert.equal(joined.counts.joined, 1); assert.equal(joined.counts.invalid, 0); assert.equal(joined.avoided_llm_tokens, null);
    }
    for (const [mode, token, revision] of [["off", "fixture", "2"], ["shadow", "fixture", "3"], ["auto", "", "4"]]) {
      configure(mode!); dispatch(revision!);
      const fallback = await checkOutput(result.run_id, root, { root: runs, token, fetch: transport });
      assert.ok("outputs" in fallback); assert.equal(fallback.outputs[0]!.delivered, false);
      assert.match(fallback.outputs[0]!.selection!.text, /Routine progress/);
      if (mode === "shadow") assert.equal(fallback.outputs[0]!.decision?.providerCalled, true);
    }
    assert.equal(calls, 2);
    configure("auto"); dispatch("5", false);
    const unbound = await checkOutput(result.run_id, root, { root: runs, token: "fixture", fetch: transport });
    assert.ok("outputs" in unbound); assert.equal(unbound.outputs[0]!.reason, "scope-unavailable"); assert.equal(calls, 2);
    dispatch("6");
    const log = output.source.path, retainedLog = `${log}.retained`; renameSync(log, retainedLog); symlinkSync(retainedLog, log);
    await assert.rejects(checkOutput(result.run_id, root, { root: runs, token: "fixture", fetch: transport }));
    rmSync(log); renameSync(retainedLog, log);
    durableJson(resultPath, { ...result, results: [{ ...result.results[0], commands: [{ ...result.results[0]!.commands[0], request_digest: "sha256:" + "0".repeat(64) }] }] });
    await assert.rejects(checkOutput(result.run_id, root, { root: runs, token: "fixture", fetch: transport }), /binding/);
    writeFileSync(resultPath, original);
    await assert.rejects(checkOutput(result.run_id, root, { root: runs, token: "fixture", fetch: async (...args) => { const answer = await transport(...args); writeFileSync(log, "changed"); return answer; } }), /changed/);
  } finally { if (previous === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previous; rmSync(temp, { recursive: true, force: true }); }
});
