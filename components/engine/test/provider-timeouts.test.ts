import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { submitCommand, waitCommand, cancelCommand } from "../src/process-owner.ts";

test("provider idle, overall and disabled deadlines remain distinct and cancellable", async () => {
  const root = mkdtempSync(join(tmpdir(), "provider-timeouts-"));
  const init = { type: "system", subtype: "init", model: "fixture", effort: "high", session_id: "session", permissionMode: "bypassPermissions" };
  const final = { type: "result", subtype: "success", structured_output: { outcome: "completed", answer: "done", artifacts: [], checks: [], sources: [], remaining: [] } };
  try {
    for (const fixture of [
      { id: "idle", deadline: 0, idle: 200, activity: false, finish: false, reason: "idle-timeout" },
      { id: "active", deadline: 0, idle: 200, activity: true, finish: true, reason: "exit" },
      { id: "overall", deadline: 200, idle: 500, activity: true, finish: false, reason: "deadline" },
      { id: "cancel", deadline: 0, idle: 0, activity: false, finish: false, reason: "cancelled" },
    ]) {
      const script = `console.log(${JSON.stringify(JSON.stringify(init))});const timer=setInterval(()=>{${fixture.activity ? "process.stderr.write('activity\\n');" : ""}},40);${fixture.finish ? `setTimeout(()=>{clearInterval(timer);console.log(${JSON.stringify(JSON.stringify(final))})},450);` : ""}`;
      const submitted = submitCommand(join(root, fixture.id), { id: fixture.id, deadlineMs: fixture.deadline, idleTimeoutMs: fixture.idle, outputLimit: 8192,
        provider: { kind: "claude", model: "fixture", effort: "high", requiredTools: [] },
        operation: { argv: [process.execPath, "-e", script], cwd: root, env: {}, effect: "read", expectedExitCodes: [0] } });
      if (fixture.id === "cancel") cancelCommand(submitted.directory, submitted.requestDigest, "fixture parent");
      const result = await waitCommand(submitted.directory, submitted.requestDigest, 5000);
      assert.equal(result.receipt?.reason, fixture.reason, fixture.id);
      assert.equal(result.receipt?.cleanup, "confirmed", fixture.id);
      assert.equal(result.receipt?.state, fixture.id === "active" ? "succeeded" : fixture.id === "cancel" ? "cancelled" : "failed");
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
