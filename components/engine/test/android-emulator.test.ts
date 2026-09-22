import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { androidEmulatorAdapter, observeAndroidCapacity, observeAndroidEmulatorCleanup } from "../src/android-emulator.ts";
import { Store } from "../../harness/src/store/store.ts";
import { proposeAction, authorizeAction } from "../../harness/src/ops/actions.ts";
import { defaultPolicy } from "../../harness/src/ops/authority.ts";
import { WorkflowStore } from "../src/workflow-store.ts";
import { ResourceRegistry } from "../src/resources.ts";
import { parseRecipe, recipeDigest } from "../src/workflow-types.ts";
import { executeWorkflow } from "../src/workflow-executor.ts";
const config = { serial: "emulator-5564", adb: realpathSync(process.execPath), lockPath: "/fixture/locks/device", capacity: { beforeStage: "install", minimumAvailableBytes: 2048 } };
const inventory = "List of devices attached\nemulator-5564\tdevice\n";
const df = (available: string) => `Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/data 10 1 ${available} 10% /data\n`;

test("capacity uses exact online identity and explicit units; low or unknown observations refuse install", async () => {
  await assert.rejects(() => Reflect.apply(observeAndroidCapacity, null, [config]), /requires an absolute workspace/);
  await assert.rejects(() => Reflect.apply(observeAndroidEmulatorCleanup, null, [["android-emulator:emulator-5564"], config]), /requires an absolute workspace/);
  const probe = (output: string, ids = inventory) => async (_config: unknown, args: string[]) => args[0] === "devices" ? ids : output;
  assert.equal((await observeAndroidCapacity(config, process.cwd(), probe(df("5")))).state, "ready");
  assert.equal((await observeAndroidCapacity(config, process.cwd(), probe(df("1")))).state, "insufficient");
  for (const invalid of [df("100"), df("x"), df("5").replace("1024-blocks", "blocks"), df("5").replace("/data\n", "/sdcard\n")])
    assert.equal((await observeAndroidCapacity(config, process.cwd(), probe(invalid))).state, "unknown");
  for (const ids of [inventory.replace("5564", "5566"), inventory.replace("device\n", "offline\n"), "unavailable"])
    assert.equal((await observeAndroidCapacity(config, process.cwd(), probe(df("5"), ids))).state, "unknown");
  assert.throws(() => androidEmulatorAdapter({ ...config, serial: "emulator-5565" }));
  assert.throws(() => androidEmulatorAdapter({ ...config, capacity: { ...config.capacity, minimumAvailableBytes: -1 } }));
});

test("cleanup retains ownership until exact target, all ports and adapter lock are absent", async () => {
  const resources = ["android-emulator:emulator-5564", "tcp:127.0.0.1:8081"];
  const ports: number[] = [], probes = { devices: async () => "List of devices attached\nemulator-5554\tdevice\n",
    portClosed: async (port: number) => { ports.push(port); return true; }, lockAbsent: async () => true };
  assert.ok(await observeAndroidEmulatorCleanup(resources, config, process.cwd(), probes));
  assert.deepEqual(ports, [5564, 5565, 8081]);
  for (const alternative of [{ devices: async () => inventory }, { devices: async () => { throw new Error("unavailable"); } },
    { portClosed: async () => false }, { lockAbsent: async () => false }])
    assert.equal(await observeAndroidEmulatorCleanup(resources, config, process.cwd(), { ...probes, ...alternative }), null);
  assert.equal(await observeAndroidEmulatorCleanup([...resources, "ios-simulator:another"], config, process.cwd(), probes), null);
  assert.equal(await observeAndroidEmulatorCleanup([resources[1]!], config, process.cwd(), probes), null);
});

