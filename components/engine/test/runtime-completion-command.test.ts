import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readHostTransitionPlan, runtimeCompletionCommand } from "../src/runtime-completion-command.ts";
import { digest } from "../src/core.ts";

test("operator host planning is read-only and its saved plan rejects tampering before transition", async () => {
  const root = mkdtempSync(join(tmpdir(), "host-plan-command-")), path = join(root, "plan.json");
  try {
    const result = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL("../src/cli.ts", import.meta.url)), "runtime-host-plan", "--workspace", root], { encoding: "utf8" }));
    assert.ok(result.inputs.every((input: { kind: string }) => input.kind === "absent"));
    writeFileSync(path, JSON.stringify(result));
    assert.deepEqual(readHostTransitionPlan(path), result.plan);
    result.plan.writes[0].content += "Unreviewed change";
    writeFileSync(path, JSON.stringify(result));
    assert.throws(() => readHostTransitionPlan(path), /digest differs/);
    result.plan.writes[0].mode = -1; result.planDigest = digest(result.plan);
    writeFileSync(path, JSON.stringify(result));
    assert.throws(() => readHostTransitionPlan(path), /Invalid saved host write/);
    await assert.rejects(() => runtimeCompletionCommand(["--registry", "missing", "--workspace", root, "--candidate", "missing", "--backup", "missing", "--token", "t", "--owner", "o", "--host-plan", path, "--forward-repair"]), /cannot also change/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
