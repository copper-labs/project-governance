import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store/store.ts";

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

test("another session working in the same worktree is visible", () => {
  const s = new Store(":memory:");
  s.recordActivity({ session: "thread-1", worktree: "/repo", taskId: null, treeDigest: "tree:a" });
  s.recordActivity({ session: "thread-2", worktree: "/repo", taskId: null, treeDigest: "tree:a" });
  const others = s.activeSessions("/repo", "thread-1", iso(60_000));
  assert.equal(others.length, 1);
  assert.equal(others[0]?.session, "thread-2");
  s.close();
});

test("a session in a different worktree is not reported as sharing this one", () => {
  const s = new Store(":memory:");
  s.recordActivity({ session: "thread-1", worktree: "/repo", taskId: null, treeDigest: null });
  s.recordActivity({ session: "thread-2", worktree: "/other", taskId: null, treeDigest: null });
  assert.equal(s.activeSessions("/repo", "thread-1", iso(60_000)).length, 0);
  s.close();
});

test("a stale session drops out of the active window", () => {
  const s = new Store(":memory:");
  s.recordActivity({ session: "thread-2", worktree: "/repo", taskId: null, treeDigest: null });
  const future = new Date(Date.now() + 60_000).toISOString();
  assert.equal(s.activeSessions("/repo", "thread-1", future).length, 0, "outside the window");
  s.close();
});

test("two jobs touching the same file are flagged as overlapping", () => {
  const s = new Store(":memory:");
  const mine = s.createTask("fix the export", [], { worktree: "/repo", session: "thread-1" });
  const theirs = s.createTask("tidy the export tests", [], { worktree: "/repo", session: "thread-2" });
  s.recordTaskPath(mine.taskId, "src/export.ts", "thread-1");
  s.recordTaskPath(mine.taskId, "src/only-mine.ts", "thread-1");
  s.recordTaskPath(theirs.taskId, "src/export.ts", "thread-2");

  const overlap = s.overlappingPaths(mine.taskId, "/repo", ["thread-2"]);
  assert.equal(overlap.length, 1, "only the shared file");
  assert.equal(overlap[0]?.path, "src/export.ts");
  assert.equal(overlap[0]?.session, "thread-2");
  s.close();
});

test("no overlap is reported when no other session is active", () => {
  const s = new Store(":memory:");
  const mine = s.createTask("a", [], { worktree: "/repo", session: "thread-1" });
  const theirs = s.createTask("b", [], { worktree: "/repo", session: "thread-2" });
  s.recordTaskPath(mine.taskId, "shared.ts", "thread-1");
  s.recordTaskPath(theirs.taskId, "shared.ts", "thread-2");
  assert.deepEqual(s.overlappingPaths(mine.taskId, "/repo", []), [],
    "an idle session's files are not a live collision");
  s.close();
});

test("a job in another worktree does not count as overlap", () => {
  const s = new Store(":memory:");
  const mine = s.createTask("a", [], { worktree: "/repo", session: "thread-1" });
  const elsewhere = s.createTask("b", [], { worktree: "/other", session: "thread-2" });
  s.recordTaskPath(mine.taskId, "shared.ts", "thread-1");
  s.recordTaskPath(elsewhere.taskId, "shared.ts", "thread-2");
  assert.deepEqual(s.overlappingPaths(mine.taskId, "/repo", ["thread-2"]), [],
    "separate worktrees are separate files on disk");
  s.close();
});

test("activity is upserted, not duplicated", () => {
  const s = new Store(":memory:");
  s.recordActivity({ session: "t1", worktree: "/repo", taskId: "a", treeDigest: "tree:1" });
  s.recordActivity({ session: "t1", worktree: "/repo", taskId: "b", treeDigest: "tree:2" });
  const a = s.readActivity("t1", "/repo");
  assert.equal(a?.taskId, "b");
  assert.equal(a?.treeDigest, "tree:2");
  s.close();
});

test("an exploring job does not raise overlap warnings for others", () => {
  const s = new Store(":memory:");
  const implementing = s.createTask("fix the export", [], { worktree: "/repo", session: "t1", mode: "implement" });
  const exploring = s.createTask("work out an approach", [], { worktree: "/repo", session: "t2", mode: "explore" });
  s.recordTaskPath(implementing.taskId, "src/export.ts", "t1");
  s.recordTaskPath(exploring.taskId, "src/export.ts", "t2");

  assert.deepEqual(
    s.overlappingPaths(implementing.taskId, "/repo", ["t2"]),
    [],
    "a job that changes nothing cannot collide with one that does",
  );
  s.close();
});

test("two implementing jobs on one file still overlap", () => {
  const s = new Store(":memory:");
  const a = s.createTask("a", [], { worktree: "/repo", session: "t1", mode: "implement" });
  const b = s.createTask("b", [], { worktree: "/repo", session: "t2", mode: "implement" });
  s.recordTaskPath(a.taskId, "src/export.ts", "t1");
  s.recordTaskPath(b.taskId, "src/export.ts", "t2");
  assert.equal(s.overlappingPaths(a.taskId, "/repo", ["t2"]).length, 1);
  s.close();
});

test("mode defaults to implement and is carried by a fork", () => {
  const s = new Store(":memory:");
  const plain = s.createTask("no mode given", [], { worktree: "/repo" });
  assert.equal(plain.mode, "implement", "the safe default");
  const exploring = s.createTask("explore", [], { worktree: "/repo", mode: "explore" });
  assert.equal(s.forkTask(exploring.taskId, { worktree: "/other" }).mode, "explore", "a fork keeps it");
  s.close();
});
