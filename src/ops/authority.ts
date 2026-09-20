import { realpathSync, existsSync } from "node:fs";
import { resolve, relative, isAbsolute, dirname } from "node:path";
import type { Operation, Task } from "../model/types.ts";
export interface AuthorityRequest {
    operation: Operation;
    scope: string[];
    destination: string | null;
    policyRevision: string;
    targets: string[];
}
export interface Policy {
    revision: string;
    allowedOperations: Operation[];
}
export type AuthorityVerdict = {
    ok: true;
} | {
    ok: false;
    reason: string;
};
export function resolveTarget(target: string, root: string): string {
    const absolute = isAbsolute(target) ? target : resolve(root, target);
    let probe = absolute;
    const suffix: string[] = [];
    while (!existsSync(probe) && dirname(probe) !== probe) {
        suffix.unshift(probe.slice(dirname(probe).length + 1));
        probe = dirname(probe);
    }
    const real = existsSync(probe) ? realpathSync(probe) : probe;
    return suffix.length ? resolve(real, ...suffix) : real;
}
export function withinScope(target: string, scope: string[], root: string): boolean {
    const resolved = resolveTarget(target, root);
    return scope.some(s => { const base = resolveTarget(s, root), rel = relative(base, resolved); return rel === "" || (!rel.startsWith("../") && rel !== ".." && !isAbsolute(rel)); });
}
/** Host-reported declaration checks, not a subprocess sandbox or natural-language interpreter. */
export function authorize(req: AuthorityRequest, policy: Policy, task: Task, root: string): AuthorityVerdict {
    if (policy.revision !== req.policyRevision)
        return { ok: false, reason: "stale policy revision" };
    if (!policy.allowedOperations.includes(req.operation))
        return { ok: false, reason: `operation '${req.operation}' is not permitted` };
    if (task.status !== "open")
        return { ok: false, reason: `task is ${task.status}` };
    if (req.destination !== null)
        return { ok: false, reason: "external transmission is not a core operation" };
    const scopes = task.items.filter(i => !i.revoked && i.kind === "scope").map(i => i.body);
    if (!scopes.length || !req.scope.length)
        return { ok: false, reason: "explicit task and action scope required" };
    if (req.scope.some(s => !withinScope(s, scopes, root)))
        return { ok: false, reason: "action exceeds the task's scope" };
    if (req.targets.some(t => !withinScope(t, req.scope, root)))
        return { ok: false, reason: "target outside declared scope" };
    const denied = task.items.find(i => !i.revoked && i.kind === "constraint" && i.body === `deny:${req.operation}`);
    return denied ? { ok: false, reason: `structured constraint ${denied.body}` } : { ok: true };
}
export function defaultPolicy(revision = "policy-2"): Policy { return { revision, allowedOperations: ["read", "check", "record"] }; }
