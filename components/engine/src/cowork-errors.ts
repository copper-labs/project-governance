import { SourceReadLimitError } from "./change-subject.ts";

/** Return only fixed diagnostics; never expose parser input or private paths. */
export function coworkErrorCode(error: unknown): string {
  if (error instanceof SourceReadLimitError) return "cowork-file-too-large";
  if (!(error instanceof Error)) return "cowork-operation-failed";
  if (/^cowork-[a-z0-9-]+$/u.test(error.message)) return error.message;
  if (error.message.startsWith("Git has an active operation: ")) return "cowork-git-operation-active";
  const known: Record<string, string> = {
    "Git operation has unresolved conflicts": "cowork-git-conflicts",
    "Git operation requires a branch": "cowork-git-branch-required",
    "Git operation cannot use redirected state": "cowork-git-redirected-state",
    "Git operation requires worktree root": "cowork-git-worktree-root-required",
  };
  return known[error.message] ?? "cowork-operation-failed";
}
