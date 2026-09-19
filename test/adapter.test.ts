import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BEGIN, END, initRepo, writeAdapter } from "../src/ops/adapter.ts";

const repo = () => mkdtempSync(join(tmpdir(), "harness-adapter-"));

test("a repository with no instruction file gets one", () => {
  const dir = repo();
  const results = initRepo(dir);
  assert.equal(results[0]?.file, "AGENTS.md");
  assert.equal(results[0]?.action, "created");
  assert.ok(readFileSync(join(dir, "AGENTS.md"), "utf8").includes(BEGIN));
});

test("authored content around the block is never touched", () => {
  const dir = repo();
  const authored = "# Agent Instructions\n\nRules the team wrote.\n\n## Another section\n\nMore.\n";
  writeFileSync(join(dir, "AGENTS.md"), authored);
  initRepo(dir);
  const after = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert.ok(after.includes("Rules the team wrote."));
  assert.ok(after.includes("## Another section"));
  assert.ok(after.includes(BEGIN) && after.includes(END));
});

test("running it twice changes nothing the second time", () => {
  const dir = repo();
  writeFileSync(join(dir, "AGENTS.md"), "# A\n\nauthored\n");
  initRepo(dir);
  const once = readFileSync(join(dir, "AGENTS.md"), "utf8");
  const second = initRepo(dir);
  assert.equal(second[0]?.action, "unchanged");
  assert.equal(readFileSync(join(dir, "AGENTS.md"), "utf8"), once);
});

test("an edited block is refreshed without disturbing its surroundings", () => {
  const dir = repo();
  writeFileSync(join(dir, "AGENTS.md"), `# A\n\nbefore\n\n${BEGIN}\nstale contents\n${END}\n\nafter\n`);
  writeAdapter(dir, "AGENTS.md");
  const after = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert.ok(!after.includes("stale contents"), "the block is replaced");
  assert.ok(after.includes("before") && after.includes("after"), "its surroundings survive");
});

test("only instruction files already present are touched", () => {
  const dir = repo();
  writeFileSync(join(dir, "AGENTS.md"), "# A\n");
  writeFileSync(join(dir, "CODEX.md"), "# C\n");
  const results = initRepo(dir);
  assert.deepEqual(results.map((r) => r.file).sort(), ["AGENTS.md", "CODEX.md"]);
  assert.equal(existsSync(join(dir, "CLAUDE.md")), false, "a missing host file is not created");
});

test("the block routes, and carries no policy or thresholds", () => {
  const dir = repo();
  initRepo(dir);
  const text = readFileSync(join(dir, "AGENTS.md"), "utf8");
  assert.ok(text.includes("harness task create"), "it tells the host to record the job");
  assert.ok(text.includes("harness context get"), "and to fetch files through the harness");
  assert.ok(text.includes("harness check run"), "and to run checks through it");
  assert.ok(text.includes("never writes to the working tree"), "and that the host still edits");
  assert.ok(!/threshold|confidence|policy revision/i.test(text), "thin: no policy in the adapter");
});
