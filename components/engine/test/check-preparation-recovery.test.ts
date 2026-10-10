import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, existsSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { RuntimeGenerations } from "../src/runtime-generations.ts";
import { subjectDigest } from "../src/change-subject.ts";
import * as core from "../src/core.ts";

const qualified = {
  runtimeVersion: "4.2.0",
  archiveDigest: "sha256:9ae75656aac95318a361fd6390689b52abdbe3adce881e2ec18caae81ae30abf",
  treeDigest: "sha256:7d404559ff4960fde1e67944cacc5be23b719f60fb98e6905c40c7c61522f00e",
  workerDigest: "sha256:df62feb9d9be20a2d8fd3e29cf55d0d6805fc8458e2e0793485fdd984a5382b4",
};
const receiptName = "preparation-reader-recovery.json";
const workerRelative = "node_modules/@organta/project-governance/dist/engine/src/check-worker.js";

function fixture(originalDirectory?: string) {
  const state = realpathSync(mkdtempSync(join(tmpdir(), "check-preparation-recovery-"))), root = join(state, "runs"), workspace = join(state, "workspace");
  const id = randomUUID(), directory = join(root, id), generation = originalDirectory ?? join(state, "generation");
  mkdirSync(directory, { recursive: true }); mkdirSync(workspace);
  if (!originalDirectory) { mkdirSync(join(generation, "node_modules/@organta/project-governance/dist/engine/src"), { recursive: true }); writeFileSync(join(generation, workerRelative), "synthetic worker identity fixture\n"); }
  const registry = join(state, "registry.sqlite"), generations = new RuntimeGenerations(registry), db = new DatabaseSync(registry);
  db.prepare("UPDATE current SET revision=7,directory=? WHERE id=1").run(generation); db.close();
  const reader = { registry, ...generations.acquire(`check:${id}`) }, parent = generations.acquire(`startup-task:${core.digest("live-parent")}`);
  const input = join(workspace, "oversized.bin"), fd = openSync(input, "wx"); ftruncateSync(fd, 17 * 1024 * 1024); closeSync(fd);
  const hash = createHash("sha256"), chunk = Buffer.alloc(64 * 1024);
  for (let bytes = 0; bytes < 17 * 1024 * 1024; bytes += chunk.length) hash.update(chunk);
  const source = { kind: "worktree" as const, file_type: "regular" as const, path: "oversized.bin", identity: `sha256:${hash.digest("hex")}` };
  const records = [{ status: "added" as const, path: source.path, previous_path: null, before: null, after: source, changed_ranges: [] }];
  const scope = { kind: "project-governance-change-packet", version: 1, scope: "changed", mode: "changed", base_ref: "1".repeat(40), subject_digest: subjectDigest(records), records };
  const plan = { status: "ready", stage: "pre-push", execution_order: ["fixture"] };
  const packs = { fixture: { depends_on: [], enforcement: "blocking", commands: [{ run: [process.execPath, "-e", "require('fs').writeFileSync('executed','wrong')"] }] } };
  const pid = Number(execFileSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" }));
  const work = { version: 1, id, root: workspace, runsRoot: root, generation: reader, workerDigest: qualified.workerDigest, scope, plan, packs, trigger: "hook" };
  const intent = { version: 1, id, root: workspace, state: "running", runtimeVersion: qualified.runtimeVersion, archiveDigest: qualified.archiveDigest,
    plan, scope, packs_digest: core.digest(packs), trigger: "hook", owner: { pid, fingerprint: "original stopped worker" }, started_at: "2026-10-10T00:00:00.000Z" };
  const failure = { version: 1, id, reason: "worker-incomplete", ended_at: "2026-10-10T00:00:01.000Z" };
  core.durableJson(join(directory, "dispatch.json"), work); core.durableJson(join(directory, "run.json"), intent); core.durableJson(join(directory, "failure.json"), failure); writeFileSync(join(directory, "worker.claim"), "");
  return { state, root, workspace, id, directory, generation, generations, reader, parent, input, work, intent, failure, source,
    original: () => Object.fromEntries(["dispatch.json", "run.json", "failure.json", "worker.claim"].map(name => [name, readFileSync(join(directory, name))])),
    held: () => generations.state().readers,
    close: () => { generations.close(); rmSync(state, { recursive: true, force: true }); } };
}

if (process.env.GOVERNANCE_TEST_PREPARATION_CHILD !== "1") {
  test("stopped preparation recovery identity, witness and refusal fixtures", () => {
    // Module mocks live only in this child, so production admission has no inspector override.
    const childEnv: NodeJS.ProcessEnv = { ...process.env, GOVERNANCE_TEST_PREPARATION_CHILD: "1" };
    delete childEnv.NODE_TEST_CONTEXT;
    const child = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--test", "--test-reporter=spec", fileURLToPath(import.meta.url)], {
      env: childEnv, encoding: "utf8", timeout: 60_000,
    });
    assert.equal(child.status, 0, child.stdout + child.stderr);
    assert.match(child.stdout, /pass 12\b/u);
  });
  test("qualified original 4.2.0 generation recovers only synthetic preparation readers", {
    skip: !process.env.GOVERNANCE_TEST_LEGACY_GENERATION,
  }, async () => {
    // The explicit artifact checkpoint supplies a read-only generation outside the source tree.
    const f = fixture(realpathSync(process.env.GOVERNANCE_TEST_LEGACY_GENERATION!));
    try {
      const { inspectRuntimeGeneration } = await import("../src/runtime-inspection.ts");
      const verified = inspectRuntimeGeneration(f.generation);
      assert.equal(verified.runtimeVersion, qualified.runtimeVersion); assert.equal(verified.archiveDigest, qualified.archiveDigest);
      assert.equal(verified.installedTree.digest, qualified.treeDigest); assert.equal(core.fileDigest(join(f.generation, workerRelative)), qualified.workerDigest);
      const { reconcileCheckRun } = await import("../src/check-recovery.ts");
      const oldOwner = await import(pathToFileURL(join(f.generation, "node_modules/@organta/project-governance/dist/engine/src/check-recovery.js")).href);
      const original = f.original(), recover = () => reconcileCheckRun(f.id, { root: f.root, workspace: f.workspace });
      assert.throws(() => oldOwner.reconcileCheckRun(f.id, { root: f.root, workspace: f.workspace }), /requires result.json/u);
      assert.equal(f.held().length, 2); assert.deepEqual(f.original(), original); assert.equal(existsSync(join(f.directory, receiptName)), false);
      assert.equal(recover().original_status, "outcome-unknown"); assert.equal(recover().original_status, "outcome-unknown");
      assert.deepEqual(f.held().map(row => row.owner), [f.parent.owner]); assert.deepEqual(f.original(), original);
      assert.equal(existsSync(join(f.directory, "result.json")), false); assert.equal(existsSync(join(f.workspace, "executed")), false);
    } finally { f.close(); }
  });
} else {
  let active: ReturnType<typeof fixture>;
  const control = { identity: { ...qualified }, workerDigest: qualified.workerDigest, calls: 0, mutate: (_call: number) => {} };
  mock.module(new URL("../src/runtime-inspection.ts", import.meta.url).href, { namedExports: {
    inspectRuntimeGeneration: (directory: string) => {
      control.mutate(++control.calls);
      return { state: "verified", directory, runtimeVersion: control.identity.runtimeVersion, archiveDigest: control.identity.archiveDigest,
        installedTree: { digest: control.identity.treeDigest, entries: 1, bytes: 1 } };
    },
  } });
  mock.module(new URL("../src/core.ts", import.meta.url).href, { namedExports: { ...core,
    fileDigest: (path: string) => path === join(active.generation, workerRelative) ? control.workerDigest : core.fileDigest(path),
  } });
  const { reconcileCheckRun, CheckRecoveryRefusal } = await import("../src/check-recovery.ts");
  const run = (body: (f: ReturnType<typeof fixture>, recover: () => ReturnType<typeof reconcileCheckRun>) => void) => {
    active = fixture(); control.identity = { ...qualified }; control.workerDigest = qualified.workerDigest; control.calls = 0; control.mutate = () => {};
    try { body(active, () => reconcileCheckRun(active.id, { root: active.root, workspace: active.workspace })); }
    finally { active.close(); }
  };
  const refused = (f: ReturnType<typeof fixture>, recover: () => unknown, pattern: RegExp) => {
    const original = f.original(); assert.throws(recover, error => error instanceof CheckRecoveryRefusal && pattern.test(error.message));
    assert.equal(f.held().length, 2); assert.equal(existsSync(join(f.directory, receiptName)), false); assert.deepEqual(f.original(), original);
  };

  test("original no-result worker-incomplete shape releases only its exact reader and replays", () => run((f, recover) => {
    const original = f.original(), response = recover();
    assert.equal(response.original_status, "outcome-unknown"); assert.equal(response.commands, 0);
    assert.deepEqual(f.held().map(row => row.owner), [f.parent.owner]); assert.deepEqual(f.original(), original);
    const receipt = JSON.parse(readFileSync(join(f.directory, receiptName), "utf8"));
    assert.equal(receipt.kind, "project-governance-check-preparation-reader-recovery"); assert.equal(receipt.commands_started, false);
    assert.deepEqual(receipt.impossible_input, { record: 0, side: "after", source_kind: "worktree", path_digest: core.digest("oversized.bin"), identity: f.source.identity, size_bytes: 17 * 1024 * 1024, limit_bytes: 16 * 1024 * 1024 });
    assert.ok(!JSON.stringify(receipt).includes("oversized.bin")); assert.equal(existsSync(join(f.directory, "result.json")), false);
    assert.equal(existsSync(join(f.workspace, "executed")), false); assert.deepEqual(recover(), response);
  }));
  test("blocked plans require the same impossible-input witness", () => run((f, recover) => {
    const plan = { ...f.work.plan, status: "blocked", execution_order: [] };
    core.durableJson(join(f.directory, "dispatch.json"), { ...f.work, plan }); core.durableJson(join(f.directory, "run.json"), { ...f.intent, plan });
    assert.equal(recover().original_status, "outcome-unknown"); assert.deepEqual(f.held().map(row => row.owner), [f.parent.owner]);
  }));
  test("live or reused worker PID refuses even with a stale fingerprint", () => run((f, recover) => {
    core.durableJson(join(f.directory, "run.json"), { ...f.intent, owner: { pid: process.pid, fingerprint: "different original process" } }); refused(f, recover, /worker is present/u);
  }));
  test("packet, pack, command and unexpected evidence refuse", () => {
    for (const name of ["packet", core.digest("fixture").slice(7), "command-0", "unexpected.tmp"]) run((f, recover) => {
      mkdirSync(join(f.directory, name)); refused(f, recover, /packet, command or unexpected/u);
    });
  });
  test("nonregular, nonempty and absent worker claims refuse", () => {
    for (const kind of ["missing", "nonempty", "link"]) run((f, recover) => {
      const path = join(f.directory, "worker.claim"); rmSync(path);
      if (kind === "nonempty") writeFileSync(path, "changed");
      if (kind === "link") symlinkSync(join(f.directory, "failure.json"), path);
      assert.throws(recover, /worker claim/u); assert.equal(f.held().length, 2); assert.equal(existsSync(join(f.directory, receiptName)), false);
    });
  });
  test("version, archive, tree, worker and execution identities all refuse drift", () => {
    for (const field of ["runtimeVersion", "archiveDigest", "treeDigest"] as const) run((f, recover) => {
      control.identity[field] = "unqualified"; refused(f, recover, /qualified original/u);
    });
    run((f, recover) => { control.workerDigest = "changed worker"; refused(f, recover, /qualified original/u); });
    run((f, recover) => { core.durableJson(join(f.directory, "run.json"), { ...f.intent, archiveDigest: core.digest("foreign archive") }); refused(f, recover, /qualified original/u); });
  });
  test("original dispatch, intent and failure bindings cannot be substituted", () => {
    run((f, recover) => { core.durableJson(join(f.directory, "dispatch.json"), { ...f.work, packs: { other: {} } }); refused(f, recover, /binding differs/u); });
    run((f, recover) => { core.durableJson(join(f.directory, "failure.json"), { ...f.failure, id: randomUUID() }); refused(f, recover, /binding differs/u); });
  });
  test("foreign or missing readers refuse without releasing the parent", () => {
    run((f, recover) => { core.durableJson(join(f.directory, "dispatch.json"), { ...f.work, generation: { ...f.reader, token: f.parent.token } }); refused(f, recover, /ownership mismatch/u); });
    run((f, recover) => { f.generations.release(f.reader.token, f.reader.owner); assert.throws(recover, /ownership mismatch/u); assert.deepEqual(f.held().map(row => row.owner), [f.parent.owner]); assert.equal(existsSync(join(f.directory, receiptName)), false); });
  });
  test("packet absence with absent, smaller, changed or symlinked input is insufficient", () => {
    for (const kind of ["missing", "small", "changed", "link"]) run((f, recover) => {
      rmSync(f.input);
      if (kind === "small") writeFileSync(f.input, "smaller");
      if (kind === "changed") { const fd = openSync(f.input, "wx"); ftruncateSync(fd, 17 * 1024 * 1024); closeSync(fd); const changed = openSync(f.input, "r+"); writeFileSync(changed, "different"); closeSync(changed); }
      if (kind === "link") symlinkSync(join(f.directory, "failure.json"), f.input);
      refused(f, recover, /impossible pinned input/u);
    });
  });
  test("unchanged semantic JSON with changed original bytes still refuses before release", () => run((f, recover) => {
    control.mutate = call => { if (call === 2) writeFileSync(join(f.directory, "dispatch.json"), JSON.stringify(f.work, null, 2)); };
    assert.throws(recover, /evidence changed/u); assert.equal(f.held().length, 2); assert.equal(existsSync(join(f.directory, receiptName)), false);
  }));
  test("the impossible-input witness is rechecked before release", () => run((f, recover) => {
    control.mutate = call => { if (call === 2) writeFileSync(f.input, "changed after first witness"); };
    assert.throws(recover, /pinned input changed/u); assert.equal(f.held().length, 2); assert.equal(existsSync(join(f.directory, receiptName)), false);
  }));
  test("recovery receipt substitution refuses duplicate replay", () => run((f, recover) => {
    recover(); const path = join(f.directory, receiptName), receipt = JSON.parse(readFileSync(path, "utf8"));
    core.durableJson(path, { ...receipt, original_status: "passed" }); assert.throws(recover, /receipt differs/u);
    assert.deepEqual(f.held().map(row => row.owner), [f.parent.owner]); assert.equal(existsSync(join(f.directory, "result.json")), false);
  }));
}
