import { test, mock, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = process.env.GOVERNANCE_TEST_PACKAGE;
const runtimeModule = (name: string) => packageRoot
  ? pathToFileURL(join(realpathSync(packageRoot), "dist/engine/src", name + ".js")).href
  : new URL("../src/" + name + ".ts", import.meta.url).href;

if (process.env.GOVERNANCE_TEST_FOREGROUND_CHILD !== "1") {
  test("foreground checks retain their original run through observation gaps and bound genuine unknowns", () => {
    const env: NodeJS.ProcessEnv = { ...process.env, GOVERNANCE_TEST_FOREGROUND_CHILD: "1" };
    delete env.NODE_TEST_CONTEXT;
    const child = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--test", fileURLToPath(import.meta.url)], {
      env, encoding: "utf8", timeout: 30000,
    });
    assert.equal(child.status, 0, child.stdout + child.stderr);
  });
} else {
  const status = await import(runtimeModule("check-status"));
  const work = await import(runtimeModule("check-worker"));
  let observations: Array<Record<string, unknown>> = [], calls = 0, submissions = 0, now = 0, budget = 0;
  const id = "11111111-1111-4111-8111-111111111111";
  const unknown = { run_id: id, state: "incomplete", status: "outcome-unknown", orchestrator_failure: null, commands: [] };
  const terminal = (status: string) => ({ run_id: id, state: "terminal", status, result: { run_id: id, status, results: [], blocked: {}, plan: {} } });
  mock.module(runtimeModule("check-status"), { namedExports: { ...status,
    inspectCheckRun: () => { now += 1000; return observations[Math.min(calls++, observations.length - 1)]; },
  } });
  mock.module(runtimeModule("check-worker"), { namedExports: { ...work,
    dispatchChecks: (...args: any[]) => { submissions++; budget = args[3].deadlineMs; return { run_id: id, run_directory: "/synthetic-run" }; },
  } });
  mock.module(runtimeModule("decision-check-advice"), { namedExports: { checkDecisionAdvice: async () => null } });
  mock.module(runtimeModule("check-output"), { namedExports: { checkOutput: async () => null } });
  if (!packageRoot) {
    const configuration = await import(runtimeModule("pack-configuration"));
    mock.module(runtimeModule("pack-configuration"), { namedExports: { ...configuration,
      loadSubjectPacks: (subject: Parameters<typeof configuration.loadSubjectPacks>[0]) => configuration.loadSubjectPacks(subject,
        fileURLToPath(new URL("../../../src/project_governance_runtime/packs/", import.meta.url))),
    } });
    const assets = await import(runtimeModule("checker-assets"));
    mock.module(runtimeModule("checker-assets"), { namedExports: {
      PackagedCheckerAssets: class extends assets.PackagedCheckerAssets {
        constructor() { super(fileURLToPath(new URL("../../../src/project_governance_runtime/defaults/", import.meta.url))); }
      },
    } });
  }
  const { main } = await import(runtimeModule("cli"));
  async function invoke(t: TestContext, states: Array<Record<string, unknown>>, hook = false) {
    const root = mkdtempSync(join(tmpdir(), "check-foreground-")), previous = process.cwd();
    const environment = { GOVERNANCE_BASE_REF: process.env.GOVERNANCE_BASE_REF, GOVERNANCE_PRE_PUSH_TIMEOUT_SECONDS: process.env.GOVERNANCE_PRE_PUSH_TIMEOUT_SECONDS };
    const output: unknown[] = [];
    try {
      mkdirSync(join(root, "config/validation/packs"), { recursive: true });
      writeFileSync(join(root, "config/validation/packs/fixture.yaml"), JSON.stringify({ id: "fixture", enforcement: "blocking", stages: ["batch", "pre-push"], path_globs: ["**"], commands: [{ builtin: "format" }] }));
      writeFileSync(join(root, "example.txt"), "baseline\n");
      const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
      git("init", "-q"); git("add", "."); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Synthetic baseline");
      const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
      process.chdir(root); observations = states; calls = 0; submissions = 0; now = 0;
      t.mock.method(Date, "now", () => now);
      const setTimeout = globalThis.setTimeout;
      t.mock.method(globalThis, "setTimeout", ((callback: (...args: any[]) => void, _delay: number, ...args: any[]) => setTimeout(callback, 0, ...args)) as typeof setTimeout);
      t.mock.method(console, "log", (...args: unknown[]) => output.push(args)); t.mock.method(console, "error", (...args: unknown[]) => output.push(args));
      if (hook) { process.env.GOVERNANCE_BASE_REF = base; process.env.GOVERNANCE_PRE_PUSH_TIMEOUT_SECONDS = "600"; }
      const exit = await main(hook ? ["hook", "pre-push"] : ["check", "--stage", "batch", "--mode", "all", "--pack", "fixture", "--timeout-seconds", "0.001"]);
      assert.equal(submissions, 1, "never replay the submitted checks: " + JSON.stringify(output));
      return { exit, calls, budget };
    } finally {
      t.mock.restoreAll(); process.chdir(previous);
      for (const [key, value] of Object.entries(environment)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
      rmSync(root, { recursive: true, force: true });
    }
  }
  test("a claimed worker without a published identity remains observed until its original receipt", async t => {
    const r = await invoke(t, [unknown, unknown, { ...unknown, state: "running" }, terminal("passed")]);
    assert.equal(r.exit, 0); assert.equal(r.calls, 4);
  });
  test("completion after an incomplete snapshot returns the original native failure", async t => {
    const r = await invoke(t, [unknown, terminal("failed")]); assert.equal(r.exit, 1); assert.equal(r.calls, 2);
  });
  test("an owner that stays unknown fails closed at the existing observation budget", async t => {
    const r = await invoke(t, [unknown]); assert.equal(r.exit, 2); assert.equal(r.calls, 6);
  });
  test("recorded orchestration failure remains an immediate unknown outcome", async t => {
    const r = await invoke(t, [{ ...unknown, orchestrator_failure: { id, reason: "worker-incomplete" } }]); assert.equal(r.exit, 2); assert.equal(r.calls, 1);
  });
  test("native pre-push dispatch receives the deliberately configured deadline", async t => {
    const r = await invoke(t, [terminal("passed")], true); assert.equal(r.exit, 0); assert.equal(r.budget, 600000);
  });
}
