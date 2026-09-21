import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, symlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installGitHooks, planGitHookInstallation } from "../src/git-hook-installation.ts";
import { gitHookLauncher } from "../src/git-hooks.ts";
const git = (root: string, args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
function fixture() { const root = mkdtempSync(join(tmpdir(), "hook-install-")); git(root, ["init", "-q"]); return root; }

test("hook installation repairs owned modes, reconnects and executes through Git", () => {
  const root = fixture();
  try {
    const initial = installGitHooks(root, { configure: true });
    assert.equal(initial.changed.length, 4); assert.equal(initial.configured, true);
    assert.deepEqual(installGitHooks(root, { configure: true }).changed, []);
    chmodSync(join(root, ".githooks/pre-commit"), 0o644);
    assert.deepEqual(installGitHooks(root).changed, ["pre-commit"]);
    mkdirSync(join(root, ".governance/runtime/bin"), { recursive: true });
    writeFileSync(join(root, ".governance/runtime/bin/project-governance"), '#!/bin/sh\nprintf "%s\\n" "$@" > invoked.txt\n', { mode: 0o755 });
    git(root, ["hook", "run", "pre-commit"]);
    assert.equal(readFileSync(join(root, "invoked.txt"), "utf8"), "hook\npre-commit\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("custom hook files, native hooks and configured directories are preserved before mutation", () => {
  const root = fixture();
  try {
    writeFileSync(join(root, ".git/hooks/post-commit"), "authored hook");
    assert.equal(planGitHookInstallation(root).ready, false);
    assert.throws(() => installGitHooks(root, { configure: true }), /no hooks changed/);
    assert.equal(existsSync(join(root, ".githooks")), false);
    rmSync(join(root, ".git/hooks/post-commit"));
    git(root, ["config", "core.hooksPath", "custom-hooks"]);
    assert.throws(() => installGitHooks(root), /no hooks changed/);
    assert.equal(git(root, ["config", "core.hooksPath"]), "custom-hooks");
    git(root, ["config", "--unset", "core.hooksPath"]);
    mkdirSync(join(root, ".githooks")); writeFileSync(join(root, ".githooks/pre-pr"), "authored hook");
    assert.throws(() => installGitHooks(root), /no hooks changed/);
    assert.equal(existsSync(join(root, ".githooks/pre-commit")), false);
    assert.equal(readFileSync(join(root, ".githooks/pre-pr"), "utf8"), "authored hook");
    const migrated = installGitHooks(root, { previous: { "pre-pr": "authored hook" } });
    assert.equal(migrated.changed.length, 4);
    assert.equal(readFileSync(join(root, ".githooks/pre-pr"), "utf8"), gitHookLauncher("pre-pr"));
    assert.equal(migrated.configured, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("hook installation refuses symlink directories and hook destinations", () => {
  const root = fixture();
  try {
    mkdirSync(join(root, "outside")); symlinkSync("outside", join(root, ".githooks"));
    assert.throws(() => installGitHooks(root), /ordinary project directory/);
    rmSync(join(root, ".githooks")); mkdirSync(join(root, ".githooks"));
    writeFileSync(join(root, "outside/pre-pr"), "preserved");
    symlinkSync("../outside/pre-pr", join(root, ".githooks/pre-pr"));
    assert.throws(() => installGitHooks(root), /no hooks changed/);
    assert.equal(readFileSync(join(root, "outside/pre-pr"), "utf8"), "preserved");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("linked worktree configuration does not silently change sibling hook admission", () => {
  const root = fixture(), linked = `${root}-linked`;
  try {
    git(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "Initial"]);
    git(root, ["worktree", "add", "--detach", linked, "HEAD"]);
    assert.throws(() => installGitHooks(linked, { configure: true }), /worktree-local/);
    assert.equal(existsSync(join(linked, ".githooks")), false);
    git(root, ["config", "extensions.worktreeConfig", "true"]);
    assert.equal(installGitHooks(linked, { configure: true }).configured, true);
    assert.equal(planGitHookInstallation(root).hooksPath, null);
  } finally { rmSync(linked, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); }
});
