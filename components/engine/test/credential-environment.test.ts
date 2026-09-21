import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { credentialNames } from "../src/credential-environment.ts";
import { submitCommand, waitCommand } from "../src/process-owner.ts";

test("only approved credential names reach native commands and values stay out of durable requests", async () => {
  const root = mkdtempSync(join(tmpdir(), "credential-env-"));
  const name = "ENGINE_FIXTURE_TOKEN", previous = process.env[name];
  process.env[name] = "fixture-only-private-value";
  try {
    const operation = { argv: [process.execPath, "-e", "process.exit(process.env.ENGINE_FIXTURE_TOKEN ? 0 : 7)"], cwd: root, env: {}, credentialEnv: [name], effect: "read" as const, expectedExitCodes: [0] };
    const submitted = submitCommand(join(root, "approved"), { id: "approved", operation, deadlineMs: 3000, outputLimit: 4096 });
    assert.equal((await waitCommand(submitted.directory, submitted.requestDigest, 5000)).receipt?.state, "succeeded");
    assert.ok(!readFileSync(join(submitted.directory, "request.json"), "utf8").includes(process.env[name]!));
    delete process.env[name];
    assert.equal(submitCommand(submitted.directory, { id: "approved", operation, deadlineMs: 3000, outputLimit: 4096 }).submitted, false,
      "reconnecting to existing work does not require credentials again");
    assert.throws(() => submitCommand(join(root, "missing"), { id: "missing", operation, deadlineMs: 3000, outputLimit: 4096 }), /credential unavailable/);
    assert.equal(existsSync(join(root, "missing")), false);
    assert.throws(() => credentialNames(["PATH"]), /Invalid/);
    assert.throws(() => credentialNames([name, name]), /Invalid/);
  } finally {
    if (previous === undefined) delete process.env[name]; else process.env[name] = previous;
    rmSync(root, { recursive: true });
  }
});
