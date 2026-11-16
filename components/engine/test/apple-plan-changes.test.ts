import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
import { checkAppleDependencies } from "../src/checkers/apple-dependencies.ts";
import { introducedPlanReferences } from "../src/checkers/apple-plan-changes.ts";

const terms = ["cocoapods", "podfile", ".podspec"];
const history = "# Delivery\n\n## History\n\nPrior CocoaPods sync failed.\nNo new dependency is proposed.\n";
const schema = JSON.parse(readFileSync(new URL("../../../src/project_governance_runtime/defaults/schemas/apple-dependency-exception.schema.json", import.meta.url), "utf8"));

test("unrelated progress and metadata edits do not revive retained dependency history", () => {
  const before = "---\nreviewed: 2026-11-15\n---\n\n" + history;
  const after = before.replace("2026-11-15", "2026-11-16") + "\n## Current source\n\nFix private input cancellation.\n";
  assert.equal(introducedPlanReferences(before, after, terms), false);
  assert.equal(introducedPlanReferences(history, history.replaceAll("\n", "\r\n"), terms), false);
});

test("changed adoption intent cannot inherit a reference from the same paragraph", () => {
  const before = "# Work\n\nCocoaPods is an option.\nReject it for this dependency.\n";
  assert.equal(introducedPlanReferences(before, before.replace("Reject", "Use"), terms), true);
});

test("new references in history, quotes, mixed plans and fenced examples remain gated", () => {
  for (const text of ["CocoaPods", "SwiftPM and CocoaPods", "> Create a Podfile", "```ruby\n\n# New .podspec\n```"])
    assert.equal(introducedPlanReferences(history, history + "\n" + text + "\n", terms), true, text);
  assert.equal(introducedPlanReferences(history, history + "\nPrior CocoaPods sync failed.\nNo new dependency is proposed.\n", terms), true);
});

test("moving old text into new heading context cannot authorize a new planning section", () => {
  assert.equal(introducedPlanReferences(history, history.replace("## History", "## Adopt now"), terms), true);
  const before = "Delivery\n========\n\nHistory\n-------\n\nOld Podfile integration.\n";
  assert.equal(introducedPlanReferences(before, before.replace("History", "New adoption"), terms), true);
  const fenced = "# Work\n\n```markdown\n## History\nCocoaPods\n```\n";
  assert.equal(introducedPlanReferences(fenced, fenced + "\n## History\n\nCocoaPods\n", terms), true);
});

function fixture(before = history) {
  const root = mkdtempSync(join(tmpdir(), "apple-plan-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  const path = "docs/exec-plans/active/delivery.md";
  git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  mkdirSync(join(root, "docs/exec-plans/active"), { recursive: true });
  writeFileSync(join(root, path), before); git("add", "."); git("commit", "-qm", "Original plan");
  const stage = (body: string) => { writeFileSync(join(root, path), body); git("add", path); return resolveChangeScope(root, { staged: true }); };
  return { root, path, git, stage };
}

function options() {
  return { policy: { applies: "auto" }, exceptions: { version: 1, owner: "fixture", exceptions: [] as Record<string, unknown>[] },
    schema, workId: "", today: "2026-11-16", stage: "pre-commit" };
}

test("Apple checker uses captured history even when the live plan differs", async () => {
  const f = fixture();
  try {
    const scope = f.stage(history + "\n## Progress\n\nPrivate source checks complete.\n");
    writeFileSync(join(f.root, f.path), history + "\nAdopt CocoaPods now.\n");
    const result = await checkAppleDependencies(new ValidationSubject(f.root, scope), scope, options());
    assert.equal(result.status, "passed", JSON.stringify(result.findings));
    const adoption = f.stage(history + "\nAdopt CocoaPods now.\n");
    writeFileSync(join(f.root, f.path), history);
    const refused = await checkAppleDependencies(new ValidationSubject(f.root, adoption), adoption, options());
    assert.ok(refused.findings.some(item => item.rule_id === "apple.cocoapods-planning-approval"));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("new CocoaPods plan still requires a current approved exception for the actual work", async () => {
  const f = fixture("# Existing SwiftPM plan\n");
  try {
    const scope = f.stage("# Dependency proposal\n\nUse SwiftPM and CocoaPods; add a Podfile.\n");
    const subject = new ValidationSubject(f.root, scope), settings = options();
    settings.workId = "work-1";
    const entry = { work_id: "work-1", products: ["fixture"], path_globs: ["docs/**"], reason: "migration-bridge", rationale: "Bridge the incompatible dependency.",
      status: "approved", operator: "operator", approved_on: "2026-11-15", expires: "2026-11-30", spm_analysis: "Upstream does not provide this interface.",
      compatibility_evidence: ["fixture"], compatibility_tests: ["fixture"], migration_or_deletion_gate: "operator-approved" };
    for (const scenario of [null, { ...entry, status: "pending" }, { ...entry, expires: "2026-11-15" }, { ...entry, work_id: "other" }]) {
      settings.exceptions.exceptions = scenario ? [scenario] : [];
      assert.ok((await checkAppleDependencies(subject, scope, settings)).findings.some(item => item.rule_id === "apple.cocoapods-planning-approval"));
    }
    settings.exceptions.exceptions = [entry];
    assert.equal((await checkAppleDependencies(subject, scope, settings)).status, "passed");
    settings.workId = "";
    assert.ok((await checkAppleDependencies(subject, scope, settings)).findings.some(item => item.rule_id === "apple.cocoapods-planning-approval"));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("unavailable original plan bytes fail closed instead of treating history as unchanged", async () => {
  const f = fixture();
  try {
    const scope = f.stage(history + "\n## Progress\n\nNew source batch.\n");
    const original = scope.records.find(item => item.path === f.path)!.before!.identity;
    rmSync(join(f.root, ".git/objects", original.slice(0, 2), original.slice(2)));
    const result = await checkAppleDependencies(new ValidationSubject(f.root, scope), scope, options());
    assert.ok(result.findings.some(item => item.rule_id === "apple.input-unavailable"));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
