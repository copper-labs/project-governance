import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ResourceRegistry } from "../src/resources.ts";
import { workspaceClaim } from "../src/workspace-claims.ts";
import { submitCommand, waitCommand } from "../src/process-owner.ts";

test("detached owner admits claims before launch and releases them after confirmed cleanup", async () => {
  const root = mkdtempSync(join(tmpdir(), "command-claims-"));
  const registry = new ResourceRegistry(join(root, "registry.sqlite"));
  try {
    const held = registry.acquire([workspaceClaim([root], "exclusive", "existing")], "existing", "existing");
    const marker = join(root, "launched");
    const request = { id: "blocked", operation: { argv: [process.execPath, "-e", `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`], cwd: root, env: {}, expectedExitCodes: [0], effect: "local" as const },
      deadlineMs: 3000, outputLimit: 8192, coordination: { registry: registry.path, resources: [workspaceClaim([root], "writer", "next")] } };
    const blocked = submitCommand(join(root, "blocked"), request);
    const rejection = await waitCommand(blocked.directory, blocked.requestDigest, 5000);
    assert.equal(rejection.receipt?.reason, "resource-admission-failed");
    assert.equal(existsSync(marker), false);
    registry.release(held, "prior cleanup");
    const admitted = submitCommand(join(root, "admitted"), { ...request, id: "admitted" });
    const result = await waitCommand(admitted.directory, admitted.requestDigest, 5000);
    assert.equal(result.receipt?.state, "succeeded");
    assert.equal(result.receipt?.cleanup, "confirmed");
    assert.equal(existsSync(marker), true);
    // Receipt publication precedes claim release; wait only for that same owner's short completion interval.
    for (let attempt = 0; attempt < 20 && registry.inspect().some(row => row.state === "held"); attempt++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(registry.inspect().every(row => row.state === "released"), true);
    assert.equal(submitCommand(admitted.directory, { ...request, id: "admitted" }).submitted, false);
  } finally { registry.close(); rmSync(root, { recursive: true, force: true }); }
});
