import { spawnSync } from "node:child_process";
import { resolve, join, isAbsolute } from "node:path";
import { statSync, realpathSync } from "node:fs";
export function defaultDbPath(cwd: string): string {
    const r = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd, encoding: "utf8" });
    return r.status === 0 ? join(isAbsolute(r.stdout.trim()) ? r.stdout.trim() : resolve(cwd, r.stdout.trim()), "harness", "harness.db") : resolve(cwd, ".harness", "harness.db");
}
export interface WorkContext {
    worktree: string;
    branch: string | null;
    locator: string;
}
export function workContext(cwd: string): WorkContext {
    const git = (args: string[]) => spawnSync("git", args, { cwd, encoding: "utf8" });
    const top = git(["rev-parse", "--show-toplevel"]), branch = git(["symbolic-ref", "--short", "-q", "HEAD"]), admin = git(["rev-parse", "--absolute-git-dir"]);
    const worktree = realpathSync(top.status === 0 ? top.stdout.trim() : cwd);
    const st = statSync(admin.status === 0 ? admin.stdout.trim() : worktree);
    // The local filesystem identity survives path moves and changes on checkout recreation.
    return { worktree, branch: branch.status === 0 ? branch.stdout.trim() : null, locator: `fs:${st.dev}:${st.ino}:${st.birthtimeMs}` };
}
/** Missing host identity is unknown. A subprocess PID is never a conversation identity. */
export function sessionId(explicit?: string): string | null {
    return explicit?.trim() || process.env["HARNESS_SESSION"]?.trim() || process.env["CODEX_THREAD_ID"]?.trim() || null;
}
