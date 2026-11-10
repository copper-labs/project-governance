import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finalizeCoworkCommit, unrelatedCommitState, type CoworkCommitBinding } from "../src/cowork-commit-binding.ts";

function fixture(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), "cowork-commit-")); t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  return { root, git };
}
test("selected commit proves immutable candidate and preserves unrelated staging", t => {
  const { root, git } = fixture(t);
  writeFileSync(join(root, "chosen.txt"), "before"); writeFileSync(join(root, "other.txt"), "before");
  git("add", "."); git("commit", "-qm", "initial");
  writeFileSync(join(root, "chosen.txt"), "after"); writeFileSync(join(root, "other.txt"), "staged"); git("add", "other.txt");
  const binding: CoworkCommitBinding = { workspace: root, taskId: "task", session: "session", branch: git("symbolic-ref", "HEAD"), parent: git("rev-parse", "HEAD"),
    selected: [{ path: "chosen.txt", mode: "100644", blob: git("hash-object", "--path=chosen.txt", "chosen.txt") }], ...unrelatedCommitState(root, ["chosen.txt"]) };
  git("commit", "--only", "-qm", "selected", "--", "chosen.txt");
  assert.equal(finalizeCoworkCommit(binding).commit, git("rev-parse", "HEAD"));
  git("reset", "-q", "HEAD", "--", "other.txt");
  assert.throws(() => finalizeCoworkCommit(binding), /unrelated-state-changed/u);
});
test("first commit is supported and unexpected selected content is rejected", t => {
  const { root, git } = fixture(t); writeFileSync(join(root, "new.txt"), "new");
  const binding: CoworkCommitBinding = { workspace: root, taskId: "task", session: "session", branch: git("symbolic-ref", "HEAD"), parent: null,
    selected: [{ path: "new.txt", mode: "100644", blob: git("hash-object", "new.txt") }], ...unrelatedCommitState(root, ["new.txt"]) };
  git("add", "--intent-to-add", "new.txt"); git("commit", "--only", "-qm", "first", "--", "new.txt");
  assert.equal(finalizeCoworkCommit(binding).status, "committed");
  assert.throws(() => finalizeCoworkCommit({ ...binding, selected: [{ path: "new.txt", mode: "100644", blob: "0".repeat(40) }] }), /tree-mismatch/u);
});
test("recorded commit tree remains verifiable after later commits", async t => {
  const { originalCoworkCommit, verifyCoworkCommitTree } = await import("../src/cowork-commit-binding.ts");
  const { root, git } = fixture(t); writeFileSync(join(root, "new.txt"), "original");
  const binding: CoworkCommitBinding = { workspace: root, taskId: "task", session: "session", branch: git("symbolic-ref", "HEAD"), parent: null,
    selected: [{ path: "new.txt", mode: "100644", blob: git("hash-object", "new.txt") }], ...unrelatedCommitState(root, ["new.txt"]) };
  git("add", "new.txt"); git("commit", "-qm", "original");
  const receipt = finalizeCoworkCommit(binding);
  writeFileSync(join(root, "later.txt"), "later"); git("add", "later.txt"); git("commit", "-qm", "later");
  assert.equal(originalCoworkCommit(binding), receipt.commit);
  assert.equal(verifyCoworkCommitTree(binding, receipt.commit), receipt.commit);
  assert.throws(() => verifyCoworkCommitTree(binding, git("rev-parse", "HEAD")), /parent-mismatch/u);
});
test("command owner saves commit finalization independently of its terminal receipt", async t => {
  const { submitCommand, waitCommand, commandEnvironment } = await import("../src/process-owner.ts");
  const { readFileSync, unlinkSync, existsSync } = await import("node:fs");
  const { digest } = await import("../src/core.ts");
  const { root, git } = fixture(t); writeFileSync(join(root, "new.txt"), "original");
  const binding: CoworkCommitBinding = { workspace: root, taskId: "task", session: "session", branch: git("symbolic-ref", "HEAD"), parent: null,
    selected: [{ path: "new.txt", mode: "100644", blob: git("hash-object", "new.txt") }], ...unrelatedCommitState(root, ["new.txt"]) };
  git("add", "--intent-to-add", "new.txt");
  // Keep the command evidence outside the worktree whose preservation is being measured.
  const evidence = fixture(t);
  const submitted = submitCommand(join(evidence.root, "job"), { id: "cowork-fixture", commitBinding: binding,
    operation: { argv: ["/usr/bin/git", "commit", "--only", "--file", "-", "--", "new.txt"], cwd: root,
      env: commandEnvironment({}), expectedExitCodes: [0], effect: "local" }, stdin: "Create fixture\n\nVerify durable commit evidence.\n", deadlineMs: 10000, outputLimit: 65536 });
  const observed = await waitCommand(submitted.directory, submitted.requestDigest, 15000);
  assert.equal(observed.receipt?.commitResult?.status, "committed");
  const finalized = JSON.parse(readFileSync(join(submitted.directory, "commit-finalization.json"), "utf8"));
  assert.equal(finalized.requestDigest, submitted.requestDigest); assert.equal(finalized.bindingDigest, digest(binding));
  assert.equal(finalized.result.commit, git("rev-parse", "HEAD"));
  unlinkSync(join(submitted.directory, "result.json"));
  assert.equal(existsSync(join(submitted.directory, "commit-finalization.json")), true);
});

