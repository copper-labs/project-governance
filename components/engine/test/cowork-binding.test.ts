import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { coworkTaskStart, coworkTaskResume } from "../src/cowork-tasks.ts";
import { withCoworkBinding } from "../src/cowork-binding.ts";
import { managedCommandEffect } from "../src/runtime-invocation.ts";

test("Cowork effects reject unknown operations and extra argv", () => {
  assert.equal(managedCommandEffect("cowork", ["file-read"]), "read");
  assert.equal(managedCommandEffect("cowork", ["file-apply"]), "write");
  assert.equal(managedCommandEffect("cowork", ["shell"]), null);
  assert.equal(managedCommandEffect("cowork", ["file-read", "--extra"]), null);
});
test("task continuation preserves its handle and rejects stale mutation or unrelated workspace", t => {
  const root = mkdtempSync(join(tmpdir(), "cowork-task-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q", root]);
  const started = coworkTaskStart(root, { outcome: "Update source", scope: ["src/a.ts"], acceptance: ["Checks pass"], constraints: [] });
  const binding = { session: started.session, task_id: started.task.taskId, expected_version: 1 };
  const resumed = coworkTaskResume(root, binding);
  assert.equal(resumed.session, started.session);
  assert.equal(resumed.workspace.withinTaskScope, true);
  assert.equal(resumed.workspace.next, null);
  withCoworkBinding(root, binding, true, ({ assertPaths }) => {
    assertPaths(["src/a.ts"]);
    assert.throws(() => assertPaths(["other.ts"]), /outside-task/u);
  });
  assert.throws(() => withCoworkBinding(root, { ...binding, expected_version: 2 }, true, () => {}), /version-conflict/u);
  assert.throws(() => withCoworkBinding(root, { ...binding, session: "cowork:00000000-0000-0000-0000-000000000000" }, false, () => {}), /binding-mismatch/u);
});

test("checkpoint rejects run IDs without recording and accepts a summary of retained runs", async t => {
  const { coworkCheckpoint } = await import("../src/cowork-command.ts");
  const root = mkdtempSync(join(tmpdir(), "cowork-checkpoint-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q", root]);
  const started = coworkTaskStart(root, { outcome: "Update guide", scope: ["docs/example.md"], acceptance: ["Checks pass"], constraints: [] });
  const binding = { session: started.session, task_id: started.task.taskId, expected_version: 1 };
  assert.throws(() => coworkCheckpoint(root, binding, { summary: "Checked", next: "Commit", evidence: ["not-an-evidence-id"] }), /evidence-id-required/u);
  withCoworkBinding(root, binding, false, ({ store }) => assert.equal(store.latestCheckpoint(binding.task_id), null));
  const result = coworkCheckpoint(root, binding, { summary: "Retained check run inspected", next: "Commit", evidence: [] });
  assert.equal(result.ok, true);
  assert.equal(result.checkpoint.taskId, binding.task_id);
});
