import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store/store.ts";
import { resolveSubject, readAtSubject, retrieve, changedPaths } from "../src/ops/retrieval.ts";

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "harness-git-"));
  const g = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
  g("init", "-q");
  g("config", "user.email", "t@example.com");
  g("config", "user.name", "T");
  writeFileSync(join(dir, "a.ts"), "committed\n");
  g("add", "a.ts");
  g("commit", "-q", "-m", "first");
  return dir;
}

test("staged and worktree bytes differ, and the artifact carries the staged ones", () => {
  const dir = repo();
  const g = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
  writeFileSync(join(dir, "a.ts"), "staged\n");
  g("add", "a.ts");
  writeFileSync(join(dir, "a.ts"), "dirty worktree\n"); // diverges after staging

  const subject = resolveSubject(dir, { kind: "staged" });
  assert.ok(!("error" in subject), "the staged subject resolves");
  const read = readAtSubject(dir, subject as never, "a.ts");
  assert.ok(read.ok);
  assert.equal((read as { content: string }).content, "staged\n",
    "the bytes come from the subject, not the dirty worktree");

  const store = new Store(":memory:");
  const r = retrieve(store, dir, subject as never, ["a.ts"], { maxBytes: 1024, usedBytes: 0 });
  assert.equal(r.artifacts.length, 1);
  assert.equal(r.artifacts[0]?.inline, "staged\n");
  assert.match(r.artifacts[0]?.subject ?? "", /^tree:/, "the artifact names its subject");
  store.close();
});

test("a commit subject reads its own bytes, not a later one", () => {
  const dir = repo();
  const g = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
  const first = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
  writeFileSync(join(dir, "a.ts"), "second\n");
  g("commit", "-q", "-am", "second");

  const subject = resolveSubject(dir, { kind: "commit", rev: first });
  const read = readAtSubject(dir, subject as never, "a.ts");
  assert.equal((read as { content: string }).content, "committed\n");
});

test("mandatory context that does not fit returns a blocker, never a silent drop", () => {
  const dir = repo();
  const g = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
  writeFileSync(join(dir, "big.ts"), "x".repeat(4096));
  g("add", "big.ts");
  g("commit", "-q", "-m", "big");

  const store = new Store(":memory:");
  const subject = resolveSubject(dir, { kind: "commit", rev: "HEAD" });
  const r = retrieve(store, dir, subject as never, ["big.ts"], { maxBytes: 100, usedBytes: 0 }, { mandatory: ["big.ts"] });
  assert.ok(r.blocked, "a blocker is returned");
  assert.match(r.blocked ?? "", /mandatory context does not fit/);
  assert.equal(r.artifacts.length, 0);
  store.close();
});

test("optional context that does not fit is deferred and named", () => {
  const dir = repo();
  const g = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
  writeFileSync(join(dir, "big.ts"), "x".repeat(4096));
  g("add", "big.ts");
  g("commit", "-q", "-m", "big");

  const store = new Store(":memory:");
  const subject = resolveSubject(dir, { kind: "commit", rev: "HEAD" });
  const r = retrieve(store, dir, subject as never, ["big.ts"], { maxBytes: 100, usedBytes: 0 });
  assert.equal(r.blocked, null);
  assert.deepEqual(r.deferred, ["big.ts"], "deferred, and named rather than dropped silently");
  store.close();
});

test("the budget binds to the task and does not reset per request", () => {
  const dir = repo();
  const store = new Store(":memory:");
  const subject = resolveSubject(dir, { kind: "commit", rev: "HEAD" });
  // "committed\n" is 10 bytes, so one fits in 15 and a second does not.
  const first = retrieve(store, dir, subject as never, ["a.ts"], { maxBytes: 15, usedBytes: 0 });
  assert.equal(first.artifacts.length, 1);
  const second = retrieve(store, dir, subject as never, ["a.ts"], first.budget);
  assert.equal(second.artifacts.length, 0, "the second request inherits what the first spent");
  assert.deepEqual(second.deferred, ["a.ts"]);
  store.close();
});

test("a path absent at the subject is reported, not silently skipped", () => {
  const dir = repo();
  const store = new Store(":memory:");
  const subject = resolveSubject(dir, { kind: "commit", rev: "HEAD" });
  const r = retrieve(store, dir, subject as never, ["nope.ts"], { maxBytes: 1024, usedBytes: 0 });
  assert.equal(r.artifacts.length, 0);
  assert.equal(r.unavailable[0]?.path, "nope.ts");
  store.close();
});

test("a task with no diff has no changed paths to route by", () => {
  const dir = repo();
  const subject = resolveSubject(dir, { kind: "staged" });
  assert.deepEqual(changedPaths(dir, subject as never), [],
    "a clean checkout yields nothing, which is why the no-diff route exists");
});