test("clean hook rejection is retryable and reports retained intent-to-add", async t => {
  const { rejectedCoworkCommit } = await import("../src/cowork-commit-binding.ts");
  const { root, git } = fixture(t);
  writeFileSync(join(root, "new.txt"), "candidate");
  const binding: CoworkCommitBinding = { workspace: root, taskId: "task", session: "session", branch: git("symbolic-ref", "HEAD"), parent: null,
    selected: [{ path: "new.txt", mode: "100644", blob: git("hash-object", "new.txt") }], ...unrelatedCommitState(root, ["new.txt"]) };
  git("add", "--intent-to-add", "new.txt");
  assert.deepEqual(rejectedCoworkCommit(binding), { status: "not-committed", intent_to_add: ["new.txt"] });
  git("commit", "--only", "-qm", "first", "--", "new.txt");
  assert.throws(() => rejectedCoworkCommit(binding), /head-changed/u);
});

test("unrelated large files do not prevent selected commit verification", async t => {
  const { truncateSync } = await import("node:fs");
  const { root, git } = fixture(t);
  writeFileSync(join(root, "large.bin"), ""); truncateSync(join(root, "large.bin"), 17 * 1024 * 1024);
  writeFileSync(join(root, "chosen.txt"), "candidate");
  const binding: CoworkCommitBinding = { workspace: root, taskId: "task", session: "session", branch: git("symbolic-ref", "HEAD"), parent: null,
    selected: [{ path: "chosen.txt", mode: "100644", blob: git("hash-object", "chosen.txt") }], ...unrelatedCommitState(root, ["chosen.txt"]) };
  git("add", "--intent-to-add", "chosen.txt"); git("commit", "--only", "-qm", "chosen", "--", "chosen.txt");
  assert.equal(finalizeCoworkCommit(binding).status, "committed");
  writeFileSync(join(root, "large.bin"), "concurrent edit");
  assert.equal(finalizeCoworkCommit(binding).preservation, "worktree-changed-during-commit");
});

test("command owner records actual hook rejection as not committed with original diagnostics", async t => {
  const { submitCommand, waitCommand, commandEnvironment } = await import("../src/process-owner.ts");
  const { readFileSync } = await import("node:fs");
  const { root, git } = fixture(t), evidence = fixture(t);
  writeFileSync(join(root, "new.txt"), "candidate");
  const binding: CoworkCommitBinding = { workspace: root, taskId: "task", session: "session", branch: git("symbolic-ref", "HEAD"), parent: null,
    selected: [{ path: "new.txt", mode: "100644", blob: git("hash-object", "new.txt") }], ...unrelatedCommitState(root, ["new.txt"]) };
  writeFileSync(join(root, ".git/hooks/pre-commit"), "#!/bin/sh\necho 'fixture hook refused candidate' >&2\nexit 1\n", { mode: 0o755 });
  git("add", "--intent-to-add", "new.txt");
  const submitted = submitCommand(join(evidence.root, "job"), { id: "rejected-cowork-fixture", commitBinding: binding,
    operation: { argv: ["/usr/bin/git", "commit", "--only", "--file", "-", "--", "new.txt"], cwd: root,
      env: commandEnvironment({}), expectedExitCodes: [0], effect: "local" }, stdin: "Candidate\n", deadlineMs: 10000, outputLimit: 65536 });
  const observed = await waitCommand(submitted.directory, submitted.requestDigest, 15000);
  assert.equal(observed.receipt?.state, "failed");
  assert.equal(observed.receipt?.cleanup, "confirmed");
  assert.deepEqual(observed.receipt?.commitResult, { status: "not-committed", intent_to_add: ["new.txt"] });
  assert.match(readFileSync(join(submitted.directory, "stderr.log"), "utf8"), /fixture hook refused candidate/u);
  assert.equal(git("for-each-ref", "--format=%(objectname)", binding.branch), "");
});
