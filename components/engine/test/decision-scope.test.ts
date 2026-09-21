import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDecisionScope } from "../src/decision-scope.ts";

test("verified binding supplies scope automatically and rejects conflicting overrides", t => {
  const root = mkdtempSync(join(tmpdir(), "decision-scope-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const binding = { taskId: "task", revision: "2", workspace: root };
  assert.deepEqual(resolveDecisionScope(root, {}, binding), { workspace: realpathSync(root), taskId: "task", taskRevision: "2" });
  assert.throws(() => resolveDecisionScope(root, { taskId: "other" }, binding), /conflicts/);
  assert.throws(() => resolveDecisionScope(root, { revision: "3" }, binding), /conflicts/);
  assert.equal(resolveDecisionScope(root, { revision: "2" }), null);
  assert.throws(() => resolveDecisionScope(root, { taskId: "task" }));
  assert.deepEqual(resolveDecisionScope(root, { taskId: "manual", revision: "2" }), { workspace: realpathSync(root), taskId: "manual", taskRevision: "2" });
});
