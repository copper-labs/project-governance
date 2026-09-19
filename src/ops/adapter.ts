import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * The host adapter.
 *
 * The harness is not something the operator types at: the host calls it. This writes one
 * marked block into a repository's agent instruction file telling the host to do that.
 *
 * The block is thin on purpose - routing only, no policy, no taxonomy, no thresholds - and
 * it is generated from a single source so the supported hosts cannot drift apart.
 */

export const BEGIN = "<!-- harness:begin -->";
export const END = "<!-- harness:end -->";

export function adapterBlock(): string {
  return `${BEGIN}
## Harness

This repository has a harness. It remembers what a job is for, fetches exact file versions,
runs checks and keeps their receipts, so work survives a session ending.

**At the start of a session**, run \`harness task list\`. If a job is open, continue it rather
than starting over — it holds the objective, the constraints and what has already been ruled out.

**When the operator gives you a new job**, record it before exploring anything:

\`\`\`sh
harness task create --outcome "<what they asked for, in their words>" \\
  [--constraint "<any limit they stated, such as 'do not change code'>"]... \\
  --scope "$PWD"
\`\`\`

Keep the returned \`taskId\` for the rest of the session.

**Then, instead of working directly:**

| Instead of | Do this | Why |
| --- | --- | --- |
| Reading files ad hoc | \`harness context get --task <id> --at staged --path <p>\` | Gives the exact version, and tracks the budget across the job |
| Running tests or checks yourself | \`harness check run --task <id> --claim "<what this tests>" -- <command>\` | Keeps the receipt, so nothing is re-run to find out what happened |
| Holding findings in your head | \`harness task revise --task <id> --note "<what you established>"\` | Survives this session ending |
| Assuming a dead end is forgotten | \`harness task revise --task <id> --ruled-out "<what and why>"\` | Carried into any branched thread, so nobody pays for it twice |

**If this conversation is exploring rather than implementing** — working out an approach, writing a
spec or a plan, getting up to speed — create the job with \`--exploring\`. It will not raise or
receive file-overlap warnings, because a job that changes nothing cannot collide with one that does.

**If implementation is about to start in a branched conversation that shares this folder**, say so
to the operator and suggest a new worktree. Two threads writing to one folder on one branch can
overwrite each other and git cannot help; a worktree costs a checkout and removes the problem
entirely. Sharing a folder is fine for exploring, and risky for implementing.

**If you are warned that another session has touched a file you are about to change**, stop and
confirm with the operator rather than proceeding. The warning means exactly what it says: it is
awareness, not a lock, and nothing prevents the overwrite but you.

**If the operator branches this conversation**, or you are working in a different git worktree of
this repository, run \`harness task list --all\` to see jobs from sibling worktrees, then
\`harness task fork --task <id>\` to carry their constraints and ruled-out findings into this one.
The store is shared across every worktree of a repository, so branched work is never blind.

**If the operator changes what they want**, revise the job rather than carrying on:
\`harness task revise --task <id> --constraint "<their new instruction>"\`.

**You still do all the editing.** The harness never writes to the working tree. It will refuse
work outside the job's declared scope, and that refusal is correct — widen the scope explicitly
with the operator rather than working around it.

If \`harness\` is not on PATH, it is at \`~/ORGANTA/project-harness/bin/harness\`.
${END}`;
}

export interface InitResult {
  file: string;
  action: "created" | "updated" | "unchanged";
}

/**
 * Idempotent: replaces only what is between the markers and never touches authored content
 * around them. Running it twice changes nothing the second time.
 */
export function writeAdapter(repoRoot: string, fileName: string): InitResult {
  const path = join(repoRoot, fileName);
  const block = adapterBlock();

  if (!existsSync(path)) {
    writeFileSync(path, `# Agent Instructions\n\n${block}\n`);
    return { file: fileName, action: "created" };
  }

  const existing = readFileSync(path, "utf8");
  const start = existing.indexOf(BEGIN);
  const end = existing.indexOf(END);

  if (start === -1 || end === -1) {
    const trimmed = existing.replace(/\s+$/, "");
    writeFileSync(path, `${trimmed}\n\n${block}\n`);
    return { file: fileName, action: "updated" };
  }

  const before = existing.slice(0, start);
  const after = existing.slice(end + END.length);
  const next = `${before}${block}${after}`;
  if (next === existing) return { file: fileName, action: "unchanged" };
  writeFileSync(path, next);
  return { file: fileName, action: "updated" };
}

/** The instruction files the supported hosts read. Only ones already present are touched. */
export const HOST_FILES = ["AGENTS.md", "CODEX.md", "CLAUDE.md"] as const;

export function initRepo(repoRoot: string, only?: string[]): InitResult[] {
  const targets = only?.length
    ? only
    : HOST_FILES.filter((f) => existsSync(join(repoRoot, f)));
  // A repository with no instruction file at all still needs one.
  return (targets.length ? targets : ["AGENTS.md"]).map((f) => writeAdapter(repoRoot, f));
}
