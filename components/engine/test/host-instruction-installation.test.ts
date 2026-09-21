import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, symlinkSync, lstatSync, chmodSync, linkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installHostInstructions } from "../src/host-instruction-installation.ts";
const block = (text: string) => `<!-- harness-delegation:start -->\n${text}\n<!-- harness-delegation:end -->`;

test("host installation preserves authored text, safe aliases, modes and empty overrides with idempotent readback", () => {
  const root = mkdtempSync(join(tmpdir(), "host-install-"));
  try {
    writeFileSync(join(root, "AGENTS.md"), "Authored instructions.\n"); chmodSync(join(root, "AGENTS.md"), 0o640);
    symlinkSync("AGENTS.md", join(root, "CLAUDE.md"));
    writeFileSync(join(root, "AGENTS.override.md"), "");
    const preview = installHostInstructions(root, block("Use the installed runtime."), { dryRun: true });
    assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), "Authored instructions.\n");
    const result = installHostInstructions(root, block("Use the installed runtime."), { expectedPlanDigest: preview.planDigest });
    assert.equal(result.state, "installed"); assert.deepEqual(result.changed, ["AGENTS.md", "GEMINI.md"]);
    assert.equal(lstatSync(join(root, "CLAUDE.md")).isSymbolicLink(), true);
    assert.equal(lstatSync(join(root, "AGENTS.md")).mode & 0o777, 0o640);
    assert.ok(readFileSync(join(root, "AGENTS.md"), "utf8").endsWith("Authored instructions.\n"));
    assert.equal(readFileSync(join(root, "AGENTS.override.md"), "utf8"), "");
    assert.equal(installHostInstructions(root, block("Use the installed runtime.")).state, "unchanged");
    const stale = installHostInstructions(root, block("Updated route."), { dryRun: true });
    writeFileSync(join(root, "AGENTS.md"), "Concurrent authored change\n");
    assert.throws(() => installHostInstructions(root, block("Updated route."), { expectedPlanDigest: stale.planDigest }), /plan changed/);
    assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), "Concurrent authored change\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("hard-linked authored files are refused before any instruction write", () => {
  const root = mkdtempSync(join(tmpdir(), "host-hardlink-"));
  try {
    writeFileSync(join(root, "AGENTS.md"), "original"); linkSync(join(root, "AGENTS.md"), join(root, "alias.md"));
    assert.throws(() => installHostInstructions(root, block("managed")), /hard links/);
    assert.equal(readFileSync(join(root, "alias.md"), "utf8"), "original");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
