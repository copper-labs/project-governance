import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { digest } from "../src/core.ts";
import { claudeCommand } from "../src/claude-command.ts";
import { captureProviderGuard, validateProviderGuard, type ProviderGuard } from "../src/provider-guard.ts";

test("guarded Claude launch freezes content-flag refusal independently of availability fallback", t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "claude-guard-settings-"))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const executable = join(root, "claude.cjs");
  writeFileSync(executable, `#!${process.execPath}\nif(process.argv[2]!=="--version")process.exit(9);console.log("2.1.289 (Claude Code)");\n`, { mode: 0o755 });
  const guard = captureProviderGuard(executable);
  assert.equal(guard.hostVersion, "2.1.289 (Claude Code)");
  assert.equal(guard.settings.switchModelsOnFlag, false); assert.deepEqual(guard.settings.fallbackModel, []);
  assert.equal(guard.settingsDigest, digest(guard.settings)); assert.doesNotThrow(() => validateProviderGuard(guard));
  const argv = claudeCommand({ executable, model: "exact-model", effort: "high", additionalRoots: [], guard });
  assert.deepEqual(JSON.parse(argv[argv.indexOf("--settings") + 1]!), guard.settings);
  assert.equal(argv[argv.indexOf("--model") + 1], "exact-model"); assert.equal(argv.includes("--fallback-model"), false);
  assert.ok(argv.includes("--print")); assert.ok(argv.includes("--restricted")); assert.ok(argv.includes("--safe-mode"));

  const changed = structuredClone(guard.settings) as Record<string, unknown>;
  changed["switchModelsOnFlag"] = true;
  assert.throws(() => validateProviderGuard({ ...guard, settings: changed as unknown as ProviderGuard["settings"], settingsDigest: digest(changed) }), /identity changed/u);
  delete changed["switchModelsOnFlag"];
  assert.throws(() => validateProviderGuard({ ...guard, settings: changed as unknown as ProviderGuard["settings"], settingsDigest: digest(changed) }), /identity changed/u);
});
