import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, chmodSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { providerDoctor } from "../src/provider-doctor.ts";
import { providerJobCommand } from "../src/provider-job-command.ts";

test("provider doctor resolves configuration without launching executable or exposing malformed configuration", async () => {
  const root = mkdtempSync(join(tmpdir(), "provider-doctor-"));
  try {
    const executable = join(root, "native"), marker = join(root, "launched"), config = join(root, "bindings.json");
    writeFileSync(executable, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)},'unexpected');\n`); chmodSync(executable, 0o700);
    const selected = { model: "fixture", effort: "high", executable };
    assert.equal(providerDoctor("claude", selected).status, "passed");
    const command = await providerJobCommand("provider-doctor", ["--provider", "claude", "--model", "fixture", "--effort", "high", "--executable", executable]);
    assert.equal(command.exitCode, 0); assert.equal(existsSync(marker), false);
    assert.equal(providerDoctor("claude").reason, "missing-model");
    assert.equal(providerDoctor("claude", { model: "fixture" }).reason, "missing-effort");
    assert.equal(providerDoctor("claude", { ...selected, executable: join(root, "missing") }).reason, "executable-unavailable");
    assert.equal(providerDoctor("gemini", { ...selected, model: "fixture-low" }).reason, "invalid-selection");
    writeFileSync(config, '{"secret-canary":"do-not-echo"}');
    const invalid = providerDoctor("claude", { config });
    assert.equal(invalid.reason, "invalid-configuration"); assert.equal(JSON.stringify(invalid).includes("secret-canary"), false);
    assert.equal(invalid.authentication, "not-probed"); assert.equal(invalid.network, "not-attempted");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
