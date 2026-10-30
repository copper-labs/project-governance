import assert from "node:assert/strict";
import { removeRuntimeFixture } from "./fixtures/remove-runtime-fixture.ts";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { after, before, test, mock } from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Run the same fixture contract against source or the exact clean-installed package.
const pkg = process.env.GOVERNANCE_HOST_TEST_PACKAGE;
const moduleUrl = (file: string) => pkg ? pathToFileURL(join(pkg, "dist/engine/src", file + ".js")).href
  : new URL("../src/" + file + ".ts", import.meta.url).href;
const host = await import(moduleUrl("host-api-v1"));
const { RuntimeGenerations } = await import(moduleUrl("runtime-generations"));
const { stageRuntimeArchive } = await import(moduleUrl("runtime-staging"));
const { workflowCommand, workflowExitCode } = await import(moduleUrl("workflow-command"));
const { processFingerprint } = await import(moduleUrl("process-owner"));
const { parseRecipe } = await import(moduleUrl("workflow-types"));
const { digest, fileDigest } = host;
let root: string, staged: string;
const oldFingerprint = "Wed Oct 28 12:00:00 2026";
const cli = pkg ? join(pkg, "dist/engine/src/cli.js") : fileURLToPath(new URL("../src/cli.ts", import.meta.url));

before(() => {
  root = mkdtempSync(join(tmpdir(), "workflow-reader-proof-"));
  const source = join(root, "package"), archive = join(root, "fixture.tgz");
  mkdirSync(join(source, "dist/engine/src"), { recursive: true });
  mkdirSync(join(source, "dist/engine/assets"), { recursive: true });
  const manifest = { name: "@organta/project-governance", version: "3.0.0", type: "module",
    engines: { node: ">=24.16.0 <25" }, bin: { "project-governance": "dist/engine/src/cli.js" } };
  writeFileSync(join(source, "package.json"), JSON.stringify(manifest));
  writeFileSync(join(source, "dist/engine/src/cli.js"), 'console.log("project-governance 3.0.0");\n');
  writeFileSync(join(source, "dist/engine/assets/runtime-dependencies.lock.json"), JSON.stringify({
    lockfileVersion: 3, name: manifest.name, version: manifest.version, packages: { "": {} } }));
  childProcess.execFileSync("tar", ["-czf", archive, "-C", root, "package"]);
  staged = stageRuntimeArchive(archive, { schema_version: 2, package: manifest.name, version: manifest.version,
    artifact: { url: "file:///fixture.tgz", integrity: "sha512-" + createHash("sha512").update(readFileSync(archive)).digest("base64") },
    source_commit: "a".repeat(40), node: manifest.engines.node, configuration_schema: 1 }, join(root, "staged")).directory;
});
after(() => removeRuntimeFixture(root));

