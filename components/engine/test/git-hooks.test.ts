import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { prepareCommand } from "../src/cli.ts";
import { GIT_HOOKS, gitHookLauncher, hookCheckArguments, prePushCheckArguments } from "../src/git-hooks.ts";

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
  assert.throws(() => hookCheckArguments(".", "pre-push", ["origin", "ssh://example.invalid/repo"]), /captured Git ref input/);
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


function pushFixture() {
  const root = mkdtempSync(join(tmpdir(), "engine-push-entry-"));
  const run = (...args: string[]) => git(root, args);
  run("init", "-q"); run("config", "user.name", "Fixture"); run("config", "user.email", "fixture@example.invalid");
  writeFileSync(join(root, "candidate.txt"), "base\n"); run("add", "."); run("commit", "-qm", "base");
  const base = run("rev-parse", "HEAD");
  writeFileSync(join(root, "candidate.txt"), "pushed candidate\n"); run("add", "."); run("commit", "-qm", "candidate");
  const candidate = run("rev-parse", "HEAD");
  writeFileSync(join(root, "candidate.txt"), "later HEAD\n"); run("add", "."); run("commit", "-qm", "later");
  return { root, run, base, candidate, close: () => rmSync(root, { recursive: true, force: true }) };
}
const updateInput = (candidate: string, remote: string) => Readable.from([`refs/heads/topic ${candidate} refs/heads/topic ${remote}\n`]);

test("native pre-push binds Git-supplied commits despite different HEAD, index, worktree and environment", async () => {
  const f = pushFixture();
  try {
    writeFileSync(join(f.root, "candidate.txt"), "staged input\n"); f.run("add", "candidate.txt");
    writeFileSync(join(f.root, "candidate.txt"), "unstaged input\n");
    writeFileSync(join(f.root, "untracked.zip"), "retained artifact");
    const privateRemote = "ssh://private-value@example.invalid/repository";
    const args = await prePushCheckArguments(f.root, ["literal remote '$()", privateRemote], updateInput(f.candidate, f.base), { GOVERNANCE_BASE_REF: "missing-override" });
    assert.deepEqual(args.slice(-4), ["--candidate-ref", f.candidate, "--base-ref", f.base]);
    assert.ok(!JSON.stringify(args).includes(privateRemote));
    const prepared = prepareCommand(args, f.root, fileURLToPath(new URL("../../../src/project_governance_runtime/packs/", import.meta.url)), "check");
    assert.equal(prepared.scope.candidate_ref, f.candidate);
    assert.equal(prepared.scope.records.length, 1);
    assert.equal(prepared.subject.read("candidate.txt").toString(), "pushed candidate\n");
    assert.equal(prepared.subject.source("untracked.zip"), null);
  } finally { f.close(); }
});

test("new-branch and manual pre-push require a configured or upstream comparison commit", async () => {
  const f = pushFixture();
  try {
    const zero = "0".repeat(f.candidate.length);
    await assert.rejects(prePushCheckArguments(f.root, ["origin", "private-location"], updateInput(f.candidate, zero), {}), /unavailable/);
    const configured = await prePushCheckArguments(f.root, ["origin", "private-location"], updateInput(f.candidate, zero), { GOVERNANCE_BASE_REF: f.base });
    assert.deepEqual(configured.slice(-4), ["--candidate-ref", f.candidate, "--base-ref", f.base]);
    const manual = hookCheckArguments(f.root, "pre-push", [], { GOVERNANCE_BASE_REF: f.base });
    assert.deepEqual(manual.slice(-4), ["--candidate-ref", f.run("rev-parse", "HEAD"), "--base-ref", f.base]);
    assert.throws(() => hookCheckArguments(f.root, "pre-push", [], {}), /unavailable/);
    const branch = f.run("symbolic-ref", "--short", "HEAD");
    f.run("update-ref", "refs/remotes/origin/main", f.base);
    f.run("config", "remote.origin.url", "https://example.invalid/fixture");
    f.run("config", "remote.origin.fetch", "+refs/heads/*:refs/remotes/origin/*");
    f.run("config", `branch.${branch}.remote`, "origin"); f.run("config", `branch.${branch}.merge`, "refs/heads/main");
    const upstream = await prePushCheckArguments(f.root, ["origin", "private-location"], updateInput(f.candidate, zero), {});
    assert.deepEqual(upstream.slice(-4), ["--candidate-ref", f.candidate, "--base-ref", f.base]);
  } finally { f.close(); }
});

test("pre-push rejects noncommit endpoints without retaining private remote inputs", async () => {
  const f = pushFixture();
  try {
    const blob = f.run("rev-parse", "HEAD:candidate.txt"), privateRemote = "remote-secret-value";
    for (const [candidate, remote] of [[blob, f.base], [f.candidate, blob]]) {
      await assert.rejects(prePushCheckArguments(f.root, ["origin", privateRemote], updateInput(candidate!, remote!), {}), error => {
        assert.ok(error instanceof Error); assert.match(error.message, /exact commit object/); assert.ok(!error.message.includes(privateRemote)); return true;
      });
    }
    f.run("tag", "-a", "annotated", "-m", "annotation", f.candidate);
    await assert.rejects(prePushCheckArguments(f.root, ["origin", privateRemote], updateInput(f.run("rev-parse", "annotated"), f.base), {}), /exact commit object/);
  } finally { f.close(); }
});

test("candidate CLI selection rejects conflicting or unpinned subjects before capture", () => {
  const oid = "a".repeat(40), builtin = fileURLToPath(new URL("../../../src/project_governance_runtime/packs/", import.meta.url));
  for (const extra of [["--mode", "all"], ["--staged"], ["--changed-path", "candidate.txt"], ["--stage", "commit-msg"]]) {
    assert.throws(() => prepareCommand(["--stage", "pre-push", "--candidate-ref", oid, ...extra], ".", builtin), /cannot combine/);
  }
  for (const candidate of ["HEAD", "a".repeat(7), "0".repeat(40), "A".repeat(40), "--not-a-reference"]) {
    assert.throws(() => prepareCommand(["--stage", "pre-push", "--candidate-ref", candidate], ".", builtin));
  }
});


test("native CLI reads pre-push stdin and rejects unsupported updates before dispatch", () => {
  const f = pushFixture();
  try {
    const privateRemote = "ssh://private-token@example.invalid/fixture";
    const child = spawnSync(process.execPath, [fileURLToPath(new URL("../src/cli.ts", import.meta.url)), "hook", "pre-push", "literal remote '$()", privateRemote], {
      cwd: f.root, encoding: "utf8", timeout: 10000,
      input: `refs/heads/topic ${f.candidate} refs/heads/topic ${f.base}\nrefs/heads/second ${f.candidate} refs/heads/second ${f.base}\n`,
      env: { ...process.env, XDG_STATE_HOME: join(f.root, "state"), GOVERNANCE_BASE_REF: f.base },
    });
    assert.equal(child.status, 2); assert.equal(child.stdout, "");
    assert.equal(JSON.parse(child.stderr).status, "failed");
    assert.ok(!child.stderr.includes(privateRemote));
    assert.ok(!existsSync(join(f.root, "state/project-governance/check-runs")));
  } finally { f.close(); }
});
