import { execFileSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { join } from "node:path";
import { digest } from "./core.ts";
import { worktreeBytes } from "./change-subject.ts";

export interface CoworkCommitBinding {
  workspace: string; taskId: string; session: string; branch: string; parent: string | null;
  selected: Array<{ path: string; blob: string | null; mode: string | null }>;
  unrelatedIndex: string; unrelatedFiles: string;
}
const query = (root: string, ...args: string[]) => execFileSync("git", args, { cwd: root,
  env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_REPLACE_OBJECTS: "1" }, timeout: 10_000,
  maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
const names = (bytes: Buffer) => new TextDecoder("utf-8", { fatal: true }).decode(bytes).split("\0").filter(Boolean);

export function unrelatedCommitState(root: string, selected: string[]) {
  const excluded = new Set(selected);
  const index = names(query(root, "ls-files", "--stage", "-z")).filter(row => !excluded.has(row.slice(row.indexOf("\t") + 1)));
  const changed = [...new Set([...names(query(root, "diff", "--name-only", "--no-renames", "-z")),
    ...names(query(root, "diff", "--cached", "--name-only", "--no-renames", "-z")),
    ...names(query(root, "ls-files", "--others", "--exclude-standard", "-z"))])].filter(path => !excluded.has(path)).sort();
  if (changed.length > 2048) throw new Error("cowork-commit-inventory-too-large");
  let bytes = 0;
  const files = changed.map(path => {
    const info = lstatSync(join(root, path), { throwIfNoEntry: false });
    if (!info) return { path, absent: true };
    // Unrelated large files and directories are observations, not selected commit inputs.
    const metadata = { path, mode: info.mode, size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs, ino: info.ino };
    if ((!info.isFile() && !info.isSymbolicLink()) || info.size > 16 * 1024 * 1024 || bytes + info.size > 64 * 1024 * 1024)
      return { ...metadata, observation: "metadata-only" };
    try {
      const content = worktreeBytes(root, path, 16 * 1024 * 1024);
      bytes += content.bytes.length;
      return { path, mode: info.mode & 0o7777, identity: digest(content.bytes.toString("base64")) };
    } catch { return { ...metadata, observation: "metadata-only" }; }
  });
  return { unrelatedIndex: digest(index), unrelatedFiles: digest(files) };
}

/** Resolve only the original first-parent child; later commits cannot be mistaken for this action. */
export function originalCoworkCommit(binding: CoworkCommitBinding): string {
  const chain = query(binding.workspace, "rev-list", "--first-parent", "--max-count=4096", binding.branch).toString("utf8").trim().split("\n").filter(Boolean);
  if (binding.parent === null) {
    const candidate = chain.at(-1);
    if (!candidate || query(binding.workspace, "show", "-s", "--format=%P", candidate).toString("utf8").trim())
      throw new Error("cowork-commit-original-unresolved");
    return candidate;
  }
  const index = chain.indexOf(binding.parent);
  if (index < 1) throw new Error("cowork-commit-original-unresolved");
  return chain[index - 1]!;
}
export function verifyCoworkCommitTree(binding: CoworkCommitBinding, commit: string) {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(commit)) throw new Error("cowork-commit-id-invalid");
  const text = (...args: string[]) => query(binding.workspace, ...args).toString("utf8").trim();
  const parents = text("show", "-s", "--format=%P", commit).split(" ").filter(Boolean);
  if (binding.parent === null ? parents.length !== 0 : parents.length !== 1 || parents[0] !== binding.parent)
    throw new Error("cowork-commit-parent-mismatch");
  const changed = names(query(binding.workspace, "diff-tree", "--root", "--no-commit-id", "--no-renames", "--name-only", "-r", "-z", commit));
  if (changed.some(path => !binding.selected.some(item => item.path === path))) throw new Error("cowork-commit-extra-paths");
  for (const item of binding.selected) {
    const entries = names(query(binding.workspace, "ls-tree", "-z", commit, "--", `:(literal)${item.path}`));
    if (item.blob === null) { if (entries.length) throw new Error("cowork-commit-delete-mismatch"); }
    else if (entries.length !== 1 || entries[0] !== `${item.mode} blob ${item.blob}\t${item.path}`)
      throw new Error("cowork-commit-tree-mismatch");
  }
  return commit;
}

/** Runs in the original command owner immediately after Git exits, not at a later status poll. */
export function finalizeCoworkCommit(binding: CoworkCommitBinding): { status: "committed"; commit: string; preservation: string } {
  if (query(binding.workspace, "symbolic-ref", "--quiet", "HEAD").toString("utf8").trim() !== binding.branch)
    throw new Error("cowork-commit-branch-changed");
  const commit = verifyCoworkCommitTree(binding, originalCoworkCommit(binding));
  const after = unrelatedCommitState(binding.workspace, binding.selected.map(item => item.path));
  if (after.unrelatedIndex !== binding.unrelatedIndex)
    throw new Error("cowork-commit-unrelated-state-changed");
  return { status: "committed", commit, preservation: after.unrelatedFiles === binding.unrelatedFiles ? "unchanged" : "worktree-changed-during-commit" };
}

/** A clean rejection is retryable only when Git did not advance and unrelated state is intact. */
export function rejectedCoworkCommit(binding: CoworkCommitBinding): { status: "not-committed"; intent_to_add: string[]; preservation?: string } {
  const branch = query(binding.workspace, "symbolic-ref", "--quiet", "HEAD").toString("utf8").trim();
  if (branch !== binding.branch) throw new Error("cowork-commit-branch-changed");
  const refs = query(binding.workspace, "for-each-ref", "--format=%(objectname)", binding.branch).toString("utf8").trim();
  if ((refs || null) !== binding.parent) throw new Error("cowork-commit-head-changed");
  const after = unrelatedCommitState(binding.workspace, binding.selected.map(item => item.path));
  if (after.unrelatedIndex !== binding.unrelatedIndex)
    throw new Error("cowork-commit-unrelated-state-changed");
  const normal = new Set(names(query(binding.workspace, "diff", "--cached", "--name-only", "-z", "--ita-visible-in-index")));
  const hidden = new Set(names(query(binding.workspace, "diff", "--cached", "--name-only", "-z", "--ita-invisible-in-index")));
  return { status: "not-committed", ...(after.unrelatedFiles !== binding.unrelatedFiles ? { preservation: "worktree-changed-during-commit" } : {}), intent_to_add: binding.selected.map(item => item.path).filter(path => normal.has(path) && !hidden.has(path)) };
}