function fixture(outcome = "failed") {
  const dir = mkdtempSync(join(root, "case-")), database = join(dir, "harness.sqlite");
  writeFileSync(join(dir, "input.txt"), "synthetic fixture");
  const continuity = new host.Store(database), task = continuity.createTask("synthetic reader recovery", [{ kind: "scope", provenance: "operator", body: dir }]);
  const policy = host.defaultPolicy(), actionRequest = { operation: "check", scope: [dir],
    targets: [join(dir, "input.txt")], destination: null, policyRevision: policy.revision };
  const action = host.authorizeAction(continuity, host.proposeAction(continuity, task.taskId, actionRequest), actionRequest, policy, dir);
  const recipe = parseRecipe({ version: 1, id: "reader-fixture", workspace: dir,
    inputs: [{ path: "input.txt", digest: fileDigest(join(dir, "input.txt")) }], resources: ["fixture:resource"],
    operations: { check: { argv: [process.execPath, "-e", "process.exit(0)"], cwd: ".", effect: "read" } },
    stages: [{ id: "test", operation: "check", deadlineMs: 1000 }], deadlineMs: 3000, policyRevision: policy.revision, claims: ["synthetic"] });
  const store = new host.WorkflowStore(database), binding = { taskId: task.taskId, taskVersion: 1,
    actionId: action.actionId, authorityRef: "host:synthetic", recipe, recipeDigest: host.recipeDigest(recipe), operationId: "fixture:1" };
  store.authorizeWorkflow(binding);
  const submitted = store.submit(binding), run = store.claim(submitted.id, submitted.revision, "fixture-worker");
  const resources = new host.ResourceRegistry(join(dir, "resources.sqlite")), leases = resources.acquire(recipe.resources, run.owner, run.id);
  store.stage(run.id, run.owner, "test", "running");
  if (outcome === "cancelled") store.cancel(run.id, "host:synthetic-cancellation");
  store.stage(run.id, run.owner, "test", outcome, { state: outcome, cleanup: "confirmed", exitCode: outcome === "succeeded" ? 0 : 1,
    startedAt: "2026-10-28T12:00:00Z", endedAt: "2026-10-28T12:00:01Z", log: "synthetic", inputValidity: "valid", detail: "synthetic fixture" });
  const unknown = store.transition(run.id, run.owner, store.read(run.id).revision, "unknown");
  const receipt = { runId: run.id, bindingDigest: digest(run.binding), leases, observation: { kind: "synthetic-cleanup" } };
  resources.release(leases, digest(receipt));
  const receiptFile = join(dir, "cleanup.json"); writeFileSync(receiptFile, JSON.stringify(receipt));
  const args = ["--database", database, "--run", run.id, "--revision", String(unknown.revision), "--receipt", receiptFile, "--registry", resources.path];
  const terminal = workflowCommand("workflow-reconcile-cleanup", args).run;
  args[5] = String(terminal.revision);
  const generations = new RuntimeGenerations(join(dir, "runtime.sqlite")); generations.activate(staged, 0);
  const parent = generations.acquire("fixture-parent"), reader = generations.retain(parent.token, parent.owner, "workflow:" + run.id);
  const unrelated = generations.retain(parent.token, parent.owner, "unrelated"); generations.release(parent.token, parent.owner);
  const worker = join(dir, "worker"); mkdirSync(worker);
  const request = { version: 1, database, runId: run.id, bindingDigest: digest(run.binding), workerDigest: fileDigest(fileURLToPath(new URL("../src/workflow-worker.ts", import.meta.url))),
    generation: { registry: join(dir, "runtime.sqlite"), ...reader } };
  const owner: { requestDigest: string; pid: number; fingerprint?: unknown } = { requestDigest: digest(request), pid: process.pid, fingerprint: oldFingerprint };
  const save = (oldAcknowledgement = true) => {
    writeFileSync(join(worker, "request.json"), JSON.stringify(request));
    writeFileSync(join(worker, "owner.json"), JSON.stringify(owner));
    if (oldAcknowledgement) utimesSync(join(worker, "owner.json"), new Date("2026-10-28T12:00:01Z"), new Date("2026-10-28T12:00:01Z"));
  };
  save();
  const recoverArgs = [...args, "--worker-directory", worker];
  return { dir, database, store, resources, generations, request, owner, reader, unrelated, receiptFile, terminal, save, recoverArgs,
    recover: () => workflowCommand("workflow-reconcile-cleanup", recoverArgs),
    held: () => generations.state().readers.some((row: { token: string }) => row.token === reader.token),
    close() { generations.close(); resources.close(); store.close(); continuity.close(); rmSync(dir, { recursive: true, force: true }); } };
}

test("normal finalizer accepts proven PID reuse", { skip: process.platform !== "darwin" }, () => {
  const f = fixture();
  try { assert.equal(f.recover().run.state, "failed"); assert.equal(f.held(), false); } finally { f.close(); }
});

test("terminal CLI recovery retires only the original reader despite a reused PID", { skip: process.platform !== "darwin" }, () => {
  const f = fixture();
  try {
    const fingerprint = processFingerprint(process.pid), before = readFileSync(f.receiptFile);
    const later = f.resources.acquire(["fixture:resource"], "later-owner", "later-operation");
    const result = childProcess.spawnSync(process.execPath, [cli, "workflow-reconcile-cleanup", ...f.recoverArgs], { encoding: "utf8", timeout: 15000 });
    assert.equal(result.status, 1, result.stderr);
    assert.ok(result.stdout, result.stderr);
    assert.equal(JSON.parse(result.stdout).run.state, "failed", result.stderr);
    assert.equal(f.held(), false);
    assert.deepEqual(f.store.read(f.terminal.id), f.terminal);
    assert.deepEqual(readFileSync(f.receiptFile), before);
    assert.equal(processFingerprint(process.pid), fingerprint, "Unrelated live process remains unchanged");
    f.resources.assertHeld(later[0]);
    assert.ok(f.generations.state().readers.some((row: { token: string }) => row.token === f.unrelated.token));
    assert.equal(f.recover().run.state, "failed", "Exact terminal replay is idempotent");
  } finally { f.close(); }
});

for (const state of ["succeeded", "failed", "cancelled"]) test("PID reuse preserves original " + state + " outcome", { skip: process.platform !== "darwin" }, () => {
  const f = fixture(state);
  try { assert.equal(f.recover().run.state, state); assert.equal(f.held(), false); assert.equal(workflowExitCode(state), state === "succeeded" ? 0 : 1); }
  finally { f.close(); }
});

test("the live original identity refuses even if acknowledgement is backdated", () => {
  const f = fixture();
  try { f.owner.fingerprint = processFingerprint(process.pid); f.save(); assert.throws(f.recover, /still present/); assert.equal(f.held(), true); }
  finally { f.close(); }
});

