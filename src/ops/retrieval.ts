import { spawnSync } from "node:child_process";
import type { Store } from "../store/store.ts";
import type { Artifact, Task } from "../model/types.ts";

/**
 * Subject-bound retrieval.
 *
 * The governance runtime materializes bounded context, but reads through a supplied
 * filesystem root, which is not the same as binding to an immutable subject: a dirty
 * worktree supplies different bytes from the staged or branch subject. This is the bridge.
 * Nothing here reads the working tree unless the subject *is* the working tree.
 */

export type SubjectRef =
  | { kind: "staged" }
  | { kind: "commit"; rev: string }
  | { kind: "worktree" };

export interface Subject {
  ref: SubjectRef;
  /** A digest identifying the exact content this subject names. */
  digest: string;
  label: string;
}

function git(cwd: string, args: string[]): { ok: boolean; out: string; err: string } {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout ?? "", err: r.stderr ?? "" };
}

/** Resolve a subject to an immutable digest. A subject that cannot be resolved is reported. */
export function resolveSubject(cwd: string, ref: SubjectRef): Subject | { error: string } {
  if (ref.kind === "worktree") {
    return { ref, digest: "worktree:unbound", label: "live worktree (unbound)" };
  }
  if (ref.kind === "staged") {
    const tree = git(cwd, ["write-tree"]);
    if (!tree.ok) return { error: `cannot resolve the staged subject: ${tree.err.trim()}` };
    return { ref, digest: `tree:${tree.out.trim()}`, label: "staged index" };
  }
  const rev = git(cwd, ["rev-parse", `${ref.rev}^{tree}`]);
  if (!rev.ok) return { error: `cannot resolve ${ref.rev}: ${rev.err.trim()}` };
  return { ref, digest: `tree:${rev.out.trim()}`, label: ref.rev };
}

/** Read one path *at* a subject. Never falls back to the working tree. */
export function readAtSubject(
  cwd: string,
  subject: Subject,
  path: string,
): { ok: true; content: string } | { ok: false; error: string } {
  if (subject.ref.kind === "worktree") {
    const r = git(cwd, ["--no-pager", "show", `:0:${path}`]);
    return r.ok ? { ok: true, content: r.out } : { ok: false, error: r.err.trim() };
  }
  const spec =
    subject.ref.kind === "staged" ? `:0:${path}` : `${subject.ref.rev}:${path}`;
  const r = git(cwd, ["--no-pager", "show", spec]);
  if (!r.ok) return { ok: false, error: `not present at ${subject.label}: ${r.err.trim()}` };
  return { ok: true, content: r.out };
}

export interface RetrievalBudget {
  /** Budgets bind to the Task, not to one request. A new request does not reset them. */
  maxBytes: number;
  usedBytes: number;
}

export interface RetrievalResult {
  artifacts: Artifact[];
  /** Paths that did not fit, named rather than silently dropped. */
  deferred: string[];
  /** Paths that could not be read at the subject. */
  unavailable: { path: string; reason: string }[];
  budget: RetrievalBudget;
  blocked: string | null;
}

/**
 * Retrieve a set of paths at a subject, within the Task's remaining budget.
 *
 * Mandatory paths are never dropped: if they do not fit, the retrieval returns a blocker
 * rather than quietly omitting something the Task required. Everything else defers, and the
 * worker asks for more through a bounded read.
 */
export function retrieve(
  store: Store,
  cwd: string,
  subject: Subject,
  paths: string[],
  budget: RetrievalBudget,
  opts: { mandatory?: string[] } = {},
): RetrievalResult {
  const mandatory = new Set(opts.mandatory ?? []);
  const artifacts: Artifact[] = [];
  const deferred: string[] = [];
  const unavailable: { path: string; reason: string }[] = [];
  let used = budget.usedBytes;

  // Mandatory first, so budget pressure never silently costs a required item.
  const ordered = [...paths].sort((a, b) => Number(mandatory.has(b)) - Number(mandatory.has(a)));

  for (const path of ordered) {
    const read = readAtSubject(cwd, subject, path);
    if (!read.ok) {
      unavailable.push({ path, reason: read.error });
      continue;
    }
    const bytes = Buffer.byteLength(read.content);
    if (used + bytes > budget.maxBytes) {
      if (mandatory.has(path)) {
        return {
          artifacts, deferred, unavailable,
          budget: { ...budget, usedBytes: used },
          blocked: `mandatory context does not fit the task budget: ${path} needs ${bytes} bytes, ${Math.max(0, budget.maxBytes - used)} of ${budget.maxBytes} remain`,
        };
      }
      deferred.push(path);
      continue;
    }
    used += bytes;
    artifacts.push(
      store.putArtifact({
        kind: "snapshot",
        subject: subject.digest,
        path,
        inline: read.content,
        bytes,
        provenance: "observed",
      }),
    );
  }

  return {
    artifacts, deferred, unavailable,
    budget: { ...budget, usedBytes: used },
    blocked: null,
  };
}

/**
 * A Task with no changed paths still needs context. Impacted-change selection cannot locate
 * an edit that does not exist yet, so a task with no diff routes by its declared scope.
 */
export function routeByDeclaredTarget(task: Task): string[] {
  return task.items.filter((i) => !i.revoked && i.kind === "scope").map((i) => i.body);
}

/** Paths changed between a subject and its parent, when there is a diff to work from. */
export function changedPaths(cwd: string, subject: Subject): string[] {
  const args =
    subject.ref.kind === "staged"
      ? ["diff", "--cached", "--name-only"]
      : subject.ref.kind === "commit"
        ? ["diff", "--name-only", `${subject.ref.rev}~1`, subject.ref.rev]
        : ["diff", "--name-only"];
  const r = git(cwd, args);
  return r.ok ? r.out.split("\n").map((s) => s.trim()).filter(Boolean) : [];
}
