import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { narrativeFile } from "./narrative-inputs.ts";
import type { Readable } from "node:stream";
import { readPushRefUpdate } from "./push-ref-input.ts";

export const GIT_HOOKS = ["commit-msg", "pre-commit", "pre-push", "pre-pr"] as const;
export type GitHook = typeof GIT_HOOKS[number];

/** Thin launchers resolve only the installed entry point; Git gates never install or update. */
export function gitHookLauncher(hook: GitHook): string {
  if (!GIT_HOOKS.includes(hook)) throw new Error("Unsupported Git hook");
  return `#!/bin/sh
# Managed Project Governance hook: use the already-installed runtime.
set -eu
runtime=".governance/runtime/bin/project-governance"
if [ ! -x "$runtime" ]; then
  echo "Governance runtime is unavailable. Restore the pinned installation before retrying." >&2
  exit 1
fi
exec "$runtime" hook ${hook} "$@"
`;
}

/** Resolve Git metadata through Git itself so linked worktrees never share PR drafts. */
function metadataPath(root: string, name: string): string {
  return execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-path", name],
    { cwd: root, encoding: "utf8", timeout: 5000, maxBuffer: 16384, stdio: ["ignore", "pipe", "pipe"] }).trim();
}

const commitOid = (value: string) => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value) && !/^0+$/u.test(value);
function pushGit(root: string, args: string[]): string {
  try { return execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 5000, maxBuffer: 16384,
    stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_NO_REPLACE_OBJECTS: "1" } }).trim(); }
  catch { throw new Error("Pre-push commit input is unavailable"); }
}
function exactPushCommit(root: string, oid: string): string {
  if (!commitOid(oid) || pushGit(root, ["cat-file", "-t", oid]) !== "commit") throw new Error("Pre-push requires an exact commit object");
  return oid;
}
function resolvedPushCommit(root: string, ref: string): string {
  return exactPushCommit(root, pushGit(root, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]));
}
function pushComparisonBase(root: string, environment: NodeJS.ProcessEnv): string {
  return resolvedPushCommit(root, environment.GOVERNANCE_BASE_REF?.trim() || "@{upstream}");
}
function pushCheckArguments(candidate: string, base: string): string[] {
  return ["--summary", "--stage", "pre-push", "--mode", "impacted", "--candidate-ref", candidate, "--base-ref", base];
}

/** Actual Git pushes supply immutable endpoints; remote names and locations never enter the check request. */
export async function prePushCheckArguments(root: string, args: string[], input: Readable = process.stdin, environment: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  if (!args.length) return hookCheckArguments(root, "pre-push", args, environment);
  if (args.length !== 2) throw new Error("pre-push expects Git's remote name and location");
  const update = await readPushRefUpdate(input);
  return pushCheckArguments(exactPushCommit(root, update.candidate), update.remote ? exactPushCommit(root, update.remote) : pushComparisonBase(root, environment));
}

/** Hook inputs choose a fixed check boundary, not arbitrary runtime commands or install actions. */
export function hookCheckArguments(root: string, hook: string, args: string[], environment: NodeJS.ProcessEnv = process.env): string[] {
  switch (hook) {
    case "commit-msg":
      if (args.length !== 1 || !args[0]) throw new Error("commit-msg requires Git's message path");
      return ["--summary", "--stage", hook, "--mode", "impacted", "--commit-message-file", args[0]];
    case "pre-commit":
      if (args.length) throw new Error("pre-commit takes no arguments");
      return ["--summary", "--stage", hook, "--mode", "impacted", "--staged"];
    case "pre-push":
      if (args.length) throw new Error("Native pre-push requires captured Git ref input");
      return pushCheckArguments(resolvedPushCommit(root, "HEAD"), pushComparisonBase(root, environment));
    case "pre-pr": {
      const { values } = parseArgs({ args, strict: true, allowPositionals: false,
        options: { "pr-body-file": { type: "string" }, "pr-title": { type: "string" } } });
      const body = values["pr-body-file"], title = values["pr-title"];
      if ((body === undefined) !== (title === undefined)) throw new Error("PR body and title must be supplied together");
      if (args.length !== 0 && args.length !== 4) throw new Error("Expected one PR body and one title");
      const bodyPath = body ?? (environment.PROJECT_GOVERNANCE_PR_BODY_FILE?.trim() || metadataPath(root, "PR_DESCRIPTION.md"));
      const titleText = title ?? environment.PROJECT_GOVERNANCE_PR_TITLE ?? narrativeFile(root, metadataPath(root, "PR_TITLE"));
      return ["--summary", "--pack", "pr-description", "--stage", hook, "--mode", "all", "--pr-body-file", bodyPath, "--pr-title", titleText];
    }
    default: throw new Error("Unsupported Git hook");
  }
}
