import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../../harness/src/store/store.ts";
import { proposeAction, authorizeAction } from "../../harness/src/ops/actions.ts";
import { defaultPolicy } from "../../harness/src/ops/authority.ts";
import { WorkflowStore } from "../src/workflow-store.ts";
import { dispatchWorkflow, observeWorkflow } from "../src/workflow-worker.ts";
import { parseRecipe, recipeDigest } from "../src/workflow-types.ts";
import { ResourceRegistry } from "../src/resources.ts";
import { RuntimeGenerations } from "../src/runtime-generations.ts";
import { DatabaseSync } from "node:sqlite";

test("a complete workflow survives caller exit; reconnect observes the same native execution", async () => {
  const dir = mkdtempSync(join(tmpdir(), "engine-worker-")), database = join(dir, "ledger.sqlite");
  const continuity = new Store(database), store = new WorkflowStore(database);
  const generationPath = join(dir, "generations.sqlite"), generations = new RuntimeGenerations(generationPath);
  // Installed payload verification has separate artifact tests; this fixture isolates worker lease lifetime.
  const fixture = new DatabaseSync(generationPath);
  fixture.prepare("UPDATE current SET directory=?,revision=1 WHERE id=1").run(dir); fixture.close();
  const parent = generations.acquire("test-submitter");
  try {
    const task = continuity.createTask("run detached native check", [{ kind: "scope", provenance: "operator", body: dir }]);
    const policy = defaultPolicy(), req = { operation: "check" as const, scope: [dir], targets: [], destination: null, policyRevision: policy.revision };
    const action = authorizeAction(continuity, proposeAction(continuity, task.taskId, req), req, policy, dir);
    const recipe = parseRecipe({ version: 1, id: "detach", workspace: dir, inputs: [], resources: [],
      operations: { test: { argv: [process.execPath, "-e", "setTimeout(()=>require('fs').appendFileSync('count','once\\n'),250)"], cwd: dir, effect: "local" } },
      stages: [{ id: "native", operation: "test", deadlineMs: 2000 }], deadlineMs: 4000, policyDigest: policy.revision, claims: ["native check"] });
    const binding = { taskId: task.taskId, taskVersion: task.version, actionId: action.actionId, authorityRef: "host:test",
      recipe, recipeDigest: recipeDigest(recipe), operationId: "once" };
    store.authorizeWorkflow(binding);
    const run = store.submit(binding);
    const workers = join(dir, "workers"), registry = join(dir, "resources.sqlite");
    const resourceFixture = new ResourceRegistry(registry);resourceFixture.close();
    const legacyRegistry = new DatabaseSync(registry);legacyRegistry.exec("PRAGMA user_version=1");legacyRegistry.close();
    assert.throws(()=>dispatchWorkflow(database,run.id,workers,registry),/RESOURCE_PROTOCOL_MIGRATION_REQUIRED/);
    assert.equal(existsSync(join(workers,run.id)),false);
    assert.equal(store.read(run.id).state,"queued");
    assert.equal(generations.state().readers.length,1);
    const migrated = new ResourceRegistry(registry,{migrateFromProtocol1:true,authority:"test:approved-protocol-migration"});migrated.close();
    const args = [database, run.id, workers, registry].map(v => JSON.stringify(v)).join(",");
    const source = `import { dispatchWorkflow } from ${JSON.stringify(new URL("../src/workflow-worker.ts", import.meta.url).href)}; console.log(dispatchWorkflow(${args}));`;
    const directory = execFileSync(process.execPath, ["--input-type=module", "-e", source], { encoding: "utf8", timeout: 3000,
      env: { ...process.env, GOVERNANCE_GENERATION_REGISTRY: generationPath, GOVERNANCE_GENERATION_TOKEN: parent.token, GOVERNANCE_GENERATION_OWNER: parent.owner } }).trim();
    generations.release(parent.token, parent.owner);
    assert.equal(generations.state().readers.length, 1);
    assert.equal(dispatchWorkflow(database, run.id, workers, registry), directory);
    const until = Date.now() + 6000;
    let result = observeWorkflow(directory);
    while ((result.worker !== "terminal" || generations.state().readers.length) && Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, 50));
      result = observeWorkflow(directory);
    }
    assert.equal(generations.state().readers.length, 0);
    assert.equal(result.run.state, "succeeded");
    assert.equal(readFileSync(join(dir, "count"), "utf8"), "once\n");
    assert.equal(dispatchWorkflow(database, run.id, workers, registry), directory);
    assert.equal(store.stages(run.id)[0]!.result!.cleanup, "confirmed");
  } finally { generations.close(); store.close(); continuity.close(); rmSync(dir, { recursive: true }); }
});
