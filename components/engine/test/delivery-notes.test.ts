import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizedDeliveryNotes } from "../src/delivery-notes.ts";
import { normalizedPlanContent, parseImplementationPlan, planBytesDigest } from "../src/implementation-plan.ts";
import { specificationDefinitionDigest, parseSpecificationDeclaration } from "../src/specification-contract.ts";
import { template, path, replaceDeclaration } from "./fixtures/plan-progress.ts";
import { fixture } from "./fixtures/plan-progress.ts";
import { implementationPlanCommand } from "../src/implementation-plan-command.ts";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const notes = "<!-- governance:notes progress -->\nCurrent/next: qualify the owned batch.\n<!-- /governance:notes progress -->\n";
const specification = '# Requirement\n\nPreserve cleanup.\n\n```governance-spec\n{"version":1,"criteria":[{"id":"R1","claim":"Preserve cleanup","verification":"mechanical"}]}\n```\n';

test("explicit progress commentary preserves plan definition while exact bytes still change", () => {
  const original = template().replace("Current/next: original.\n", notes);
  const revised = original.replace("qualify the owned batch", "complete: report the original check; do not rerun it");
  assert.equal(normalizedPlanContent(parseImplementationPlan(path, original)), normalizedPlanContent(parseImplementationPlan(path, revised)));
  assert.notEqual(planBytesDigest(original), planBytesDigest(revised));
  for (const changed of [original.replace("Keep this exact prose.", "Change the cleanup requirement."),
    replaceDeclaration(original, declaration => { declaration.batches[0]!.items[1]!.check!.packs = ["another-check"]; }),
    original.replaceAll("notes progress", "notes other")]) {
    assert.notEqual(normalizedPlanContent(parseImplementationPlan(path, original)), normalizedPlanContent(parseImplementationPlan(path, changed)));
  }
});

test("spec commentary preserves definition; rationale, criteria and verification changes do not", () => {
  const original = specification + notes, revised = original.replace("qualify the owned batch", "review the adopted behavior");
  assert.equal(specificationDefinitionDigest(original), specificationDefinitionDigest(revised));
  assert.notEqual(planBytesDigest(original), planBytesDigest(revised));
  for (const changed of [original.replace("Preserve cleanup.", "Permit unconfirmed cleanup."),
    original.replace('"claim":"Preserve cleanup"', '"claim":"Skip cleanup"'),
    original.replace('"verification":"mechanical"', '"verification":"semantic"')]) {
    assert.notEqual(specificationDefinitionDigest(original), specificationDefinitionDigest(changed));
  }
});

test("notes normalize LF and CRLF without touching surrounding bytes or a UTF-8 BOM", () => {
  for (const newline of ["\n", "\r\n"]) {
    const original = ("\ufeff# Requirement\n\n" + notes + "\nOutside.\n").replaceAll("\n", newline);
    const expected = original.replace("Current/next: qualify the owned batch." + newline, "");
    assert.equal(normalizedDeliveryNotes(original), expected);
    for (const prefix of ["\ufeff", "\ufeff```governance-spec\n{}\n```\n"]) {
      const initial = (prefix + notes).replaceAll("\n", newline);
      assert.equal(normalizedDeliveryNotes(initial), initial.replace("Current/next: qualify the owned batch." + newline, ""));
    }
    const literal = ("\ufeff````markdown\n" + notes + "````\n").replaceAll("\n", newline);
    assert.equal(normalizedDeliveryNotes(literal), literal);
    assert.equal(specificationDefinitionDigest(Buffer.from("\ufeff" + specification)), planBytesDigest("\ufeff" + specification));
  }
});

test("fenced note examples are literal identity-bearing text and never acquire ownership", () => {
  const literal = "````markdown\n" + notes + "````\n";
  assert.equal(normalizedDeliveryNotes(literal), literal);
  assert.equal(normalizedDeliveryNotes("\ufeff" + literal), "\ufeff" + literal);
  assert.notEqual(specificationDefinitionDigest(specification + literal), specificationDefinitionDigest(specification + literal.replace("qualify", "skip")));
  assert.notEqual(specificationDefinitionDigest("\ufeff" + literal), specificationDefinitionDigest("\ufeff" + literal.replace("qualify", "skip")));
  assert.equal(normalizedDeliveryNotes(notes + literal), notes.replace("Current/next: qualify the owned batch.\n", "") + literal);
});

test("malformed, duplicate, nested and mismatched notes fail closed", () => {
  for (const invalid of [notes + notes, notes.replace("/governance:notes progress", "/governance:notes other"),
    notes.replace("<!-- /governance:notes progress -->", ""), notes.replace("Current/next:", "<!-- governance:notes other -->\nCurrent/next:"),
    notes.replace("notes progress -->", "notes progress invalid -->"), "<!-- /governance:notes progress -->\n"]) {
    assert.throws(() => normalizedDeliveryNotes(invalid), /notes/iu);
    assert.throws(() => parseImplementationPlan(path, template() + invalid), /notes/iu);
    assert.throws(() => parseSpecificationDeclaration(specification + invalid), /notes/iu);
  }
});

test("notes cannot conceal a specification, plan declaration or progress slot", () => {
  for (const hidden of [specification, template(), "<!-- governance:item B1.I -->\n- [x] Implementation.\n",
    "<!-- governance:evidence B1.I -->[]<!-- /governance:evidence -->\n"]) {
    assert.throws(() => normalizedDeliveryNotes(notes.replace("Current/next: qualify the owned batch.\n", hidden)), /cannot contain/);
  }
});

test("existing read-only inspector reports exact and definition identities without editing a specification", () => {
  const f = fixture(), specPath = "docs/specs/requirement.md";
  try {
    mkdirSync(join(f.root, "docs/specs")); writeFileSync(join(f.root, specPath), specification + notes);
    const before = readFileSync(join(f.root, specPath)), report = implementationPlanCommand(["inspect", "--specification", specPath], f.root) as { definition_digest: string; observed_file_digest: string };
    assert.equal(report.definition_digest, specificationDefinitionDigest(before));
    assert.equal(report.observed_file_digest, planBytesDigest(before));
    assert.notEqual(report.definition_digest, report.observed_file_digest);
    assert.deepEqual(readFileSync(join(f.root, specPath)), before);
    assert.throws(() => implementationPlanCommand(["update", "--specification", specPath], f.root), /inspection/);
    assert.throws(() => implementationPlanCommand(["inspect", "--specification", specPath, "--path", path], f.root), /inspection/);
    assert.throws(() => implementationPlanCommand(["inspect", "--specification", "../outside.md"], f.root), /path/);
    symlinkSync("requirement.md", join(f.root, "docs/specs/linked.md"));
    assert.throws(() => implementationPlanCommand(["inspect", "--specification", "docs/specs/linked.md"], f.root), /Ordinary specification required/);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});
