import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { OPERATION_CATALOG, resolveWorkflowRecipe } from "../src/workflow-catalog.ts";
import { validateInputs } from "../src/workflow-types.ts";

test("submitted workflows select catalog operations and become stale when the catalog changes", () => {
  const workspace = mkdtempSync(join(tmpdir(), "workflow-catalog-"));
  try {
    const path = join(workspace, OPERATION_CATALOG); mkdirSync(dirname(path), { recursive: true });
    const operation = { argv: [process.execPath, "--version"], cwd: workspace, effect: "read" };
    writeFileSync(path, JSON.stringify({ version: 1, operations: { inspect: operation } }));
    const input = { version: 1, id: "inspect", workspace, inputs: [], resources: [],
      stages: [{ id: "inspect", operation: "inspect", deadlineMs: 1000 }], deadlineMs: 2000, policyDigest: "policy-2", claims: ["inspection"] };
    const recipe = resolveWorkflowRecipe(input);
    assert.deepEqual(recipe.operations.inspect!.argv, operation.argv);
    assert.equal(validateInputs(recipe), true);
    assert.throws(() => resolveWorkflowRecipe({ ...input, operations: { inspect: operation } }), /cannot define operations/);
    assert.throws(() => resolveWorkflowRecipe({ ...input, stages: [{ id: "bad", operation: "unknown" }] }), /not in the project catalog/);
    writeFileSync(path, JSON.stringify({ version: 1, operations: { inspect: { ...operation, argv: [process.execPath, "-e", "process.exit(1)"] } } }));
    assert.equal(validateInputs(recipe), false);
    writeFileSync(path, JSON.stringify({ version: 1, operations: { inspect: { ...operation, terminationGraceMs: 15000 } } }));
    assert.equal(resolveWorkflowRecipe(input).operations.inspect!.terminationGraceMs, 15000);
    for (const terminationGraceMs of [0, 30001, 1.5, "15000"]) {
      writeFileSync(path, JSON.stringify({ version: 1, operations: { inspect: { ...operation, terminationGraceMs } } }));
      assert.throws(() => resolveWorkflowRecipe(input), /termination grace/);
    }
    writeFileSync(path, JSON.stringify({ version: 1, operations: { inspect: { ...operation,
      env: { PROJECT_GOVERNANCE_WORKFLOW_RUN_ID: "old-run" } } } }));
    assert.throws(() => resolveWorkflowRecipe(input), /engine-owned/);
    const target = join(workspace, "alternate.json"); writeFileSync(target, "{}"); rmSync(path); symlinkSync(target, path);
    assert.throws(() => resolveWorkflowRecipe(input), /symlinks/);
  } finally { rmSync(workspace, { recursive: true }); }
});
