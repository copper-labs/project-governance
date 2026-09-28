import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { contextRouteCommand } from "../src/context-route-command.ts";
import { contextStateRoot } from "../src/context-command.ts";

test("normal routing applies opted-in passage advice and links its source-free receipts", async t => {
  const root = mkdtempSync(join(tmpdir(), "route-passage-")), previous = process.env.XDG_STATE_HOME;
  const stateRoot = mkdtempSync(join(tmpdir(), "route-passage-state-"));
  const previousToken = process.env.JEV_TOKEN, previousFetch = globalThis.fetch;
  process.env.XDG_STATE_HOME = stateRoot;
  t.after(() => { if (previous === undefined) delete process.env.XDG_STATE_HOME; else process.env.XDG_STATE_HOME = previous;
    if (previousToken === undefined) delete process.env.JEV_TOKEN; else process.env.JEV_TOKEN = previousToken;
    globalThis.fetch = previousFetch;
    rmSync(stateRoot, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true }); });
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init");
  mkdirSync(join(root, "config/governance"), { recursive: true }); mkdirSync(join(root, "src"));
  writeFileSync(join(root, "config/governance/profile.yaml"), JSON.stringify({ profile_id: "fixture",
    context_router: { default_route: "default", routes: [{ id: "default", primary_context: ["rules.md"] }] },
    continuity: { decisions: { mode: "auto", allowed_data_classes: ["metadata", "source"], allowed_metadata_paths: ["src/**"],
      allowed_source_paths: ["src/**"], consumers: { DL03: { mode: "auto",
        questions: ["context.metadata-relevance/1", "context.passage-evidence/1", "context.passage-role/1"] } } } } }));
  writeFileSync(join(root, "config/governance/facts.lock.yaml"), JSON.stringify({ profile_id: "fixture", facts: {} }));
  writeFileSync(join(root, "rules.md"), "Required policy survives optional decisions.\n");
  writeFileSync(join(root, "src/launch.test.ts"), "\uFEFF" + "// setup\n".repeat(400) +
    "test('selected simulator launch', () => { assert.equal(launchStatus, 'running'); });\n" + "// tail\n".repeat(400));
  git("add", "config", "rules.md", "src");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "fixture");
  const groups: string[][] = [];
  process.env.JEV_TOKEN = "fixture";
  globalThis.fetch = async (_url, init) => {
    const wire = JSON.parse(String(init?.body)); groups.push(Object.keys(wire.questions));
    return Response.json({ model: "jev-1.13.0", answers: Object.fromEntries(Object.keys(wire.questions)
      .map(name => [name, { type: "noul", noul: 0.95 }])) });
  };
  const result = await contextRouteCommand(["--task", "Find proof that the selected simulator launches", "--revision", "1",
    "--decision-task", "fixture-task"], root, resolve("src/project_governance_runtime/assets/skills"));
  assert.equal(result.ready, true); assert.equal(groups.length, 2);
  assert.ok(groups[0]?.every(name => name.startsWith("file-")));
  assert.ok(groups[1]?.every(name => name.startsWith("evidence-")));
  assert.equal(result.entries[0]?.content, "Required policy survives optional decisions.\n");
  assert.equal(result.selection.passageAdvice?.reason, "answered");
  assert.equal(result.selection.passageAdvice?.assessedUnitCount, 1);
  assert.match(result.optional?.entries[0]?.excerpt ?? "", /assert\.equal\(launchStatus, 'running'\)/);
  const receipt = readFileSync(join(contextStateRoot(root), "routes", `${result.receiptId}.json`), "utf8");
  assert.ok(!receipt.includes("assert.equal(launchStatus"));
  assert.ok(result.selection.passageAdvice?.receiptIds.every(id => receipt.includes(id!)));
  assert.equal(result.selection.capturedSourceFacts?.spanFileCount, 1);
  assert.equal(result.selection.metadataStage.passageReserveMs, 5000);
  const profilePath = join(root, "config/governance/profile.yaml"), metadataOnly = JSON.parse(readFileSync(profilePath, "utf8"));
  metadataOnly.continuity.decisions.allowed_data_classes = ["metadata"];
  writeFileSync(profilePath, JSON.stringify(metadataOnly));
  groups.length = 0;
  const fallback = await contextRouteCommand(["--task", "Find proof that the selected simulator launches", "--revision", "1",
    "--decision-task", "fixture-task"], root, resolve("src/project_governance_runtime/assets/skills"));
  assert.equal(groups.length, 1);
  assert.equal(fallback.selection.metadataStage.passageReserveMs, 0);
  assert.equal(fallback.metadata?.coverage.passageReservedCalls, 0);
  assert.equal(fallback.selection.passageAdvice, null);
  assert.match(fallback.optional?.entries[0]?.excerpt ?? "", /assert\.equal\(launchStatus, 'running'\)/);
});
