import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { contextRouteCommand } from "../src/context-route-command.ts";

test("context-route workflow advice uses captured recipes/catalog and never executes them", async t => {
  const root = mkdtempSync(join(tmpdir(), "workflow-advice-"));
  const previousState = process.env.XDG_STATE_HOME, previousToken = process.env.JEV_TOKEN, previousFetch = globalThis.fetch;
  t.after(() => {
    if (previousState === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previousState;
    if (previousToken === undefined) delete process.env.JEV_TOKEN; else process.env.JEV_TOKEN = previousToken;
    globalThis.fetch = previousFetch; rmSync(root, { recursive: true, force: true });
  });
  process.env.XDG_STATE_HOME = join(root, "state"); process.env.JEV_TOKEN = "test-only";
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init"); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "fixture");
  mkdirSync(join(root, "config/governance"), { recursive: true });
  mkdirSync(join(root, "foreign"));
  const write = (path: string, value: unknown) => writeFileSync(join(root, path), JSON.stringify(value));
  write("config/governance/profile.yaml", { profile_id: "fixture", continuity: { decisions: {
    mode: "auto", allowed_data_classes: ["source"], allowed_source_paths: ["config/**"], consumers: { DL04: { mode: "auto" } },
  } }, context_router: { routes: [{ id: "fix", match: { prompt_terms: ["fix"] }, primary_context: ["rules.md"] }] } });
  write("config/governance/facts.lock.yaml", { profile_id: "fixture", facts: {} });
  writeFileSync(join(root, "rules.md"), "Mandatory rules remain");
  write("config/governance/operations.json", { version: 1, operations: { inspect: {
    argv: [process.execPath, "-e", "require('node:fs').writeFileSync('ran','unexpected')"], cwd: root, effect: "local",
  } } });
  const recipe = { version: 1, id: "inspect-recipe", workspace: root, inputs: [], resources: [],
    stages: [{ id: "inspect", operation: "inspect", deadlineMs: 1000 }], deadlineMs: 2000, policyRevision: "1", claims: ["inspection"] };
  write("config/governance/inspect.json", recipe);
  write("config/governance/candidates.json", { version: 1, candidates: [
    { id: "inspect", description: "Inspect the bug", recipe: "config/governance/inspect.json" },
    { id: "foreign", description: "Another project", recipe: { ...recipe, workspace: join(root, "foreign") } },
  ] });
  git("add", "config", "rules.md");
  // A staged request must not resolve the live replacement catalog.
  write("config/governance/operations.json", { version: 1, operations: {} });
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const payload = JSON.parse(String(init?.body));
    assert.deepEqual(Object.keys(payload.questions.match.criteria).sort(), ["inspect", "unknown"]);
    assert.equal(payload.questions.match.criteria.inspect.trust, "untrusted");
    assert.ok(payload.questions.match.instructions.evidence.every((item: { trust: string }) => item.trust === "untrusted"));
    return Response.json({ model: "jev-1.13.0", answers: { match: {
      type: "choice", choice: "inspect", confidence: 0.8, probabilities: { inspect: 0.9, unknown: 0.1 },
    } } });
  };
  const result = await contextRouteCommand(["--task", "fix", "--revision", "1", "--decision-task", "fixture", "--staged",
    "--workflow-candidates", "config/governance/candidates.json"], root, resolve("src/project_governance_runtime/assets/skills"));
  assert.equal(result.ready, true);
  assert.equal(result.workflowAdvice?.recommended?.recipeId, "inspect-recipe");
  assert.deepEqual(result.workflowAdvice?.rejected, [{ id: "foreign", reason: "workspace-out-of-scope" }]);
  assert.equal(result.entries[0]?.content, "Mandatory rules remain");
  assert.equal(calls, 1);
  assert.equal(existsSync(join(root, "ran")), false);
});
