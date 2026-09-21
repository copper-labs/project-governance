import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { providerBinding } from "../src/provider-binding.ts";
test("provider binding preserves explicit precedence without model or executable fallback", () => {
  const root = mkdtempSync(join(tmpdir(), "provider-binding-"));
  try {
    const backend = join(root, "claude"), config = join(root, "config.json");
    writeFileSync(backend, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    writeFileSync(config, JSON.stringify({ version: 1, providers: { claude: { model: "configured", effort: "high", executable: backend } } }));
    assert.deepEqual(providerBinding("claude", { config, model: "explicit", effort: "xhigh" }), { provider: "claude", model: "explicit", effort: "xhigh", backend: realpathSync(backend) });
    assert.equal(providerBinding("claude", { config }).model, "configured");
    assert.equal(providerBinding("claude", { model: "selected", effort: "high" }, { PATH: root }).backend, realpathSync(backend));
    assert.throws(() => providerBinding("claude", { config, executable: join(root, "missing") }), /unavailable/);
    assert.throws(() => providerBinding("claude", { executable: backend }), /explicit model/);
    assert.throws(() => providerBinding("gemini", { executable: backend, model: "native-high", effort: "low" }), /must agree/);
    writeFileSync(config, JSON.stringify({ version: 1, providers: { claude: { model: "configured", effort: "high", fallback: "other" } } }));
    assert.throws(() => providerBinding("claude", { config }), /only model/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
