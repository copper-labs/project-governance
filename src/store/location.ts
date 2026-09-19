import { spawnSync } from "node:child_process";
import { resolve, join, isAbsolute } from "node:path";

/**
 * Where the store lives.
 *
 * A job belongs to a *repository*, not to a folder. Git worktrees are separate folders that
 * share one repository, and branching a conversation into a new worktree is a normal thing
 * to do — so putting the database beside the working files would hand every branched thread
 * an empty store, which is the exact failure this runtime exists to prevent.
 *
 * `git rev-parse --git-common-dir` resolves to the shared git directory from any worktree,
 * so every worktree of a repository finds the same store.
 */
export function defaultDbPath(cwd: string): string {
  const r = spawnSync("git", ["rev-parse", "--git-common-dir"], {
    cwd,
    encoding: "utf8",
  });
  if (r.status === 0) {
    const raw = r.stdout.trim();
    const common = isAbsolute(raw) ? raw : resolve(cwd, raw);
    return join(common, "harness", "harness.db");
  }
  // Not a git repository: fall back to the folder, which is all there is to key on.
  return resolve(cwd, ".harness", "harness.db");
}

export interface WorkContext {
  worktree: string;
  branch: string | null;
}

/** Which worktree and branch a job was started from, so a shared store stays legible. */
export function workContext(cwd: string): WorkContext {
  const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, encoding: "utf8" });
  return {
    worktree: top.status === 0 ? top.stdout.trim() : resolve(cwd),
    branch: branch.status === 0 ? branch.stdout.trim() : null,
  };
}

/**
 * Which conversation is acting.
 *
 * With one store shared by several worktrees and several agent threads, "who did this" stops
 * being obvious. The host sets HARNESS_SESSION when it can; otherwise a stable-per-process id
 * is used, which is still enough to separate concurrent threads.
 */
export function sessionId(): string {
  return process.env["HARNESS_SESSION"]?.trim() || `pid-${process.pid}`;
}
