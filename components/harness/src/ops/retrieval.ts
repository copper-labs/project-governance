import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { relative, resolve, isAbsolute } from "node:path";
import { contentAddress, type Store } from "../store/store.ts";
import type { Artifact } from "../model/types.ts";
import { withinScope } from "./authority.ts";
export type SubjectRef = {
    kind: "staged";
} | {
    kind: "commit";
    rev: string;
} | {
    kind: "worktree";
};
export interface Subject {
    ref: SubjectRef;
    digest: string;
    label: string;
    tree?: string;
}
function git(cwd: string, args: string[]) {
    const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    return { ok: r.status === 0, out: r.stdout ?? "", err: r.stderr ?? String(r.error ?? "") };
}
export function resolveSubject(cwd: string, ref: SubjectRef): Subject | {
    error: string;
} {
    if (ref.kind === "worktree")
        return { ref, digest: "worktree:per-file", label: "live worktree; each artifact binds its bytes" };
    const r = ref.kind === "staged" ? git(cwd, ["write-tree"]) : git(cwd, ["rev-parse", "--verify", "--end-of-options", `${ref.rev}^{tree}`]);
    if (!r.ok || !/^[a-f0-9]{40,64}$/.test(r.out.trim()))
        return { error: `cannot resolve subject: ${r.err.trim()}` };
    return { ref, tree: r.out.trim(), digest: `tree:${r.out.trim()}`, label: ref.kind === "staged" ? "staged index" : ref.rev };
}
export function canonicalPath(cwd: string, path: string): string {
    const rel = relative(cwd, resolve(cwd, path));
    if (!rel || rel === ".." || rel.startsWith("../") || isAbsolute(rel) || rel.includes("\0"))
        throw new Error(`path must name a file inside the workspace: ${path}`);
    return rel.split("\\").join("/");
}
export function readAtSubject(cwd: string, subject: Subject, path: string): {
    ok: true;
    content: string;
} | {
    ok: false;
    error: string;
} {
    try {
        const p = canonicalPath(cwd, path);
        if (subject.ref.kind === "worktree") {
            if (!withinScope(p, [cwd], cwd))
                throw new Error("symlink escapes workspace");
            const target = resolve(cwd, p), before = statSync(target);
            if (!before.isFile() || before.size > 32 * 1024 * 1024)
                throw new Error("not a bounded regular file");
            const bytes = readFileSync(target), after = statSync(target);
            if (before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs)
                throw new Error("file changed during read; retry");
            const content = bytes.toString("utf8");
            if (!Buffer.from(content).equals(bytes) || content.includes("\0"))
                throw new Error("binary content is not a text artifact");
            return { ok: true, content };
        }
        if (!subject.tree)
            throw new Error("immutable tree is missing");
        const type = git(cwd, ["cat-file", "-t", `${subject.tree}:${p}`]);
        if (!type.ok || type.out.trim() !== "blob")
            return { ok: false, error: "not a file blob at the pinned tree" };
        const r = spawnSync("git", ["show", `${subject.tree}:${p}`], { cwd, maxBuffer: 32 * 1024 * 1024 });
        if (r.status !== 0 || r.error)
            return { ok: false, error: "pinned blob unavailable or exceeds limit" };
        const content = r.stdout.toString("utf8");
        if (!Buffer.from(content).equals(r.stdout) || content.includes("\0"))
            return { ok: false, error: "binary content is not a text artifact" };
        return { ok: true, content };
    }
    catch (error) {
        return { ok: false, error: (error as Error).message };
    }
}
export interface RetrievalBudget {
    maxBytes: number;
    usedBytes: number;
}
export interface RetrievalResult {
    artifacts: Artifact[];
    deferred: string[];
    unavailable: {
        path: string;
        reason: string;
    }[];
    budget: RetrievalBudget;
    blocked: string | null;
}
export function retrieve(store: Store, cwd: string, subject: Subject, paths: string[], budget: RetrievalBudget, opts: {
    mandatory?: string[];
    taskId?: string;
    scope?: string[];
} = {}): RetrievalResult {
    if (!Number.isSafeInteger(budget.maxBytes) || budget.maxBytes < 0 || !Number.isSafeInteger(budget.usedBytes) || budget.usedBytes < 0)
        throw new Error("invalid retrieval budget");
    const mandatory = new Set((opts.mandatory ?? []).map(p => canonicalPath(cwd, p)));
    const ordered = [...new Set([...mandatory, ...paths.map(p => canonicalPath(cwd, p))])];
    const current = opts.taskId ? store.budget(opts.taskId) : undefined;
    const max = current?.ceiling ?? budget.maxBytes, prior = current?.used ?? budget.usedBytes;
    const result: RetrievalResult = { artifacts: [], deferred: [], unavailable: [], budget: { maxBytes: max, usedBytes: prior }, blocked: null };
    const pending: {
        path: string;
        content: string;
        bytes: number;
    }[] = [];
    let bytes = 0;
    for (const path of ordered) {
        const read = opts.scope && !withinScope(path, opts.scope, cwd)
            ? { ok: false as const, error: "outside task scope" } : readAtSubject(cwd, subject, path);
        if (!read.ok) {
            result.unavailable.push({ path, reason: read.error });
            if (mandatory.has(path))
                result.blocked = `required context unavailable: ${path}`;
            continue;
        }
        const n = Buffer.byteLength(read.content);
        if (prior + bytes + n > max) {
            if (mandatory.has(path))
                result.blocked = `mandatory context does not fit: ${path}; expand the task budget explicitly`;
            else
                result.deferred.push(path);
            continue;
        }
        bytes += n;
        pending.push({ path, content: read.content, bytes: n });
    }
    if (result.blocked)
        return result;
    const reserved = opts.taskId ? store.reserveBytes(opts.taskId, bytes, max) : { ceiling: max, used: prior + bytes };
    if (!reserved) {
        result.blocked = "concurrent retrieval spent the remaining budget; retry or expand";
        return result;
    }
    for (const p of pending) {
        const artifact = store.putArtifact({ kind: "snapshot", subject: subject.ref.kind === "worktree" ? `worktree:${contentAddress(p.content)}` : subject.digest, path: p.path, inline: p.content, bytes: p.bytes, provenance: "observed" });
        if (opts.taskId)
            store.linkArtifact(opts.taskId, artifact.artifactId);
        result.artifacts.push(artifact);
    }
    result.budget = { maxBytes: reserved.ceiling, usedBytes: reserved.used };
    return result;
}
/** Clean tasks get a bounded discovery list, not a directory passed to git show. */
export function discoverPaths(cwd: string, subject: Subject, scope: string[]): string[] {
    const r = subject.tree ? git(cwd, ["ls-tree", "-r", "--name-only", "-z", subject.tree]) : git(cwd, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
    if (!r.ok)
        return [];
    return [...new Set(r.out.split("\0").filter(p => p && withinScope(p, scope, cwd)))].sort().slice(0, 40);
}
