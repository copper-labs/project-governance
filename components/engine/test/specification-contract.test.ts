import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ValidationSubject, resolveChangeScope } from "../src/change-subject.ts";
import { parseSpecificationDeclaration, safeSpecificationPath, specificationDefinitionDigest, validateSpecificationReferences, type SpecificationReferences } from "../src/specification-contract.ts";

const path = "docs/spec.md";
const criteria = [
  { id: "R1", claim: "Reject invalid inputs before execution.", verification: "mechanical" },
  { id: "R2", claim: "The explanation describes the retained authority.", verification: "semantic" },
];
const document = (entries: unknown = criteria) => `---\nid: spec.fixture\ntype: spec\n---\n\n# Fixture\n\nReadable rationale.\n\n\`\`\`governance-spec\n${JSON.stringify({ version: 1, criteria: entries }, null, 2)}\n\`\`\`\n`;
const digest = (source: string) => `sha256:${createHash("sha256").update(source).digest("hex")}`;
function declaration(source = document()): SpecificationReferences {
  return { specifications: [{ path, digest: digest(source), criteria: ["R1", "R2"] }], batches: [
    { id: "B1", items: [{ id: "I1", criteria: [{ path, id: "R1" }, { path, id: "R2" }] }, { id: "V1", criteria: [{ path, id: "R1" }] }] },
  ] };
}
function repository(source = document()) {
  const root = mkdtempSync(join(tmpdir(), "engine-specification-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q"); git("config", "user.email", "fixture@example.invalid"); git("config", "user.name", "Fixture");
  mkdirSync(join(root, "docs")); writeFileSync(join(root, path), source);
  writeFileSync(join(root, "docs/legacy.md"), "# Legacy\n\nAn untouched specification without typed criteria.\n");
  git("add", "."); git("commit", "-qm", "specification fixture");
  return { root, git, subject: () => new ValidationSubject(root, resolveChangeScope(root, { staged: true })),
    close: () => rmSync(root, { recursive: true, force: true }) };
}

test("typed specification parsing preserves claims and leaves unstructured documents exempt", () => {
  assert.deepEqual(parseSpecificationDeclaration(document()), { version: 1, criteria });
  assert.equal(parseSpecificationDeclaration("# Existing specification\n\nNo automatic conversion.\n"), null);
  assert.equal(parseSpecificationDeclaration("````markdown\n```governance-spec\ninvalid example\n```\n````\n"), null);
  assert.deepEqual(parseSpecificationDeclaration(document().replaceAll("```", "~~~").replaceAll("\n", "\r\n")), { version: 1, criteria });
});

test("specification references name only safe Markdown documents under docs", () => {
  assert.equal(safeSpecificationPath("docs/design/behavior.md"), "docs/design/behavior.md");
  for (const target of ["code.ts", ".git/config", "docs/.git/config.md", "docs/.codex/state.md", "docs/spec.json", "docs/../spec.md", "docs//spec.md"])
    assert.throws(() => safeSpecificationPath(target));
});

test("malformed or conflicting specification declarations cannot become valid empty coverage", () => {
  for (const source of [
    document([...criteria, criteria[0]]), document([]), document([{ ...criteria[0], id: "bad id" }]),
    document([{ ...criteria[0], claim: " " }]), document([{ ...criteria[0], verification: ["mechanical"] }]),
    document([{ ...criteria[0], completed: true }]), document().replace('"version": 1', '"version": 2'),
    document().replace('"version": 1', '"version": 2, "version": 1'), document().replace('"id": "R1"', '"id": "other", "id": "R1"'),
    document() + document(), document().replace("```governance-spec", "```governance-spec extra"),
    document().replace(/```\n$/u, ""), "```governance-spec\ninvalid JSON\n```\n",
  ]) assert.throws(() => parseSpecificationDeclaration(source));
  assert.throws(() => parseSpecificationDeclaration(Buffer.from([0xff])), /encoded data|encoding/u);
});

test("all declared criteria resolve and map while repeated mapping on distinct items remains valid", () => {
  const fixture = repository();
  try {
    assert.deepEqual(validateSpecificationReferences(fixture.subject(), declaration()), []);
    assert.deepEqual(validateSpecificationReferences(fixture.subject(), { specifications: [], batches: [] }), []);
    assert.deepEqual(validateSpecificationReferences(fixture.subject(), { specifications: [], batches: [{ id: "B1", items: [{ id: "I1" }] }] }), []);
  } finally { fixture.close(); }
});

test("scope and item mistakes retain stable findings for missing, duplicate and unbound references", () => {
  const fixture = repository();
  try {
    const plan: SpecificationReferences = { specifications: [
      { path, digest: digest(document()), criteria: ["R1", "R1", "R2", "R404"] },
      { path, digest: digest(document()), criteria: ["R1"] },
    ], batches: [{ id: "B1", items: [{ id: "I1", criteria: [
      { path, id: "R1" }, { path, id: "R1" }, { path, id: "missing" }, { path: "docs/other.md", id: "R1" },
    ] }] }] };
    const findings = validateSpecificationReferences(fixture.subject(), plan);
    assert.deepEqual(findings.map(finding => finding.rule_id), [
      "specification.scope-duplicate", "specification.criterion-unresolved", "specification.reference-duplicate",
      "specification.criterion-reference-duplicate", "specification.criterion-unresolved", "specification.reference-undeclared",
      "specification.criterion-uncovered", "specification.criterion-uncovered",
    ]);
    const duplicate = findings.find(finding => finding.rule_id === "specification.criterion-reference-duplicate")!;
    assert.equal(duplicate["batch_id"], "B1"); assert.equal(duplicate["item_id"], "I1"); assert.equal(duplicate["criterion_id"], "R1");
    assert.ok(findings.every(finding => finding.severity === "blocking"));
  } finally { fixture.close(); }
});

test("a resolvable criterion outside declared scope cannot broaden the plan's bound requirements", () => {
  const fixture = repository();
  try {
    const plan = declaration(); plan.specifications = [{ path, digest: digest(document()), criteria: ["R1"] }];
    const findings = validateSpecificationReferences(fixture.subject(), plan);
    assert.deepEqual(findings.map(finding => finding.rule_id), ["specification.criterion-out-of-scope"]);
  } finally { fixture.close(); }
});

test("whole-spec digest invalidates changed prose and changed claims even when IDs are retained", () => {
  const fixture = repository();
  try {
    for (const changed of [document().replace("Readable rationale.", "Changed rationale."), document([{ ...criteria[0], claim: "Run a different behavior." }, criteria[1]])]) {
      writeFileSync(join(fixture.root, path), changed); fixture.git("add", path);
      const findings = validateSpecificationReferences(fixture.subject(), declaration());
      assert.deepEqual(findings.map(finding => finding.rule_id), ["specification.digest-mismatch"]);
      assert.equal(findings[0]!["actual_digest"], digest(changed));
    }
    const malformed = declaration(); malformed.specifications = [{ path, digest: "not-a-digest", criteria: ["R1"] }];
    assert.ok(validateSpecificationReferences(fixture.subject(), malformed).some(finding => finding.rule_id === "specification.digest-invalid"));
  } finally { fixture.close(); }
});

test("captured specification notes may change while its original requirement binding remains exact", () => {
  const notes = "<!-- governance:notes progress -->\nImplementation ready; verification pending.\n<!-- /governance:notes progress -->\n";
  const original = document() + notes, fixture = repository(original);
  try {
    const bound = declaration(original); bound.specifications[0]!.digest = specificationDefinitionDigest(original);
    const changed = original.replace("Implementation ready; verification pending.", "Original narrow checks passed; acceptance unknown.");
    writeFileSync(join(fixture.root, path), changed); fixture.git("add", path);
    assert.deepEqual(validateSpecificationReferences(fixture.subject(), bound), []);
    writeFileSync(join(fixture.root, path), changed.replace("Readable rationale.", "Change the required behavior.")); fixture.git("add", path);
    assert.ok(validateSpecificationReferences(fixture.subject(), bound).some(finding => finding.rule_id === "specification.digest-mismatch"));
  } finally { fixture.close(); }
});

test("spec validation uses captured staged bytes despite opposing checkout and later index content", () => {
  const fixture = repository();
  try {
    const staged = document().replace("Readable rationale.", "Staged rationale.");
    writeFileSync(join(fixture.root, path), staged); fixture.git("add", path);
    const subject = fixture.subject();
    writeFileSync(join(fixture.root, path), document([{ id: "R404", claim: "Dirty checkout only.", verification: "mechanical" }])); fixture.git("add", path);
    assert.deepEqual(validateSpecificationReferences(subject, declaration(staged)), []);
    assert.ok(validateSpecificationReferences(fixture.subject(), declaration(staged)).some(finding => finding.rule_id === "specification.digest-mismatch"));
  } finally { fixture.close(); }
});

test("unsafe, absent, symlink and explicitly unstructured spec references fail closed", () => {
  const fixture = repository();
  try {
    symlinkSync("spec.md", join(fixture.root, "docs/link.md")); fixture.git("add", "docs/link.md");
    const subject = fixture.subject();
    for (const [target, expected] of [
      ["../outside.md", "specification.path-unsafe"], ["/outside.md", "specification.path-unsafe"],
      ["docs/missing.md", "specification.source-unavailable"], ["docs/link.md", "specification.source-unavailable"],
      ["docs", "specification.path-unsafe"], ["docs/legacy.md", "specification.declaration-missing"],
    ]) {
      const plan: SpecificationReferences = { specifications: [{ path: target!, digest: digest(document()), criteria: ["R1"] }], batches: [
        { id: "B1", items: [{ id: "I1", criteria: [{ path: target!, id: "R1" }] }] },
      ] };
      assert.ok(validateSpecificationReferences(subject, plan).some(finding => finding.rule_id === expected), target);
    }
    const malformed = document([criteria[0], criteria[0]]);
    writeFileSync(join(fixture.root, path), malformed); fixture.git("add", path);
    assert.ok(validateSpecificationReferences(fixture.subject(), declaration(malformed)).some(finding => finding.rule_id === "specification.declaration-invalid"));
  } finally { fixture.close(); }
});

test("worktree drift after capture cannot substitute newer spec bytes", () => {
  const fixture = repository();
  try {
    const scope = resolveChangeScope(fixture.root, { baseRef: "HEAD", paths: [path] }), subject = new ValidationSubject(fixture.root, scope);
    writeFileSync(join(fixture.root, path), document().replace("Readable rationale.", "Later edit."));
    assert.ok(validateSpecificationReferences(subject, declaration()).some(finding => finding.rule_id === "specification.source-unavailable"));
  } finally { fixture.close(); }
});

test("a docs path alias cannot traverse a symlink during live-subject validation", () => {
  const fixture = repository();
  try {
    mkdirSync(join(fixture.root, "docs/real")); writeFileSync(join(fixture.root, "docs/real/spec.md"), document());
    symlinkSync("real", join(fixture.root, "docs/alias"));
    const subject = new ValidationSubject(fixture.root, resolveChangeScope(fixture.root, { all: true }));
    const aliased = "docs/alias/spec.md", plan: SpecificationReferences = {
      specifications: [{ path: aliased, digest: digest(document()), criteria: ["R1"] }],
      batches: [{ id: "B1", items: [{ id: "I1", criteria: [{ path: aliased, id: "R1" }] }] }],
    };
    assert.ok(validateSpecificationReferences(subject, plan).some(finding => finding.rule_id === "specification.source-unavailable"));
  } finally { fixture.close(); }
});
