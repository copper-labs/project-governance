import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { evaluationCommand } from "../src/evaluation-command.ts";
import { evaluateEvidence } from "../src/evaluation-api-v1.ts";

const request = { version: 1, evaluationId: "standalone", evidence: [{ id: "text", type: "text", text: "Supplied" }], questions: [{ name: "present", type: "predicate", instructions: "Is it present?" }] };
test("argument/file/JSON/schema errors each return one structured envelope with unresolved null identities", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "evaluation-command-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "invalid.json"), "{"); writeFileSync(join(root, "wrong.json"), JSON.stringify({ ...request, executable: "danger" }));
  symlinkSync(join(root, "invalid.json"), join(root, "symlink.json"));
  for (const args of [[], ["--unknown"], ["--request-file", "missing.json"], ["--request-file", "invalid.json"], ["--request-file", "symlink.json"], ["--request-file", "wrong.json"]]) {
    const { result, exitCode } = await evaluationCommand(args, root); assert.equal(exitCode, 1); assert.equal(result.version, 3); assert.equal(result.kind, "supplied-evaluation");
    assert.equal(result.providerCalled, false); assert.equal(result.evaluationId, null); assert.equal(result.provider, null); assert.deepEqual(result.answers, {});
  }
});
test("minimal/disabled configuration and invalid policy stay zero dispatch without task binding", async t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "evaluation-disabled-command-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "request.json"), JSON.stringify(request));
  const disabled = await evaluationCommand(["--request-file", "request.json"], root); assert.equal(disabled.result.reason, "global-off"); assert.equal(disabled.exitCode, 1);
  mkdirSync(join(root, "config/governance"), { recursive: true }); writeFileSync(join(root, "config/governance/profile.yaml"), "continuity:\n  decisions:\n    evaluation:\n      enabled: true\n");
  assert.equal((await evaluateEvidence(request, { workspace: root })).reason, "evaluation-configuration-unavailable");
});
test("narrow library exposes evaluation only and rejects caller transport options", async () => {
  const api = await import("../src/evaluation-api-v1.ts"); assert.deepEqual(Object.keys(api).sort(), ["EVALUATION_API_VERSION", "evaluateEvidence"]); assert.equal(api.EVALUATION_API_VERSION, 1);
  const result = await evaluateEvidence(request, { workspace: process.cwd(), token: "untrusted" } as any);
  assert.equal(result.reason, "evaluation-workspace-invalid"); assert.equal(result.providerCalled, false);
});
test("native CLI prints exactly one JSON result for malformed and disabled requests", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "evaluation-cli-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "request.json"), JSON.stringify(request));
  for (const file of ["request.json", "missing.json"]) {
    const result = spawnSync(process.execPath, [resolve("components/engine/src/cli.ts"), "evaluate", "--request-file", file], { cwd: root, encoding: "utf8", timeout: 20000 });
    assert.equal(result.status, 1, result.stderr); const lines = result.stdout.trim().split("\n"); assert.equal(lines.length, 1);
    const value = JSON.parse(lines[0]!); assert.equal(value.version, 3); assert.equal(value.kind, "supplied-evaluation"); assert.equal(value.providerCalled, false);
  }
});

test("request growth or FIFO replacement between inspection and open is denied before reading bytes", async t => {
  const fs = await import("node:fs"), { syncBuiltinESMExports } = await import("node:module");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "evaluation-request-race-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = join(root, "request.json"), originalOpen = fs.default.openSync, originalRead = fs.default.readSync;
  for (const replacement of ["grow", "fifo"] as const) {
    if (fs.default.existsSync(path)) fs.default.unlinkSync(path); writeFileSync(path, JSON.stringify(request));
    let read = false, swapped = false;
    try {
      fs.default.openSync = ((target: any, ...args: any[]) => {
        if (target === path && !swapped) {
          swapped = true;
          if (replacement === "grow") fs.default.truncateSync(path, 16 * 1024 * 1024 + 1);
          else { fs.default.unlinkSync(path); assert.equal(spawnSync("mkfifo", [path]).status, 0); }
        }
        return (originalOpen as any)(target, ...args);
      }) as typeof originalOpen;
      fs.default.readSync = ((...args: any[]) => { read = true; return (originalRead as any)(...args); }) as typeof originalRead; syncBuiltinESMExports();
      const value = await evaluationCommand(["--request-file", path], root);
      assert.equal(value.exitCode, 1); assert.equal(value.result.reason, "evaluation-request-file-invalid"); assert.equal(read, false); assert.equal(swapped, true);
    } finally { fs.default.openSync = originalOpen; fs.default.readSync = originalRead; syncBuiltinESMExports(); }
  }
});
