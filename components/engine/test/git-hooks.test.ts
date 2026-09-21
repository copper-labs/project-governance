import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GIT_HOOKS, gitHookLauncher, hookCheckArguments } from "../src/git-hooks.ts";

const git = (root: string, args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

test("thin hooks preserve literal Git arguments and runtime exit status", () => {
  const root = mkdtempSync(join(tmpdir(), "engine-hooks-"));
  try {
    mkdirSync(join(root, ".governance/runtime/bin"), { recursive: true });
    const runtime = join(root, ".governance/runtime/bin/project-governance");
    writeFileSync(runtime, '#!/bin/sh\nprintf "%s\\n" "$@" > args.txt\nexit 7\n', { mode: 0o700 });
    for (const hook of GIT_HOOKS) {
      const path = join(root, hook); writeFileSync(path, gitHookLauncher(hook), { mode: 0o700 });
      const args = ["literal space '$()", "--not-an-option"];
      assert.equal(spawnSync(path, args, { cwd: root }).status, 7);
      assert.equal(readFileSync(join(root, "args.txt"), "utf8"), ["hook", hook, ...args, ""].join("\n"));
    }
    rmSync(runtime);
    const unavailable = spawnSync(join(root, "pre-commit"), [], { cwd: root, encoding: "utf8" });
    assert.equal(unavailable.status, 1); assert.match(unavailable.stderr, /Restore the pinned installation/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("hook scopes preserve staged checks, commit input and isolated pre-PR selection", () => {
  assert.deepEqual(hookCheckArguments(".", "pre-commit", []), ["--summary", "--stage", "pre-commit", "--mode", "impacted", "--staged"]);
  assert.equal(hookCheckArguments(".", "commit-msg", ["message with spaces"]).at(-1), "message with spaces");
  assert.deepEqual(hookCheckArguments(".", "pre-push", ["origin", "ssh://example.invalid/repo"]), hookCheckArguments(".", "pre-push", []));
  const args = hookCheckArguments(".", "pre-pr", ["--pr-title", "Useful outcome", "--pr-body-file", "body.md"], {});
  assert.deepEqual(args, ["--summary", "--pack", "pr-description", "--stage", "pre-pr", "--mode", "all", "--pr-body-file", "body.md", "--pr-title", "Useful outcome"]);
  assert.throws(() => hookCheckArguments(".", "pre-pr", ["--pr-title", "Partial"], {}));
  assert.throws(() => hookCheckArguments(".", "pre-commit", ["--mode", "all"]));
  assert.throws(() => hookCheckArguments(".", "commit-msg", []));
  assert.throws(() => hookCheckArguments(".", "update", []));
});

test("pre-PR drafts remain worktree-local with explicit and provider overrides", () => {
  const root = mkdtempSync(join(tmpdir(), "engine-hook-drafts-"));
  const primary = join(root, "primary"), linked = join(root, "linked");
  try {
    mkdirSync(primary); git(primary, ["init", "-q"]);
    git(primary, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "Initial"]);
    git(primary, ["worktree", "add", "--detach", linked, "HEAD"]);
    for (const [workspace, title] of [[primary, "Primary draft"], [linked, "Linked draft"]] as const) {
      const titlePath = git(workspace, ["rev-parse", "--path-format=absolute", "--git-path", "PR_TITLE"]);
      writeFileSync(titlePath, title);
      const args = hookCheckArguments(workspace, "pre-pr", [], {});
      assert.equal(args.at(-1), title);
      assert.equal(args.at(-3), git(workspace, ["rev-parse", "--path-format=absolute", "--git-path", "PR_DESCRIPTION.md"]));
    }
    assert.equal(hookCheckArguments(linked, "pre-pr", [], { PROJECT_GOVERNANCE_PR_TITLE: "Provider title", PROJECT_GOVERNANCE_PR_BODY_FILE: "provider.md" }).at(-1), "Provider title");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
