import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { runtimeLauncher } from "../src/runtime-launcher.ts";

test("launcher preserves literal paths and arguments without shell expansion", () => {
  const root = mkdtempSync(join(tmpdir(), "launcher ' space-"));
  try {
    const executable = join(root, "candidate ' $.cjs"), launcher = join(root, "launcher");
    writeFileSync(executable, "console.log(JSON.stringify(process.argv.slice(2)))");
    writeFileSync(launcher, runtimeLauncher(process.execPath, executable, join(root, "registry"), root), { mode: 0o700 });
    const args = ["context-route", "--task", "literal $(echo unsafe) ' value\nsecond line"];
    const result = JSON.parse(execFileSync(launcher, args, { encoding: "utf8" }));
    assert.deepEqual(result, ["runtime-run", "--registry", join(root, "registry"), "--workspace", root, "--", ...args]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
