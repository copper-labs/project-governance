import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { resolveChangeScope, ValidationSubject } from "../src/change-subject.ts";
import { loadSubjectPacks } from "../src/pack-configuration.ts";
import { buildPlan } from "../src/planning.ts";
const builtins = fileURLToPath(new URL("../../../src/project_governance_runtime/packs/", import.meta.url));

test("planning retains staged pack ownership despite later worktree edits", () => {
  const root = mkdtempSync(join(tmpdir(), "captured-packs-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
  try {
    git("init", "-q"); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-qm", "Initial");
    mkdirSync(join(root, "config/validation/packs"), { recursive: true });
    const path = join(root, "config/validation/packs/example.yaml");
    const pack = { id: "example", enforcement: "blocking", stages: ["pre-commit"], path_globs: ["*.custom"], commands: [{ argv: ["example"] }] };
    writeFileSync(path, JSON.stringify(pack)); writeFileSync(join(root, "file.custom"), "candidate"); git("add", ".");
    const scope = resolveChangeScope(root, { staged: true });
    writeFileSync(path, JSON.stringify({ ...pack, path_globs: [] }));
    const packs = loadSubjectPacks(new ValidationSubject(root, scope), builtins);
    const plan = buildPlan(packs, { stage: "pre-commit", mode: "impacted", changedPaths: ["file.custom"] });
    assert.equal(plan.status, "ready"); assert.ok(plan.selected_packs.includes("example"));
    const live = resolveChangeScope(root, { all: true });
    assert.equal(buildPlan(loadSubjectPacks(new ValidationSubject(root, live), builtins), { stage: "pre-commit", mode: "impacted", changedPaths: ["file.custom"] }).status, "blocked");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
