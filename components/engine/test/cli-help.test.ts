import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

test("public help works outside a repository without creating state", () => {
  const root = mkdtempSync(join(tmpdir(), "governance-help-"));
  try {
    const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
    for (const flag of ["--help", "-h", "help"]) {
      const result = spawnSync(process.execPath, [cli, flag], { cwd: root, encoding: "utf8", timeout: 10000 });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Usage: project-governance/);
      assert.match(result.stdout, /check-status --run/);
      assert.match(result.stdout, /harness --help/);
    }
    const invalid = spawnSync(process.execPath, [cli, "--help", "unexpected"], { cwd: root, encoding: "utf8", timeout: 10000 });
    assert.equal(invalid.status, 2);
    assert.deepEqual(readdirSync(root), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("CLI modules can be imported by a stdin-driven caller", () => {
  const cli = new URL("../src/cli.ts", import.meta.url).href;
  const result = spawnSync(process.execPath, ["--input-type=module", "-"], {
    input: `await import(${JSON.stringify(cli)}); console.log("imported");`,
    encoding: "utf8", timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "imported");
});
