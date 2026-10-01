import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ValidationSubject, resolveChangeScope } from "../src/change-subject.ts";
import { documentLinkIssues } from "../src/checkers/document-links.ts";
import { checkDocumentation } from "../src/documentation.ts";

test("documentation targets come from captured graph rather than unrelated working-tree additions", () => {
  const root = mkdtempSync(join(tmpdir(), "document-links-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  try {
    git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
    writeFileSync(join(root, "README.md"), "Start\n"); git("add", "."); git("commit", "-qm", "base");
    writeFileSync(join(root, "README.md"), "[missing](target.md)\n[outside](../private.md)\n"); git("add", ".");
    const scope = resolveChangeScope(root, { staged: true });
    writeFileSync(join(root, "target.md"), "Later untracked content\n");
    const issues = documentLinkIssues(new ValidationSubject(root, scope), scope);
    assert.equal(issues.length, 2); assert.ok(issues.some(issue => issue.includes("does not exist"))); assert.ok(issues.some(issue => issue.includes("escapes")));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

const authored = (id: string, body = "Body\n", status = "current", type = "guide") =>
  `---\nid: ${id}\ntitle: Example\ntype: ${type}\nstatus: ${status}\nowner: team\ncreated: 2026-10-01\nupdated: 2026-10-01\nsummary: Example document\n---\n${body}`;
function fixture(run: (root: string, write: (path: string, source: string) => void, git: (...args: string[]) => Buffer) => void) {
  const root = mkdtempSync(join(tmpdir(), "documentation-evidence-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  const write = (path: string, source: string) => {
    mkdirSync(join(root, path, ".."), { recursive: true }); writeFileSync(join(root, path), source);
  };
  try {
    git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
    run(root, write, git);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
const issues = (root: string, staged = false) => {
  const scope = resolveChangeScope(root, staged ? { staged: true } : { all: true });
  return documentLinkIssues(new ValidationSubject(root, scope), scope);
};

test("whole and staged checks preserve raw evidence and frozen copies without duplicate identities", () => fixture((root, write, git) => {
  write("docs/design.md", authored("design", "Design\n", "proposal"));
  const snapshot = authored("design", "[original target](../missing.md)\n", "old-source-state");
  const copy = "docs/implementation/evidence/review/after/docs/index.md";
  write(copy, snapshot);
  write("docs/implementation/evidence/review/before/README.md", "[original](./missing.md)\n");
  write("docs/implementation/evidence/review/reviewer-output.md", "[raw reference](missing.md)\n");
  write("docs/research/evidence/raw.md", "Unmodified source quotation.\n");
  write("docs/implementation/evidence/review/README.md", authored("review", "[report](reviewer-output.md)\n"));
  assert.deepEqual(issues(root), []);
  git("add", "."); assert.deepEqual(issues(root, true), []);
  assert.equal(readFileSync(join(root, copy), "utf8"), snapshot);
}));

test("live evidence summaries and ordinary guides still reject missing metadata, links and escapes", () => fixture((root, write) => {
  write("docs/evidence/run/README.md", "Summary without metadata.\n");
  write("docs/research/evidence/index.md", authored("research", "[missing](absent.md)\n"));
  write("docs/guides/before/guide.md", authored("guide", "[unsafe](../../../../private.md)\n"));
  const found = issues(root);
  assert.ok(found.some(issue => issue.startsWith("docs/evidence/run/README.md:") && issue.includes("missing YAML")));
  assert.ok(found.some(issue => issue.startsWith("docs/research/evidence/index.md:") && issue.includes("does not exist")));
  assert.ok(found.some(issue => issue.startsWith("docs/guides/before/guide.md:") && issue.includes("escapes")));
}));

test("catalog references and guides override artifact storage while raw sources stay unchanged", () => fixture((root, write, git) => {
  write("config/governance/profile.yaml", "documentation: {enabled: true, root: docs/evidence/developer}\n");
  write("docs/evidence/developer/index.md", authored("developer"));
  write("docs/evidence/developer/catalog.yaml", "version: 1\ncapabilities:\n  - id: sample\n    title: Sample\n    reference: docs/evidence/contract.md\n    guides: [docs/evidence/after/guide.md]\n    sources: [docs/evidence/raw.md]\n");
  write("docs/evidence/contract.md", authored("contract", "[missing](absent.md)\n"));
  write("docs/evidence/after/guide.md", authored("guide", "[outside](../../../../private.md)\n"));
  write("docs/evidence/raw.md", "[original target](absent.md)\n");
  const assertDeclared = (found: string[]) => {
    assert.equal(found.length, 2);
    assert.ok(found.some(issue => issue.startsWith("docs/evidence/contract.md:") && issue.includes("does not exist")));
    assert.ok(found.some(issue => issue.startsWith("docs/evidence/after/guide.md:") && issue.includes("escapes")));
  };
  assertDeclared(issues(root)); git("add", "."); assertDeclared(issues(root, true));
}));

test("active plans and live duplicate document ids cannot hide in an evidence namespace", () => fixture((root, write) => {
  write("docs/design.md", authored("duplicate"));
  write("docs/evidence/run/README.md", authored("duplicate"));
  write("docs/exec-plans/README.md", authored("plans", "[plan](active/evidence/plan.md)\n"));
  write("docs/exec-plans/active/evidence/plan.md", authored("plan", "Plan\n", "accepted", "exec-plan"));
  const found = issues(root);
  assert.ok(found.includes("docs/evidence/run/README.md: duplicate frontmatter id duplicate also used by docs/design.md"));
  assert.ok(found.some(issue => issue.includes("active execution plan status must be active")));
}));

test("invalid catalogs block before artifact-located guides can be identified and repaired", () => fixture((root, write, git) => {
  write("config/governance/profile.yaml", "documentation: {enabled: true, root: docs/developer}\n");
  write("docs/developer/index.md", authored("developer"));
  write("docs/developer/catalog.yaml", "version: 1\ncapabilities: [\n");
  write("docs/evidence/guide.md", authored("guide", "[missing](missing.md)\n"));
  write("docs/evidence/raw.md", "[original target](missing.md)\n");
  git("add", ".");
  for (const options of [{ all: true }, { staged: true }]) {
    const scope = resolveChangeScope(root, options);
    const result = checkDocumentation(new ValidationSubject(root, scope), scope);
    assert.equal(result.status, "failed");
    assert.ok(result.findings.some(finding => finding.severity === "blocking" && typeof finding.message === "string" && finding.message.startsWith("Documentation profile or catalog is invalid")));
    assert.ok(!result.findings.some(finding => typeof finding.message === "string" && finding.message.startsWith("docs/evidence/")));
  }
  write("docs/developer/catalog.yaml", "version: 1\ncapabilities:\n  - id: guide\n    title: Guide\n    reference: docs/evidence/guide.md\n    sources: [docs/evidence/raw.md]\n");
  git("add", "docs/developer/catalog.yaml");
  for (const options of [{ all: true }, { staged: true }]) {
    const scope = resolveChangeScope(root, options);
    const result = checkDocumentation(new ValidationSubject(root, scope), scope);
    assert.equal(result.status, "failed");
    assert.deepEqual(result.findings.map(finding => finding.message), ["docs/evidence/guide.md: link target does not exist: missing.md"]);
  }
}));

test("a separately staged evidence guide uses the captured catalog despite an unstaged removal", () => fixture((root, write, git) => {
  write("config/governance/profile.yaml", "documentation: {enabled: true, root: docs/developer}\n");
  write("docs/developer/index.md", authored("developer"));
  write("docs/developer/catalog.yaml", "version: 1\ncapabilities:\n  - id: guide\n    title: Guide\n    reference: docs/developer/index.md\n    guides: [docs/evidence/guide.md]\n");
  write("docs/evidence/guide.md", authored("guide"));
  git("add", "."); git("commit", "-qm", "base");
  write("docs/evidence/guide.md", authored("guide", "[missing](missing.md)\n"));
  git("add", "docs/evidence/guide.md");
  write("docs/developer/catalog.yaml", "version: 1\ncapabilities: []\n");
  const scope = resolveChangeScope(root, { staged: true });
  assert.deepEqual(scope.records.map(record => record.path), ["docs/evidence/guide.md"]);
  assert.deepEqual(documentLinkIssues(new ValidationSubject(root, scope), scope), ["docs/evidence/guide.md: link target does not exist: missing.md"]);
}));
