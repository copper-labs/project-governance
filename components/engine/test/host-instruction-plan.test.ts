import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, symlinkSync, mkdirSync, rmSync, readFileSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { planHostInstructions } from "../src/host-instruction-plan.ts";
const block = "<!-- harness-delegation:start -->\nShared pointer\n<!-- harness-delegation:end -->";
test("host preflight deduplicates shared local links and preserves inactive overrides", () => {
  const root = mkdtempSync(join(tmpdir(), "host-instructions-"));
  try {
    writeFileSync(join(root, "AGENTS.md"), "Authored\r\n");
    symlinkSync("AGENTS.md", join(root, "CLAUDE.md"));
    writeFileSync(join(root, "AGENTS.override.md"), " \n");
    const plan = planHostInstructions(root, block);
    assert.deepEqual(plan.writes.map(item => item.path), ["AGENTS.md", "GEMINI.md"]);
    assert.equal(plan.entries.find(item => item.name === "AGENTS.override.md")?.active, false);
    assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), "Authored\r\n");
    assert.equal(lstatSync(join(root, "CLAUDE.md")).isSymbolicLink(), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("host preflight rejects escaped, managed and inactive-override aliases before writing", () => {
  for (const target of ["../foreign.md", ".governance/entry.md", "AGENTS.override.md"]) {
    const parent = mkdtempSync(join(tmpdir(), "host-instructions-invalid-")), root = join(parent, "project");
    try {
      mkdirSync(root); writeFileSync(join(parent, "foreign.md"), "outside");
      mkdirSync(join(root, ".governance")); writeFileSync(join(root, ".governance/entry.md"), "managed");
      writeFileSync(join(root, "AGENTS.override.md"), ""); symlinkSync(target, join(root, "AGENTS.md"));
      assert.throws(() => planHostInstructions(root, block), /outside authored|empty override/);
      assert.equal(lstatSync(join(root, "AGENTS.md")).isSymbolicLink(), true);
    } finally { rmSync(parent, { recursive: true, force: true }); }
  }
});
