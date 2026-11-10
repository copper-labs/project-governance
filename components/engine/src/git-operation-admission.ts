import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";

/** Shared Git identity and in-progress-operation checks; callers own their distinct authority policies. */
export function gitOperationAdmission(workspace: string, environment: NodeJS.ProcessEnv = process.env) {
  for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GOVERNANCE_UPDATE_TOKEN"])
    if (environment[name]) throw new Error("Git operation cannot use redirected state");
  const root = realpathSync(workspace);
  const options = { cwd: root, env: { ...environment, GIT_OPTIONAL_LOCKS: "0", GIT_NO_REPLACE_OBJECTS: "1" }, timeout: 5000,
    maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"] };
  const git = (...args: string[]) => execFileSync("git", args, options);
  const text = (...args: string[]) => new TextDecoder("utf-8", { fatal: true }).decode(git(...args)).trim();
  if (realpathSync(text("rev-parse", "--show-toplevel")) !== root) throw new Error("Git operation requires worktree root");
  for (const marker of ["MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "sequencer", "index.lock", "HEAD.lock", "packed-refs.lock"])
    if (lstatSync(text("rev-parse", "--path-format=absolute", "--git-path", marker), { throwIfNoEntry: false }))
      throw new Error("Git has an active operation: " + marker);
  if (git("ls-files", "--unmerged", "-z").length) throw new Error("Git operation has unresolved conflicts");
  const branchProbe = spawnSync("git", ["symbolic-ref", "--quiet", "HEAD"], options);
  if (branchProbe.status !== 0) throw new Error("Git operation requires a branch");
  const branch = branchProbe.stdout.toString("utf8").trim();
  if (!branch.startsWith("refs/heads/")) throw new Error("Git operation requires a branch");
  const probe = spawnSync("git", ["show-ref", "--verify", "--quiet", branch], options);
  if (probe.status !== 0 && probe.status !== 1) throw new Error("Git branch identity unavailable");
  const head = probe.status === 1 ? null : text("rev-parse", "--verify", "HEAD");
  return { root, branch, head, git, text };
}
