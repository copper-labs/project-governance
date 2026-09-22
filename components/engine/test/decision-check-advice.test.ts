import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { prepareCommand } from "../src/cli.ts";
import { checkDecisionAdvice } from "../src/decision-check-advice.ts";
import { contextStateRoot } from "../src/context-command.ts";
import { checkRunRoot } from "../src/check-run.ts";
import { decisionOutcomeReport } from "../src/decision-outcomes.ts";
import { durableJson, fileDigest } from "../src/core.ts";
import { mergePacks } from "../src/pack-configuration.ts";
import { buildPlan } from "../src/planning.ts";
import type { DecisionRuntimeOptions } from "../src/decision-runtime.ts";

test("all-mode exposure joins outcomes and unreadable native telemetry preserves computed advice", async () => {
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), "check-advice-"))), root = join(temporary, "repo");
  mkdirSync(root); const previous = process.env.XDG_STATE_HOME; process.env.XDG_STATE_HOME = join(temporary, "state");
  try {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
    git("init", "-q"); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "fixture");
    mkdirSync(join(root, "config/governance"), { recursive: true }); mkdirSync(join(root, "src"));
    const profile = join(root, "config/governance/profile.yaml");
    writeFileSync(profile, JSON.stringify({ continuity: { decisions: { mode: "off" } } }));
    writeFileSync(join(root, "src/feature.ts"), "export const feature = true;\n"); git("add", ".");
    const assets = resolve("src/project_governance_runtime/packs"), state = contextStateRoot(root);
    const all = prepareCommand(["--stage", "pre-commit", "--mode", "all"], root, assets);
    assert.equal(all.scope.subject_digest, null);
    assert.equal(await checkDecisionAdvice(all, {}, false), null);
    const path = join(state, "episodes", readdirSync(join(state, "episodes"))[0]!);
    const caller = JSON.parse(readFileSync(path, "utf8")), manifest = join(temporary, "outcomes.json");
    durableJson(manifest, { version: 2, episodes: [{ id: caller.id, scope: null, decisions: [], caller: { path, digest: fileDigest(path) } }] });
    const outcome = decisionOutcomeReport(state, manifest);
    assert.equal(outcome.counts.invalid, 0); assert.equal(outcome.counts.joined, 1);

    writeFileSync(profile, JSON.stringify({ continuity: { decisions: { mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["**"],
      consumers: { DL07: { mode: "auto", questions: ["validation.scenario-relevance/2", "validation.coverage-gap/2"] } } } } }));
    git("add", "config/governance/profile.yaml");
    const changed = prepareCommand(["--stage", "pre-commit", "--mode", "impacted"], root, assets);
    const registry = mergePacks([{ source: "config/validation/packs/static.yaml", origin: "target", value: {
      id: "static", enforcement: "blocking", stages: ["pre-commit"], path_globs: ["src/**"], commands: ["fixture"] } },
    { source: "config/validation/packs/device.yaml", origin: "target", value: {
      id: "device", enforcement: "blocking", stages: ["pre-commit"], path_globs: ["device/**"], commands: ["fixture"], description: "Device launch" } }]);
    const plan = buildPlan(registry, { stage: "pre-commit", mode: "impacted", changedPaths: ["src/feature.ts"] });
    const runId = "11111111-1111-4111-8111-111111111111", directory = join(checkRunRoot(), runId);
    mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, "result.json"), "broken native receipt");
    let calls = 0;
    const transport: DecisionRuntimeOptions = {
      token: "fixture", fetch: async (_url, init) => {
        calls++; const payload = JSON.parse(String(init?.body));
        return Response.json({ model: "jev-1.13.0", answers: Object.fromEntries(Object.keys(payload.questions).map(id => [id, { type: "noul", noul: 0.95 }])) });
      },
    };
    const advice = await checkDecisionAdvice({ ...changed, registry, plan }, { taskId: "task", revision: "1", runId }, false, { ...transport, signal: new AbortController().signal });
    assert.equal(calls, 1, JSON.stringify(advice)); assert.equal(advice?.validation?.delivered, true);
    assert.ok(advice && "comparison" in advice && advice.comparison?.status === "unavailable");
    assert.ok(advice && "episode" in advice && advice.episode.status === "recorded");
  } finally {
    if (previous === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previous;
    rmSync(temporary, { recursive: true, force: true });
  }
});
