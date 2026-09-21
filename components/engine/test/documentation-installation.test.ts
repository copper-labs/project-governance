import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initializeDocumentation } from "../src/documentation-installation.ts";

test("documentation initialization previews, creates neutral files and preserves authored edits on retry", () => {
  const root = mkdtempSync(join(tmpdir(), "docs-install-"));
  try {
    const preview = initializeDocumentation(root, true);
    assert.equal(preview.status, "dry-run"); assert.equal(existsSync(join(root, "docs")), false);
    const installed = initializeDocumentation(root);
    assert.equal(installed.status, "initialized"); assert.deepEqual(installed.created, preview.created);
    assert.equal(readFileSync(join(root, "docs/developer/catalog.yaml"), "utf8"), "version: 1\ncapabilities: []\n");
    writeFileSync(join(root, "docs/developer/index.md"), "authored entry\n");
    assert.equal(initializeDocumentation(root).status, "unchanged");
    assert.equal(readFileSync(join(root, "docs/developer/index.md"), "utf8"), "authored entry\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("documentation preserves profile text, custom roots and explicit opt-out", () => {
  const root = mkdtempSync(join(tmpdir(), "docs-profile-"));
  try {
    mkdirSync(join(root, "config/governance"), { recursive: true });
    const path = join(root, "config/governance/profile.yaml"), original = "# Authored configuration\nschema_version: 1\nproject_extensions: []";
    writeFileSync(path, original);
    assert.deepEqual(initializeDocumentation(root).updated, ["config/governance/profile.yaml"]);
    assert.ok(readFileSync(path, "utf8").startsWith(original + "\n"));
    writeFileSync(path, "documentation: {enabled: false, root: docs/private, research: disabled}\n");
    assert.equal(initializeDocumentation(root).status, "disabled"); assert.equal(existsSync(join(root, "docs/private")), false);
    writeFileSync(path, "documentation: {enabled: true, root: docs/custom, research: disabled}\n");
    const custom = initializeDocumentation(root);
    assert.equal(custom.research, "disabled"); assert.equal(existsSync(join(root, "docs/custom/catalog.yaml")), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("documentation conflicts and unsafe append leave authored content unchanged", () => {
  const root = mkdtempSync(join(tmpdir(), "docs-conflict-"));
  try {
    mkdirSync(join(root, "docs/developer/index.md"), { recursive: true });
    assert.equal(initializeDocumentation(root).status, "failed");
    assert.equal(existsSync(join(root, "config")), false);
    rmSync(join(root, "docs"), { recursive: true });
    mkdirSync(join(root, "outside")); symlinkSync("outside", join(root, "docs"));
    assert.equal(initializeDocumentation(root).status, "failed");
    assert.equal(existsSync(join(root, "outside/developer")), false);
    rmSync(join(root, "docs")); mkdirSync(join(root, "config/governance"), { recursive: true });
    writeFileSync(join(root, "config/governance/profile.yaml"), "{schema_version: 1}\n");
    assert.throws(() => initializeDocumentation(root));
    assert.equal(existsSync(join(root, "docs")), false);
    assert.equal(readFileSync(join(root, "config/governance/profile.yaml"), "utf8"), "{schema_version: 1}\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
