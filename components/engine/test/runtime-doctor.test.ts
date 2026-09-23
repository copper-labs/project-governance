import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { runtimeDoctor } from "../src/runtime-doctor.ts";
import { RuntimeGenerations } from "../src/runtime-generations.ts";
import { installHostInstructions } from "../src/host-instruction-installation.ts";
import { COMPILED_HOST_BLOCK } from "../src/provider-guidance.ts";

test("installation doctor reports missing state without creating or migrating it", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "runtime-doctor-")));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    const registry = join(root, "missing.sqlite"), result = runtimeDoctor(root, registry);
    assert.equal(result.status, "failed");
    assert.ok(result.findings.some(finding => finding.id === "installation.registry-unavailable"));
    assert.ok(result.findings.some(finding => finding.id === "installation.host-instructions-drift"));
    assert.match(result.findings.find(finding => finding.id === "installation.host-instructions-drift")!.message,
      /host-instructions --dry-run.*--plan-digest/);
    assert.equal(existsSync(registry), false);
    installHostInstructions(root, COMPILED_HOST_BLOCK);
    assert.equal(runtimeDoctor(root, registry).findings.some(finding => finding.id === "installation.host-instructions-drift"), false);
    writeFileSync(join(root, "CLAUDE.md"), COMPILED_HOST_BLOCK.replace("Before task-specific", "Before substantial") + "\n");
    assert.ok(runtimeDoctor(root, registry).findings.some(finding => finding.id === "installation.host-instructions-drift"));
    const generations = new RuntimeGenerations(registry);
    const maintenance = generations.beginMaintenance("interrupted-updater", 0); generations.close();
    const before = readFileSync(registry);
    const observed = runtimeDoctor(root, registry);
    assert.equal(observed.selection?.maintenance, true);
    assert.ok(observed.findings.some(finding => finding.id === "installation.maintenance"));
    assert.ok(observed.findings.some(finding => finding.id === "installation.no-generation"));
    assert.deepEqual(readFileSync(registry), before);
    const reopened = new RuntimeGenerations(registry);
    try { assert.equal(reopened.state().maintenance?.token, maintenance.token); } finally { reopened.close(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
