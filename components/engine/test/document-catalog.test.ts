import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
import { routeDocumentation } from "../src/documentation.ts";
import { documentationCatalogIssues } from "../src/checkers/document-catalog.ts";

test("documentation catalog validates unique routing ownership and local references", () => {
  const root = mkdtempSync(join(tmpdir(), "document-catalog-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    for (const directory of ["config/governance", "docs/developer"]) mkdirSync(join(root, directory), { recursive: true });
    writeFileSync(join(root, "config/governance/profile.yaml"), "documentation: {enabled: true}\n");
    writeFileSync(join(root, "docs/developer/index.md"), "Entry\n");
    writeFileSync(join(root, "docs/developer/reference.md"), "Reference\n");
    const record = { id: "example", title: "Example", reference: "docs/developer/reference.md", aliases: ["read"], symbols: ["Example.read"] };
    const check = (capabilities: unknown[]) => {
      writeFileSync(join(root, "docs/developer/catalog.yaml"), JSON.stringify({ version: 1, capabilities }));
      const scope = resolveChangeScope(root, { all: true }); return documentationCatalogIssues(new ValidationSubject(root, scope));
    };
    assert.deepEqual(check([record]), []);
    const scope = resolveChangeScope(root, { all: true }), subject = new ValidationSubject(root, scope);
    const route = routeDocumentation(subject, { symbol: "Example.read" });
    assert.equal(route.status, "matched");
    assert.deepEqual("context_paths" in route ? route.context_paths : [], ["docs/developer/reference.md"]);
    assert.equal(routeDocumentation(subject, { capability: "read" }).status, "matched");
    assert.equal(routeDocumentation(subject, { capability: "rea" }).status, "not-found");
    assert.equal(check([record, { ...record, id: "other" }]).length, 2);
    assert.ok(check([{ ...record, reference: "../outside.md" }]).length);
    assert.ok(check([{ ...record, sources: ["missing.ts"] }]).length);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
