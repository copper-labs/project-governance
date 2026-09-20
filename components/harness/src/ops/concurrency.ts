import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, lstatSync, readlinkSync } from "node:fs";
import { resolve } from "node:path";
import type { Store } from "../store/store.ts";
import { canonicalPath } from "./retrieval.ts";
import { resolveTarget, withinScope } from "./authority.ts";
export function pathDigest(cwd: string, path: string): string | null {
    try {
        const p = resolve(cwd, path), st = lstatSync(p);
        if (st.isSymbolicLink())
            return "link:" + readlinkSync(p);
        if (!st.isFile() || st.size > 32 * 1024 * 1024)
            return null;
        return "sha256:" + createHash("sha256").update(readFileSync(p)).digest("hex");
    }
    catch {
        return null;
    }
}
/** Content fingerprint for relevant Git files. Unknown if inspection exceeds the bound. */
export function treeDigest(cwd: string): string | null {
    const git = (args: string[]) => spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
    const head = git(["rev-parse", "HEAD"]), diff = git(["diff", "--raw", "--no-abbrev", "HEAD"]), files = git(["ls-files", "-z", "--modified", "--others", "--exclude-standard"]);
    if (head.status !== 0 || diff.status !== 0 || files.status !== 0)
        return null;
    const paths = [...new Set(files.stdout.split("\0").filter(Boolean))].sort();
    if (paths.length > 2000)
        return null;
    const hash = createHash("sha256").update(head.stdout).update(diff.stdout);
    let total = 0;
    for (const p of paths) {
        try {
            total += lstatSync(resolve(cwd, p)).size;
        }
        catch {
            return null;
        }
        if (total > 8 * 1024 * 1024)
            return null;
        const d = pathDigest(cwd, p);
        if (d === null)
            return null;
        hash.update(JSON.stringify([p, d]));
    }
    return "tree:" + hash.digest("hex");
}
export function recordPaths(store: Store, opts: {
    session: string;
    workspaceId: string;
    taskId: string;
    cwd: string;
    paths: string[];
    mode: "read" | "write";
}): void {
    const task = store.readTask(opts.taskId);
    if (!task)
        throw new Error("unknown task");
    const scope = task.items.filter(i => !i.revoked && i.kind === "scope").map(i => i.body);
    for (const raw of opts.paths) {
        const p = canonicalPath(opts.cwd, resolveTarget(raw, opts.cwd));
        if (!withinScope(p, scope, opts.cwd))
            throw new Error("path intent outside task scope");
        store.recordIntent(opts.session, opts.workspaceId, opts.taskId, p, opts.mode, pathDigest(opts.cwd, p));
    }
}
export function report(store: Store, opts: {
    session: string | null;
    workspaceId?: string;
    worktree: string;
    taskId: string | null;
    cwd: string;
}) {
    if (!opts.session)
        return { coverage: "unknown", warning: "No stable host session identity; concurrency coverage is unknown.", others: [], overlappingPaths: [], changedReads: [], treeChangedSinceYouLastActed: "unknown" as const };
    const previous = store.readActivity(opts.session, opts.worktree), digest = treeDigest(opts.cwd);
    const others = store.activeSessions(opts.worktree, opts.session, new Date(Date.now() - 30 * 60 * 1000).toISOString());
    const intents = opts.workspaceId ? store.intents(opts.workspaceId) : [];
    const mine = intents.filter(i => i.session === opts.session && (!opts.taskId || i.task_id === opts.taskId));
    const overlappingPaths = mine.flatMap(m => intents.filter(o => o.session !== opts.session && o.path === m.path && (o.mode === "write" || m.mode === "write")).map(o => ({ path: m.path, session: o.session, taskId: o.task_id, risk: m.mode === "write" && o.mode === "write" ? "write-overlap" : "reader-writer" })));
    const changedReads = mine.filter(i => i.mode === "read" && (i.digest === null || pathDigest(opts.cwd, i.path) !== i.digest)).map(i => i.path);
    const treeChanged: boolean | "unknown" = previous?.treeDigest != null && digest !== null ? previous.treeDigest !== digest : "unknown";
    store.recordActivity({ session: opts.session, worktree: opts.worktree, taskId: opts.taskId, treeDigest: digest });
    const warning = overlappingPaths.length ? "Cooperating sessions have overlapping read/write intentions. Coordinate writes or use separate worktrees." : changedReads.length ? "Previously read files changed or cannot be verified; refresh affected conclusions." : treeChanged === "unknown" ? "Workspace drift is unknown; no comparable bounded observation." : treeChanged ? "Workspace contents changed since the last observation; the actor is unknown." : others.length ? "Other sessions are active; only declared paths are covered." : null;
    return { coverage: "advisory; declared paths only; 30-minute activity window", warning, others, overlappingPaths, changedReads, treeChangedSinceYouLastActed: treeChanged };
}
export function touch(store: Store, opts: {
    session: string | null;
    worktree: string;
    taskId: string | null;
    cwd: string;
}): void {
    if (opts.session)
        store.recordActivity({ session: opts.session, worktree: opts.worktree, taskId: opts.taskId, treeDigest: store.readActivity(opts.session, opts.worktree)?.treeDigest ?? null });
}
