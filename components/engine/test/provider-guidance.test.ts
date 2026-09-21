import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { providerGuidance, COMPILED_HOST_BLOCK } from "../src/provider-guidance.ts";
import { installHostInstructions } from "../src/host-instruction-installation.ts";

test("compiled host entries install one thin route to the canonical packaged provider contract", () => {
  const assetRoot = fileURLToPath(new URL("../../../src/project_governance_runtime/assets/skills/resources/", import.meta.url));
  const guide = providerGuidance(assetRoot);
  assert.ok(guide.includes("provider-submit")); assert.ok(guide.includes("provider-follow-up"));
  assert.ok(guide.includes("--completion-executable"));
  assert.ok(guide.includes("consumption remains unknown"));
  const root = mkdtempSync(join(tmpdir(), "provider-guidance-"));
  try {
    assert.equal(installHostInstructions(root, COMPILED_HOST_BLOCK).state, "installed");
    for (const name of ["AGENTS.md", "CLAUDE.md", "GEMINI.md"]) {
      const content = readFileSync(join(root, name), "utf8");
      assert.ok(content.includes("project-governance provider-help"));
      assert.ok(content.includes("required test-execution guidance"));
      assert.equal(content.includes("bin/harness-agent"), false);
    }
    assert.equal(installHostInstructions(root, COMPILED_HOST_BLOCK).state, "unchanged");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
