import { readFileSync, writeFileSync, existsSync, lstatSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
export const BEGIN = "<!-- harness:begin -->", END = "<!-- harness:end -->";
export function adapterBlock(): string {
    return `${BEGIN}
## Harness continuity

Use the installed \`harness\` CLI at coherent task boundaries. The host owns reasoning,
authorization and editing; this runtime never edits product source or sandboxes commands.

- Start with \`harness resume --task <id> --session <stable-host-session-id>\` for a known task.
  Without a known task, use \`harness task list\`; do not assume another open job is yours.
- For new work, use \`harness task create --outcome "..." --scope "$PWD"\`, then resume it.
  Add stated constraints. Operator provenance is a host report, not independent authentication.
- Use \`harness context get --task <id> --path <file>\` when exact source/evidence matters.
  The default is live worktree bytes. Choose \`--at staged\` or a commit explicitly for review.
  Native reads remain available; register important read dependencies with \`harness paths\`.
- Use \`harness check run --task <id> --request-file <batch.json> --authority-ref <host-reference>\`
  for a declared governance batch. It uses the existing executor, which owns effects and cleanup.
  Observe with \`harness check result --action <id>\`; uncertain submission must not be replayed.
- At a handoff, use \`harness checkpoint --task <id> --summary "..." --next "..."\`.
  Keep findings attributable. A failed approach applies to its original inputs, not forever.
- Register intended edits with \`harness paths --task <id> --mode write --path <file>\`.
  Coordinate overlaps; worktrees isolate checkout files, not shared devices or services.
- Continuing the same objective elsewhere uses resume. A new objective can use task fork.
  After merge/rebase, use reconcile; old passing evidence does not certify the combined result.

If the harness is unavailable, use the normal host/governance workflow and state the coverage gap.
Task constraints, external effects and approvals remain governed by the host and project policy.
${END}`;
}
export interface InitResult {
    file: string;
    action: "created" | "updated" | "unchanged";
}
export const HOST_FILES = ["AGENTS.md", "CLAUDE.md"] as const;
export function writeAdapter(repoRoot: string, fileName: string): InitResult {
    if (!HOST_FILES.includes(fileName as typeof HOST_FILES[number]))
        throw new Error("only AGENTS.md and CLAUDE.md are supported installation targets");
    const path = join(repoRoot, fileName);
    if (existsSync(path) && lstatSync(path).isSymbolicLink())
        throw new Error("instruction file is a symlink; installation must be performed by its owner");
    const exists = existsSync(path), old = exists ? readFileSync(path, "utf8") : "# Agent Instructions\n";
    const starts = old.split(BEGIN).length - 1, ends = old.split(END).length - 1;
    if (starts !== ends || starts > 1 || (starts === 1 && old.indexOf(END) < old.indexOf(BEGIN)))
        throw new Error("malformed harness markers; preserve authored content and repair explicitly");
    const next = starts ? old.slice(0, old.indexOf(BEGIN)) + adapterBlock() + old.slice(old.indexOf(END) + END.length) : old + "\n" + adapterBlock() + "\n";
    if (next === old)
        return { file: fileName, action: "unchanged" };
    const tmp = join(repoRoot, `.harness-install-${randomUUID()}`);
    writeFileSync(tmp, next, { mode: exists ? statSync(path).mode : 0o644, flag: "wx" });
    renameSync(tmp, path);
    return { file: fileName, action: exists ? "updated" : "created" };
}
export function initRepo(repoRoot: string, only?: string[]): InitResult[] {
    const targets = only?.length ? only : HOST_FILES.filter(f => existsSync(join(repoRoot, f)));
    return (targets.length ? targets : ["AGENTS.md"]).map(f => writeAdapter(repoRoot, f));
}