test("workflow capacity refusal skips install and dependent work while declared cleanup still runs", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "android-capacity-"))), database = join(root, "ledger.sqlite"), workspace = join(root, "workspace");
  mkdirSync(workspace);
  const core = new Store(database), store = new WorkflowStore(database), registry = new ResourceRegistry(join(root, "resources.sqlite"));
  try {
    const adb = join(root, "adb");
    writeFileSync(adb, `#!${process.execPath}\nconsole.log(process.argv.includes('devices') ? ${JSON.stringify(inventory)} : ${JSON.stringify(df("1"))});`); chmodSync(adb, 0o700);
    const task = core.createTask("fixture install", [{ kind: "scope", provenance: "operator", body: workspace }]), policy = defaultPolicy();
    const authority = { operation: "check" as const, scope: [workspace], targets: [], destination: null, policyRevision: policy.revision };
    const action = authorizeAction(core, proposeAction(core, task.taskId, authority), authority, policy, workspace);
    const op = (file: string) => ({ argv: [process.execPath, "-e", `require('node:fs').writeFileSync('${file}','ran')`], cwd: workspace, effect: "local" });
    const recipe = parseRecipe({ version: 1, id: "android", workspace, inputs: [], resources: ["android-emulator:emulator-5564"],
      androidEmulator: { ...config, adb, lockPath: join(root, "device.lock") }, operations: { install: op("installed"), test: op("tested"), cleanup: op("cleaned") },
      stages: [{ id: "install", operation: "install", deadlineMs: 2000 }, { id: "test", operation: "test", dependsOn: ["install"], deadlineMs: 2000 },
        { id: "cleanup", operation: "cleanup", cleanup: true, deadlineMs: 2000 }], deadlineMs: 10000, policyRevision: policy.revision, claims: [] });
    const binding = { taskId: task.taskId, taskVersion: task.version, actionId: action.actionId, authorityRef: "fixture", recipe, recipeDigest: recipeDigest(recipe), operationId: "fixture" };
    store.authorizeWorkflow(binding); const run = store.submit(binding);
    const result = await executeWorkflow(store, run.id, { commandsDirectory: join(root, "commands"), registry,
      observeCleanup: async () => existsSync(join(workspace, "cleaned")) ? "fixture cleanup observed" : null });
    assert.equal(result.state, "failed"); assert.equal(existsSync(join(workspace, "installed")), false); assert.equal(existsSync(join(workspace, "tested")), false);
    const stages = store.stages(run.id); assert.deepEqual(stages.map(stage => stage.state), ["failed", "blocked", "succeeded"]);
    assert.equal(JSON.parse(readFileSync(stages[0]!.result!.log, "utf8")).state, "insufficient");
    assert.equal(registry.inspect()[0]!.state, "released");
  } finally { registry.close(); store.close(); core.close(); rmSync(root, { recursive: true, force: true }); }
});

test("native Android observers exclude ambient credentials and reject workspace executables", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "android-observer-"))), workspace = join(root, "workspace");
  mkdirSync(workspace);
  const previous = process.env.GOVERNANCE_TEST_SECRET; process.env.GOVERNANCE_TEST_SECRET = "synthetic-only";
  try {
    const adb = join(root, "adb");
    writeFileSync(adb, `#!${process.execPath}\nif(process.env.GOVERNANCE_TEST_SECRET)process.exit(9);console.log(process.argv.includes('devices') ? ${JSON.stringify(inventory)} : ${JSON.stringify(df("5"))});`); chmodSync(adb, 0o700);
    assert.equal((await observeAndroidCapacity({ ...config, adb }, workspace)).state, "ready");
    const untrusted = join(workspace, "adb"); writeFileSync(untrusted, readFileSync(adb)); chmodSync(untrusted, 0o700);
    assert.throws(() => androidEmulatorAdapter({ ...config, adb: untrusted }, workspace), /outside every worker root/);
    await assert.rejects(() => observeAndroidCapacity({ ...config, adb: untrusted }, workspace), /outside every worker root/);
    let probed = false;
    await assert.rejects(() => observeAndroidCapacity({ ...config, adb: untrusted }, workspace, async () => { probed = true; return ""; }), /outside every worker root/);
    assert.equal(probed, false);
    assert.equal(await observeAndroidEmulatorCleanup(["android-emulator:emulator-5564"], { ...config, adb: untrusted }, workspace), null);
  } finally {
    if (previous === undefined) delete process.env.GOVERNANCE_TEST_SECRET; else process.env.GOVERNANCE_TEST_SECRET = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