test("a display or timezone difference alone cannot retire a live original", () => {
  const f = fixture();
  try {
    const current = processFingerprint(process.pid);
    for (const zone of ["UTC0", "Pacific/Honolulu"]) {
      const alternate = childProcess.execFileSync("/bin/ps", ["-p", String(process.pid), "-o", "lstart="], {
        encoding: "utf8", env: { ...process.env, LC_ALL: "C", TZ: zone } }).trim();
      if (alternate !== current) { f.owner.fingerprint = alternate; break; }
    }
    assert.notEqual(f.owner.fingerprint, current);
    f.save(false); assert.throws(f.recover, /still present|identity|absence/); assert.equal(f.held(), true);
  }
  finally { f.close(); }
});

for (const fingerprint of [undefined, null, "", "unknown", "Wed Oct 99 12:00:00 2026", "Thu Oct 28 12:00:00 2026"]) {
  test("unknown or invalid original identity refuses: " + String(fingerprint), () => {
    const f = fixture();
    try { f.owner.fingerprint = fingerprint; f.save(); assert.throws(f.recover, /still present|identity/); assert.equal(f.held(), true); }
    finally { f.close(); }
  });
}

for (const target of ["enumeration", "current-start"]) test("unavailable " + target + " refuses without reader release", () => {
  const f = fixture(), original = childProcess.execFileSync;
  const stub = mock.method(childProcess, "execFileSync", (...args: Parameters<typeof original>) => {
    const options = args[1] as string[];
    if (args[0] === "/bin/ps" && (target === "enumeration" ? options[0] === "-axo" : options[0] === "-p")) throw new Error("synthetic inspection failure");
    return original(...args);
  });
  syncBuiltinESMExports();
  try { assert.throws(f.recover); assert.equal(f.held(), true); }
  finally { stub.mock.restore(); syncBuiltinESMExports(); f.close(); }
});

for (const mutation of ["request", "binding", "reader-owner", "reader-revision", "reader-token", "receipt", "receipt-hash", "revision"]) {
  test("PID reuse cannot bypass " + mutation + " identity", () => {
    const f = fixture();
    try {
      if (mutation === "request") f.request.workerDigest = "changed";
      if (mutation === "binding") f.request.bindingDigest = "changed";
      if (mutation === "reader-owner") f.request.generation.owner = "other";
      if (mutation === "reader-revision") f.request.generation.revision++;
      if (mutation === "reader-token") f.request.generation.token = f.unrelated.token;
      if (mutation === "receipt") writeFileSync(f.receiptFile, JSON.stringify({ runId: f.terminal.id, bindingDigest: digest(f.terminal.binding), leases: [], observation: "changed" }));
      if (mutation === "receipt-hash") {
        const receipt = JSON.parse(readFileSync(f.receiptFile, "utf8")); receipt.observation = { kind: "fabricated" };
        writeFileSync(f.receiptFile, JSON.stringify(receipt));
      }
      if (mutation === "revision") f.recoverArgs[5] = String(f.terminal.revision - 1);
      if (mutation !== "request") f.owner.requestDigest = digest(f.request);
      f.save(); assert.throws(f.recover); assert.equal(f.held(), true);
    } finally { f.close(); }
  });
}

for (const output of ["", "unknown", "Fri Oct 99 12:00:00 2026"]) test("unreliable fresh UTC start refuses: " + output, () => {
  const f = fixture(), original = childProcess.execFileSync;
  const stub = mock.method(childProcess, "execFileSync", (...args: Parameters<typeof original>) => {
    const options = args[1] as string[];
    return args[0] === "/bin/ps" && options.includes("lstart=") ? output : original(...args);
  });
  syncBuiltinESMExports();
  try { assert.throws(f.recover, /identity|absence|still present/); assert.equal(f.held(), true); }
  finally { stub.mock.restore(); syncBuiltinESMExports(); f.close(); }
});

for (const changed of ["request", "owner", "timestamp"]) test("evidence changing during identity inspection refuses: " + changed, () => {
  const f = fixture(), original = childProcess.execFileSync;
  const stub = mock.method(childProcess, "execFileSync", (...args: Parameters<typeof original>) => {
    const result = original(...args), options = args[1] as string[];
    if (args[0] === "/bin/ps" && options.includes("lstart=")) {
      if (changed === "request") { f.request.workerDigest = "changed"; f.save(); }
      if (changed === "owner") { f.owner.fingerprint = "changed"; f.save(); }
      if (changed === "timestamp") f.save(false);
    }
    return result;
  });
  syncBuiltinESMExports();
  try { assert.throws(f.recover, /evidence changed/); assert.equal(f.held(), true); }
  finally { stub.mock.restore(); syncBuiltinESMExports(); f.close(); }
});


test("same-second start evidence remains ambiguous", () => {
  const f = fixture();
  try {
    const current = childProcess.execFileSync("/bin/ps", ["-p", String(process.pid), "-o", "lstart="], {
      encoding: "utf8", env: { ...process.env, LC_ALL: "C", TZ: "UTC0" } }).trim();
    const boundary = new Date(Date.parse(current + " GMT"));
    utimesSync(join(f.dir, "worker/owner.json"), boundary, boundary);
    assert.throws(f.recover, /absence|identity|still present/); assert.equal(f.held(), true);
  } finally { f.close(); }
});
