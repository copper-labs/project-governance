import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { Store } from "../store/store.ts";

/**
 * Concurrent sessions in one worktree.
 *
 * "Fork in this workspace" gives two conversations one folder and one branch. That is a
 * deliberate, cheap choice, so the answer here is detection rather than a lock: the harness
 * does not write files and cannot prevent two agents editing the same one. What it can do is
 * notice quickly and say so, instead of leaving the collision to be discovered later.
 */

/** A fingerprint of the working tree: HEAD plus everything modified or staged. */
export function treeDigest(cwd: string): string | null {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" });
  const status = spawnSync("git", ["status", "--porcelain=v1"], { cwd, encoding: "utf8" });
  if (head.status !== 0 || status.status !== 0) return null;
  return (
    "tree:" +
    createHash("sha256").update(head.stdout.trim() + "\u0000" + status.stdout).digest("hex").slice(0, 16)
  );
}

export interface OtherSession {
  session: string;
  taskId: string | null;
  outcome: string | null;
  lastSeen: string;
  minutesAgo: number;
}

export interface ConcurrencyReport {
  /** Sessions other than this one, recently active in the same worktree. */
  others: OtherSession[];
  /** Paths this job has touched that another active session's job has also touched. */
  overlappingPaths: { path: string; session: string; taskId: string }[];
  /** True when the working tree changed since this session last acted here. */
  treeChangedSinceYouLastActed: boolean;
  warning: string | null;
}

const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

export function report(
  store: Store,
  opts: { session: string; worktree: string; taskId: string | null; cwd: string },
): ConcurrencyReport {
  const now = Date.now();
  const digest = treeDigest(opts.cwd);
  const previous = store.readActivity(opts.session, opts.worktree);
  const treeChanged =
    previous?.treeDigest != null && digest != null && previous.treeDigest !== digest;

  const others = store
    .activeSessions(opts.worktree, opts.session, new Date(now - ACTIVE_WINDOW_MS).toISOString())
    .map((a) => ({
      session: a.session,
      taskId: a.taskId,
      outcome: a.taskId ? (store.readTask(a.taskId)?.outcome ?? null) : null,
      lastSeen: a.lastSeen,
      minutesAgo: Math.max(0, Math.round((now - Date.parse(a.lastSeen)) / 60000)),
    }));

  const overlappingPaths = opts.taskId
    ? store.overlappingPaths(opts.taskId, opts.worktree, others.map((o) => o.session))
    : [];

  let warning: string | null = null;
  if (overlappingPaths.length) {
    const names = [...new Set(overlappingPaths.map((p) => p.path))].slice(0, 5);
    warning =
      `Another active session in this worktree has touched ${names.join(", ")}. ` +
      `You share one folder and one branch, so edits can overwrite each other. ` +
      `Confirm with the operator before changing those files.`;
  } else if (treeChanged) {
    warning =
      `The working tree changed since your last action and you did not cause it. ` +
      `Another session is probably editing here. Re-read anything you are about to change.`;
  } else if (others.length) {
    warning =
      `${others.length} other session(s) active in this worktree. No file overlap detected yet.`;
  }

  return { others, overlappingPaths, treeChangedSinceYouLastActed: treeChanged, warning };
}

/** Called after every command, so the next session's report is accurate. */
export function touch(
  store: Store,
  opts: { session: string; worktree: string; taskId: string | null; cwd: string },
): void {
  store.recordActivity({
    session: opts.session,
    worktree: opts.worktree,
    taskId: opts.taskId,
    treeDigest: treeDigest(opts.cwd),
  });
}
